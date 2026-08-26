import { Recur } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { EventPatch } from '@clubbie/store';
import { markup, When } from '@clubbie/term';
import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import { Booking } from '../booking.ts';
import { Check } from '../check.ts';
import { Codes } from '../codes.ts';
import type { Env } from '../context.ts';
import { Expand } from '../expand.ts';
import { Fail } from '../fail.ts';
import { Guard } from '../guard.ts';
import { Input } from '../input.ts';
import { Trail } from '../trail.ts';
import { Wire } from '../wire.ts';
import { Kinds } from './kinds.ts';

/**
 * Repeating events. A schedule is a rule and a template; the occurrences are ordinary events that
 * point back at it, so one week can be cancelled, moved or given a different room without the rest
 * of the term noticing.
 */

/** A rule that ends before it begins produces nothing, and is worth saying so rather than storing. */
function range(startsAt: Date, until: Date | null): void {
  if (!until || until.getTime() > startsAt.getTime()) return;

  throw Fail.invalid(
    Diag.error(Codes.schedule.range, 'a schedule ends after its first occurrence')
      .note(markup`it starts ${When.stamp(startsAt)} and ends ${When.stamp(until)}`)
      .help('push the end date past the start, or drop it and set a count instead'),
  );
}

/** The fields an occurrence inherits, taken from the patch so a night edited by hand keeps its edit. */
function carried(patch: Record<string, unknown>): EventPatch {
  const fields = ['title', 'description', 'kind', 'location', 'capacity', 'seasonId', 'listed'] as const;
  const out: Record<string, unknown> = {};
  for (const field of fields) if (field in patch) out[field] = patch[field];
  return out as EventPatch;
}

export const schedules = new Hono<Env>()
  .get('/', Guard.needs('event:read'), async (c) => {
    const store = c.get('store');
    const { timezone } = await store.club.read();
    const listing = await store.schedules.list();
    return c.json(listing.map((one) => Wire.schedule(one, timezone)));
  })

  .post('/', Guard.needs('event:manage'), vValidator('json', Input.schedule, Check.body), async (c) => {
    const draft = c.req.valid('json');
    range(draft.startsAt, draft.until ?? null);

    const store = c.get('store');
    await Kinds.must(store, draft.kind);

    /** The occurrences it stamps are events, so the rule joins the club's year the same way. */
    const season = draft.seasonId === undefined ? await store.seasons.current() : null;
    const created = await store.schedules.create(
      { ...draft, ...(season && { seasonId: season.id }) },
      Guard.member(c).id,
    );
    const { created: events } = await Expand.run(store, created, c.get('log'));
    const { timezone } = await store.club.read();

    await Trail.record(c, 'schedule.create', created.id, { title: created.title, events: events.length });
    return c.json({ ...Wire.schedule(created, timezone), events }, 201);
  })

  .get(
    '/:id',
    Guard.needs('event:read'),
    vValidator('param', Input.params.schedule, Check.param),
    async (c) => {
      const store = c.get('store');
      const schedule = await Guard.find('schedule', store.schedules.byId(c.req.valid('param').id));

      const occurrences = await store.events.list({ scheduleId: schedule.id, limit: Recur.LIMIT });
      const { timezone } = await store.club.read();
      return c.json({ ...Wire.schedule(schedule, timezone), occurrences: occurrences.map(Wire.tally) });
    },
  )

  /**
   * Editing one. The answer says what it cost: how many nights carried the change, how many the
   * rule stopped asking for, and how many were stamped.
   *
   * Nothing is deleted for changing: a night the rule still produces on the same instant keeps its
   * id, and with it every answer, every guest and every attendance mark. Only a night the rule no
   * longer has a date for is dropped, which is what moving a meeting from Tuesdays to the first of
   * the month actually means. Widening a term, or making the evenings half an hour longer, costs
   * nothing at all.
   */
  .patch(
    '/:id',
    Guard.needs('event:manage'),
    vValidator('param', Input.params.schedule, Check.param),
    vValidator('json', Input.schedulePatch, Check.body),
    async (c) => {
      const store = c.get('store');
      const { id } = c.req.valid('param');
      const patch = c.req.valid('json');

      const before = await Guard.find('schedule', store.schedules.byId(id));

      range(patch.startsAt ?? before.startsAt, patch.until === undefined ? before.recur.until : patch.until);
      await Kinds.must(store, patch.kind);

      const after = await Guard.find('schedule', store.schedules.update(id, patch));

      const now = new Date();
      const updated = await store.events.retemplate(id, now, carried(patch));
      if (patch.minutes !== undefined) await store.events.restretch(id, now, patch.minutes ?? null);

      /**
       * A capacity carried onto nights that already have answers is a resize of each of them, not
       * a column write: places that opened go to whoever waited, and places that closed are taken
       * back from the newest seats, with both told. `retemplate` has written the number; this is
       * what makes the answers agree with it.
       */
      if (patch.capacity !== undefined) {
        const booking = new Booking(store, c.get('log'));
        for (const eventId of updated) {
          const event = await store.events.byId(eventId);
          if (event) await booking.resize(event, now);
        }
      }

      const { created, dropped } = await Expand.reconcile(store, after, c.get('log'), now);

      await Trail.record(c, 'schedule.update', id, {
        title: after.title,
        updated: updated.length,
        dropped,
        created: created.length,
      });
      const { timezone } = await store.club.read();
      return c.json({
        ...Wire.schedule(after, timezone),
        updated: updated.length,
        dropped,
        created: created.length,
      });
    },
  )

  /** Tops a schedule up by hand, for the term that has run past what was materialised. */
  .post(
    '/:id/expand',
    Guard.needs('event:manage'),
    vValidator('param', Input.params.schedule, Check.param),
    async (c) => {
      const store = c.get('store');
      const schedule = await Guard.find('schedule', store.schedules.byId(c.req.valid('param').id));

      const result = await Expand.run(store, schedule, c.get('log'));
      /** It creates events, and every sibling on this route records what it did. */
      await Trail.record(c, 'schedule.update', schedule.id, { expanded: result.created });
      return c.json({ created: result.created, skipped: result.skipped });
    },
  )

  /**
   * Deleting a schedule takes its future occurrences with it and leaves its past ones alone: the
   * meetings that happened, and the attendance recorded at them, are history rather than a rule.
   */
  .delete(
    '/:id',
    Guard.needs('event:manage'),
    vValidator('param', Input.params.schedule, Check.param),
    async (c) => {
      const store = c.get('store');
      const { id } = c.req.valid('param');
      const schedule = await Guard.find('schedule', store.schedules.byId(id));

      const dropped = await store.events.removeOccurrences(id, new Date());
      await store.jobs.cancel('schedule.expand', { scheduleId: id });
      await store.schedules.remove(id);

      c.get('log').warn('schedule deleted', { schedule: id, dropped });
      await Trail.record(c, 'schedule.delete', id, { title: schedule.title, dropped });
      return c.json({ ok: true, dropped });
    },
  );
