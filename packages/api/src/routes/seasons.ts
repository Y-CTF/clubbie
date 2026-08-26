import { Diag } from '@clubbie/diag';
import { markup, When } from '@clubbie/term';
import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import { Announce } from '../announce.ts';
import { Check } from '../check.ts';
import { Codes } from '../codes.ts';
import type { Env } from '../context.ts';
import { Fail, Refusal } from '../fail.ts';
import { Guard } from '../guard.ts';
import { Input } from '../input.ts';
import { Trail } from '../trail.ts';
import { Wire } from '../wire.ts';

/**
 * Seasons and who is on their rosters. A member joins the current season themselves while it is
 * renewable, which is the whole point of a renewal deadline: after it, an organiser has to act.
 */
export const seasons = new Hono<Env>()
  .get('/', Guard.needs('season:read'), async (c) => {
    const listing = await c.get('store').seasons.list();
    return c.json(listing.map(Wire.season));
  })

  .get('/current', Guard.needs('season:read'), async (c) => {
    const current = await c.get('store').seasons.current();
    return c.json(current ? Wire.season(current) : null);
  })

  .post('/', Guard.needs('season:manage'), vValidator('json', Input.season, Check.body), async (c) => {
    const draft = c.req.valid('json');
    if (draft.endsAt <= draft.startsAt) {
      throw Fail.invalid(
        Diag.error(Codes.season.range, 'a season ends after it starts')
          .note(markup`starts ${When.stamp(draft.startsAt)}, ends ${When.stamp(draft.endsAt)}`)
          .help('swap the two dates, or push the end past the start'),
      );
    }

    const created = await c.get('store').seasons.create(draft);
    c.get('log').info('season created', { season: created.id, current: created.current });

    /** A season that opens owes everybody who is not on it a word before they cannot renew. */
    await Announce.renewals(c.get('store'), created);
    await Trail.record(c, 'season.create', created.id, { name: created.name });
    return c.json(Wire.season(created), 201);
  })

  /**
   * Carries last season's roster into this one. Only active members move: an alumnus who wants
   * back in renews themselves or is added, and moving them silently would inflate a roster the
   * committee reports on.
   */
  .post(
    '/:id/rollover',
    Guard.needs('season:manage'),
    vValidator('param', Input.params.season, Check.param),
    vValidator('json', Input.rollover, Check.body),
    async (c) => {
      const store = c.get('store');
      const { id } = c.req.valid('param');
      const season = await Guard.find('season', store.seasons.byId(id));

      const previous = await store.seasons.roster(c.req.valid('json').from);
      const moving = previous.filter((member) => member.active);
      for (const member of moving) await store.seasons.join(member.id, season.id);

      c.get('log').info('season rolled over', { season: season.id, members: moving.length });
      await Trail.record(c, 'season.roster', season.id, {
        from: c.req.valid('json').from,
        moved: moving.length,
      });
      return c.json({ ok: true, moved: moving.length });
    },
  )

  .post(
    '/:id/promote',
    Guard.needs('season:manage'),
    vValidator('param', Input.params.season, Check.param),
    async (c) => {
      const store = c.get('store');
      const before = await store.seasons.current();
      const promoted = await Guard.find('season', store.seasons.promote(c.req.valid('param').id));

      /**
       * The renewal moves with the season. The one it replaced owes nothing any more: it is not the
       * season anybody is renewing into, and a message about it would send the club to a roster
       * that has stopped mattering.
       *
       * The season it replaced is read back rather than reused: the copy this handler is holding
       * was read before the promotion and still says it is the current one, which is exactly the
       * field that decides whether it owes a renewal at all.
       */
      const dropped = before && before.id !== promoted.id ? await store.seasons.byId(before.id) : null;
      if (dropped) await Announce.renewals(store, dropped);
      await Announce.renewals(store, promoted);

      await Trail.record(c, 'season.promote', promoted.id, { name: promoted.name });
      return c.json(Wire.season(promoted));
    },
  )

  .get(
    '/:id/roster',
    Guard.needs('season:read'),
    vValidator('param', Input.params.season, Check.param),
    async (c) => {
      const store = c.get('store');
      const { id } = c.req.valid('param');
      await Guard.find('season', store.seasons.byId(id));

      const roster = await store.seasons.roster(id);
      return c.json(roster.map(Wire.peer));
    },
  )

  /**
   * Joining oneself, while the season still takes renewals. Anyone else is an organiser's act.
   *
   * `season:read` rather than `profile:write`: the second is granted to a member nobody has
   * admitted yet, so an unadmitted account could write itself onto the roster a committee reports
   * on. Renewing is for somebody the club already has, which is exactly who holds `season:read`.
   */
  .post(
    '/:id/join',
    Guard.needs('season:read'),
    vValidator('param', Input.params.season, Check.param),
    async (c) => {
      const store = c.get('store');
      const season = await Guard.find('season', store.seasons.byId(c.req.valid('param').id));
      if (!season.renewable()) {
        throw Fail.because(
          Refusal.Closed,
          Diag.error(Codes.season.closed, markup`*${season.name}* no longer takes renewals`)
            .note(markup`the deadline was ${When.stamp(season.renewalAt ?? season.endsAt)}`)
            .help('ask an organiser to add you to the roster'),
        );
      }

      await store.seasons.join(Guard.member(c).id, season.id);
      return c.json({ ok: true });
    },
  )

  .put(
    '/:id/roster/:memberId',
    Guard.needs('season:manage'),
    vValidator('param', Input.params.seasonMember, Check.param),
    async (c) => {
      const store = c.get('store');
      const { id, memberId } = c.req.valid('param');
      /** Both sides are loaded: the insert has two foreign keys, and neither is worth a 503. */
      await Guard.find('season', store.seasons.byId(id));
      await Guard.find('member', store.members.byId(memberId));

      await store.seasons.join(memberId, id);
      await Trail.record(c, 'season.roster', id, { member: memberId, joined: true });
      return c.json({ ok: true });
    },
  )

  /**
   * Deletes a season. The roster goes with it, the events do not.
   *
   * There is no state it refuses in, the current one included. A club that is folding a year it
   * typed wrong has to be able to take it away, and a club with one season would be trapped by a
   * rule that said "promote another first". What the act needs instead is to be honest about its
   * cost: the roster it takes is counted, said back, and written into the trail, and the page that
   * offers it says the number before it asks.
   *
   * The renewal message the season owed is cancelled here rather than left to run. It points at a
   * roster that no longer exists, which is the one notice worse than none.
   */
  .delete(
    '/:id',
    Guard.needs('season:manage'),
    vValidator('param', Input.params.season, Check.param),
    async (c) => {
      const store = c.get('store');
      const { id } = c.req.valid('param');

      const season = await Guard.find('season', store.seasons.byId(id));

      const removed = await store.seasons.remove(id);
      if (removed === null) throw Fail.missing('season');

      await store.jobs.cancel('season.renewal', { seasonId: id });
      c.get('log').warn('season deleted', { season: id, roster: removed });
      await Trail.record(c, 'season.delete', id, { name: season.name, roster: removed });
      return c.json({ ok: true, removed });
    },
  )

  .delete(
    '/:id/roster/:memberId',
    Guard.needs('season:manage'),
    vValidator('param', Input.params.seasonMember, Check.param),
    async (c) => {
      const store = c.get('store');
      const { id, memberId } = c.req.valid('param');
      await Guard.find('season', store.seasons.byId(id));

      await store.seasons.leave(memberId, id);
      await Trail.record(c, 'season.roster', id, { member: memberId, joined: false });
      return c.json({ ok: true });
    },
  );
