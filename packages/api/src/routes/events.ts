import { Event } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { Rsvps } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import { Announce } from '../announce.ts';
import { Booking } from '../booking.ts';
import { Check } from '../check.ts';
import { Codes } from '../codes.ts';
import type { Env } from '../context.ts';
import { Csv } from '../csv.ts';
import { Fail, Refusal } from '../fail.ts';
import { Guard } from '../guard.ts';
import { Ical } from '../ical.ts';
import { Input } from '../input.ts';
import { Trail } from '../trail.ts';
import { Wire } from '../wire.ts';
import { Kinds } from './kinds.ts';

/**
 * Events, the answers to them, and the people at them who are not members.
 *
 * Four rules recur and are enforced in one place each: what a member may see (`Event.visibleTo`,
 * since a draft belongs to its organiser), what a member may still answer (`Booking`, which owns
 * the deadline, the capacity and the waitlist), what an id is (`Input.params`, so no handler casts
 * a path segment), and what publishing owes people (`Announce`, which queues it).
 */
export const events = new Hono<Env>()
  .get('/', Guard.needs('event:read'), vValidator('query', Input.eventQuery, Check.query), async (c) => {
    const query = c.req.valid('query');
    const ability = c.get('ability');

    const member = Guard.member(c);
    const manage = ability.can('event:manage');

    /** Both ends or neither, which `Input.eventQuery` has already refused to let through. */
    const window = query.from && query.to ? { from: query.from, to: query.to } : null;

    const listing = await c.get('store').events.list({
      ...(query.kind && { kind: query.kind }),
      ...(query.seasonId && { seasonId: query.seasonId }),
      ...(query.q && { query: query.q }),
      ...(window && { window }),
      /** A window says which stretch of the clock is wanted, so `scope` has nothing left to add. */
      ...(!window && query.scope !== 'all' && { upcoming: new Date() }),
      /** A draft is nobody's business but its organiser's, which the query itself enforces. */
      viewer: member.id,
      drafts: manage,
      ...(query.state && { state: query.state }),
    });

    /** `Event.visibleTo` is the definition; the query above is it in SQL, and this proves it. */
    const visible = listing.filter((tally) => tally.event.visibleTo(member.id, manage));

    /**
     * What the caller themselves answered, in one query for the whole page. A calendar draws it on
     * every night at once, and a member scanning a month is looking for exactly that.
     */
    const mine = await c.get('store').rsvps.mine(
      member.id,
      visible.map((tally) => tally.event.id),
    );

    return c.json(
      visible.map((tally) => ({ ...Wire.tally(tally), yours: mine.get(tally.event.id) ?? null })),
    );
  })

  .post('/', Guard.needs('event:create'), vValidator('json', Input.event, Check.body), async (c) => {
    const store = c.get('store');
    const draft = c.req.valid('json');
    await Kinds.must(store, draft.kind);

    /**
     * A club that closes its answers a day before every evening says so once, here, rather than
     * in every event anybody writes. An event that names its own deadline keeps it.
     */
    const { deadline } = await store.club.read();
    const closesAt =
      draft.closesAt ?? (deadline > 0 ? new Date(draft.startsAt.getTime() - deadline * Announce.HOUR) : null);

    /**
     * An event lands in the season the club is running, unless the writer said otherwise.
     *
     * The confirmation on the promote button has always said "new events land in it", and until
     * now nothing made that true: the form never sends a season, so every event was filed under
     * none and a committee's year-end report counted nothing.
     */
    const season = draft.seasonId === undefined ? await store.seasons.current() : null;

    const created = await store.events.create(
      { ...draft, closesAt, ...(season && { seasonId: season.id }) },
      Guard.member(c).id,
    );
    c.get('log').info('event created', { event: created.id, kind: created.kind, state: created.state });

    await Announce.published(store, created, c.get('ability').can('event:manage'));
    await Trail.record(c, 'event.create', created.id, { title: created.title, state: created.state });
    return c.json(Wire.event(created), 201);
  })

  .get('/:id', Guard.needs('event:read'), vValidator('param', Input.params.event, Check.param), async (c) => {
    const store = c.get('store');
    const member = Guard.member(c);
    const organiser = c.get('ability').can('event:manage');

    const event = await store.events.byId(c.req.valid('param').id);
    if (!event?.visibleTo(member.id, organiser)) throw Fail.missing('event');

    const [sheet, guests, mine] = await Promise.all([
      store.rsvps.sheet(event.id),
      store.guests.list(event.id),
      store.rsvps.byMember(event.id, member.id),
    ]);

    /** A hidden member is on the organiser's sheet and off everyone else's, and is counted either way. */
    const answers = organiser ? sheet : sheet.filter((entry) => !entry.member.hidden);

    return c.json({
      ...Wire.tally(Rsvps.tally(event, sheet, guests)),
      answers: answers.map(Wire.entry),
      attending: guests.map(Wire.guest),
      mine: mine ? Wire.rsvp(mine) : null,
    });
  })

  .patch(
    '/:id',
    Guard.needs('event:create'),
    vValidator('param', Input.params.event, Check.param),
    vValidator('json', Input.eventPatch, Check.body),
    async (c) => {
      const store = c.get('store');
      const event = await store.events.byId(c.req.valid('param').id);
      if (!event) throw Fail.missing('event');
      if (!c.get('ability').canOwn('event:manage', event.createdBy)) {
        throw Fail.forbidden('only the organiser or an admin may edit this event');
      }

      const patch = c.req.valid('json');
      await Kinds.must(store, patch.kind);

      const updated = (await store.events.update(event.id, patch)) ?? event;

      /**
       * A state that changed re-decides what is owed: publishing arms the reminder (and, for an
       * organiser, the announcement), and cancelling withdraws both. `published` re-reads the
       * event's own state, so it is the one call either way.
       */
      if (patch.state !== undefined && patch.state !== event.state) {
        await Announce.published(store, updated, c.get('ability').can('event:manage'));
      } else if (patch.startsAt !== undefined && patch.startsAt.getTime() !== event.startsAt.getTime()) {
        /** A date that moved leaves the reminder pointing at the old one, so it is re-armed. */
        await Announce.rescheduled(store, updated);
      }

      /** A capacity that changed either hands places to the waitlist or takes them back. */
      if (patch.capacity !== undefined) {
        await new Booking(store, c.get('log')).resize(updated);
      }

      await Trail.record(c, 'event.update', event.id, patch);
      return c.json(Wire.event(updated));
    },
  )

  .delete(
    '/:id',
    Guard.needs('event:create'),
    vValidator('param', Input.params.event, Check.param),
    async (c) => {
      const event = await c.get('store').events.byId(c.req.valid('param').id);
      if (!event) throw Fail.missing('event');
      if (!c.get('ability').canOwn('event:manage', event.createdBy)) {
        throw Fail.forbidden('only the organiser or an admin may delete this event');
      }

      await Announce.withdrawn(c.get('store'), event.id);
      await c.get('store').events.remove(event.id);
      c.get('log').warn('event deleted', { event: event.id, title: event.title });
      await Trail.record(c, 'event.delete', event.id, { title: event.title });
      return c.json({ ok: true });
    },
  )

  /** Announcing again, by hand: for the event nobody noticed the first time. */
  .post(
    '/:id/announce',
    Guard.needs('event:manage'),
    vValidator('param', Input.params.event, Check.param),
    async (c) => {
      const event = await c.get('store').events.byId(c.req.valid('param').id);
      if (!event) throw Fail.missing('event');
      if (event.state !== Event.LIVE) {
        throw Fail.because(
          Refusal.Conflict,
          Diag.error(Codes.event.state, markup`*${event.title}* is ${event.state}`).help(
            'publish it first, and it is announced on its own',
          ),
        );
      }

      const job = await c.get('store').jobs.schedule('event.announce', { eventId: event.id });
      await Trail.record(c, 'event.announce', event.id, { job: job.id });
      return c.json({ ok: true, queued: job.id });
    },
  )

  .put(
    '/:id/rsvp',
    Guard.needs('event:rsvp'),
    vValidator('param', Input.params.event, Check.param),
    vValidator('json', Input.rsvp, Check.body),
    async (c) => {
      /**
       * Any event that exists is loaded, and `Booking` says why it will not take an answer. The
       * state check used to be here, so a member looking at a cancelled evening was told there is
       * no such event: `Codes.rsvp.state` exists to say "it is cancelled" and could never be
       * reached from this route, only from the withdraw beside it.
       */
      const event = await c.get('store').events.byId(c.req.valid('param').id);
      if (!event) throw Fail.missing('event');

      const booking = new Booking(c.get('store'), c.get('log'));
      return c.json(Wire.rsvp(await booking.answer(event, Guard.member(c), c.req.valid('json').answer)));
    },
  )

  .delete(
    '/:id/rsvp',
    Guard.needs('event:rsvp'),
    vValidator('param', Input.params.event, Check.param),
    async (c) => {
      const event = await c.get('store').events.byId(c.req.valid('param').id);
      if (!event) throw Fail.missing('event');

      await new Booking(c.get('store'), c.get('log')).withdraw(event, Guard.member(c));
      return c.json({ ok: true });
    },
  )

  /**
   * One event as a file for whatever calendar a member already lives in.
   *
   * It is the other half of the subscription feed: a member who wants tonight in their calendar
   * and not the whole club's year opens this, and every calendar app on every platform knows what
   * an `.ics` is without anybody pasting a url anywhere.
   */
  .get(
    '/:id/event.ics',
    Guard.needs('event:read'),
    vValidator('param', Input.params.event, Check.param),
    async (c) => {
      const store = c.get('store');
      const member = Guard.member(c);

      const event = await store.events.byId(c.req.valid('param').id);
      if (!event?.visibleTo(member.id, c.get('ability').can('event:manage'))) throw Fail.missing('event');

      const club = await store.club.read();
      return c.body(Ical.file(event, club), 200, Ical.attachment(event.title));
    },
  )

  /** The organiser's sheet: everyone, hidden members included, with attendance as recorded. */
  .get(
    '/:id/sheet',
    Guard.needs('event:manage'),
    vValidator('param', Input.params.event, Check.param),
    async (c) => {
      const store = c.get('store');
      const { id } = c.req.valid('param');
      /** Without this an unknown id answers `{answers: [], attending: []}`, which reads as "nobody". */
      if (!(await store.events.byId(id))) throw Fail.missing('event');

      const [sheet, guests] = await Promise.all([store.rsvps.sheet(id), store.guests.list(id)]);
      return c.json({ answers: sheet.map(Wire.entry), attending: guests.map(Wire.guest) });
    },
  )

  /** The same sheet as a file, for the report a committee writes once a year. */
  .get(
    '/:id/sheet.csv',
    Guard.needs('event:manage'),
    vValidator('param', Input.params.event, Check.param),
    async (c) => {
      const store = c.get('store');
      const { id } = c.req.valid('param');
      const event = await store.events.byId(id);
      if (!event) throw Fail.missing('event');

      const [sheet, guests] = await Promise.all([store.rsvps.sheet(id), store.guests.list(id)]);
      const rows = [
        ...sheet.map((entry) => [
          entry.member.name,
          entry.rsvp.answer,
          Csv.yes(entry.rsvp.attended),
          entry.rsvp.answeredAt,
          'member',
        ]),
        ...guests.map((guest) => [guest.name, '', Csv.yes(guest.attended), guest.createdAt, 'guest']),
      ];

      const csv = Csv.of(['name', 'answer', 'attended', 'answered', 'kind'], rows);
      return c.body(csv, 200, Csv.headers(Csv.filename(event.title), `${event.title}.csv`));
    },
  )

  .put(
    '/:id/attendance/:memberId',
    Guard.needs('event:manage'),
    vValidator('param', Input.params.eventMember, Check.param),
    vValidator('json', Input.attendance, Check.body),
    async (c) => {
      const { id, memberId } = c.req.valid('param');
      const event = await c.get('store').events.byId(id);
      if (!event) throw Fail.missing('event');

      /**
       * The member is loaded rather than trusted: `attend` inserts an rsvp, so a mistyped id
       * reached the database as a foreign-key violation and came back as "something went wrong on
       * our side" with a request id to quote.
       */
      if (!(await c.get('store').members.byId(memberId))) throw Fail.missing('member');

      const attended = c.req.valid('json').attended;
      const rsvp = await c.get('store').rsvps.attend(event.id, memberId, attended);
      c.get('log').info('attendance recorded', { event: event.id, member: memberId, attended });
      await Trail.record(c, 'attendance.mark', event.id, { member: memberId, attended });
      return c.json(Wire.rsvp(rsvp));
    },
  )

  .post(
    '/:id/guests',
    Guard.needs('event:manage'),
    vValidator('param', Input.params.event, Check.param),
    vValidator('json', Input.guest, Check.body),
    async (c) => {
      const store = c.get('store');
      const event = await store.events.byId(c.req.valid('param').id);
      if (!event) throw Fail.missing('event');

      const club = await store.club.read();
      if (!club.guests) {
        throw Fail.because(
          Refusal.Forbidden,
          Diag.error(Codes.event.guest, markup`*${club.name}* does not put guests on the list`).help(
            'turn guests on in the settings, or admit them as members',
          ),
        );
      }

      /** A guest takes a seat like anybody else, so a full event refuses one. */
      if (event.capacity !== null && (await store.rsvps.seated(event.id)) >= event.capacity) {
        throw Fail.because(
          Refusal.Full,
          Diag.error(Codes.event.capacity, markup`all ${event.capacity} places at *${event.title}* are taken`)
            .note('a guest occupies a place exactly as a member does')
            .help('raise the capacity, or wait for somebody to withdraw'),
        );
      }

      const guest = await store.guests.add(event.id, c.req.valid('json'), Guard.member(c).id);
      await Trail.record(c, 'guest.add', event.id, { guest: guest.id, name: guest.name });
      return c.json(Wire.guest(guest), 201);
    },
  )

  .put(
    '/:id/guests/:guestId/attendance',
    Guard.needs('event:manage'),
    vValidator('param', Input.params.eventGuest, Check.param),
    vValidator('json', Input.attendance, Check.body),
    async (c) => {
      const { id, guestId } = c.req.valid('param');
      const attended = c.req.valid('json').attended;

      const guest = await c.get('store').guests.attend(id, guestId, attended);
      if (!guest) throw Fail.missing('guest');

      /** The member equivalent records this, and one sheet's history should not have two halves. */
      await Trail.record(c, 'attendance.mark', id, { guest: guestId, attended });
      return c.json(Wire.guest(guest));
    },
  )

  .delete(
    '/:id/guests/:guestId',
    Guard.needs('event:manage'),
    vValidator('param', Input.params.eventGuest, Check.param),
    async (c) => {
      const store = c.get('store');
      const { id, guestId } = c.req.valid('param');
      const guest = await store.guests.byId(id, guestId);
      if (!guest) throw Fail.missing('guest');

      await store.guests.remove(id, guestId);
      /** A guest leaving frees their seat, so the waitlist moves the way a withdrawal moves it. */
      const event = await store.events.byId(id);
      if (event) await new Booking(store, c.get('log')).promote(event);

      await Trail.record(c, 'guest.remove', id, { guest: guestId, name: guest.name });
      return c.json({ ok: true });
    },
  );
