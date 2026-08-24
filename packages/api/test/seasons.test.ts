import { beforeEach, describe, expect, test } from 'bun:test';
import type { KindId, SeasonId } from '@clubbie/core';
import { type Harness, harness } from './harness.ts';

/**
 * The club's year, and the two things that used to be invisible about it: what a member owes it,
 * and what an event belongs to.
 */

let h: Harness;
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  h = await harness();
});

async function season(renewalIn: number | null, current = true) {
  const now = Date.now();
  return h.store.seasons.create({
    name: '2026/27',
    startsAt: new Date(now - DAY),
    endsAt: new Date(now + 300 * DAY),
    renewalAt: renewalIn === null ? null : new Date(now + renewalIn * DAY),
    current,
  });
}

describe('a season that is open', () => {
  test('rides along with the viewer, who is told whether they are on it', async () => {
    const ada = await h.member('ada', 'active', 'admin');
    const open = await season(30);
    const cookie = await h.signIn(ada);

    const read = async () =>
      (await (await h.call('/me', { cookie })).json()) as {
        season: { name: string } | null;
        renewed: boolean;
        renewable: boolean;
      };

    const before = await read();
    expect(before.season?.name).toBe('2026/27');
    expect(before.renewed).toBe(false);
    expect(before.renewable).toBe(true);

    expect((await h.call(`/seasons/${open.id}/join`, { method: 'POST', cookie })).status).toBe(200);
    expect((await read()).renewed).toBe(true);
  });

  test('is absent for a club that does not run in years', async () => {
    const cookie = await h.signIn(await h.member('ada', 'active'));
    const viewer = (await (await h.call('/me', { cookie })).json()) as { season: unknown };
    expect(viewer.season).toBeNull();
  });
});

describe('what a season owes', () => {
  /**
   * The renewal is a row in `job`, like every other notice the club sends, and it is read here the
   * way the scheduler reads it: by claiming what is due at a given moment. That is also what proves
   * the timing, which is the only interesting thing about it.
   */
  async function due(kind: string, at: number): Promise<{ payload: unknown }[]> {
    const claimed = await h.store.jobs.claim(new Date(at));
    return claimed.filter((job) => job.kind === kind);
  }

  test('a renewal comes due a week before the deadline, and not before', async () => {
    const cookie = await h.signIn(await h.member('ada', 'active', 'admin'));
    const now = Date.now();

    await h.call('/seasons', {
      method: 'POST',
      cookie,
      body: JSON.stringify({
        name: '2026/27',
        startsAt: new Date(now).toISOString(),
        endsAt: new Date(now + 300 * DAY).toISOString(),
        renewalAt: new Date(now + 30 * DAY).toISOString(),
        current: true,
      }),
    });

    expect(await due('season.renewal', now + 22 * DAY)).toHaveLength(0);
    expect(await due('season.renewal', now + 24 * DAY)).toHaveLength(1);
  });

  test('a season with no deadline owes nobody a warning', async () => {
    await season(null);
    expect(await due('season.renewal', Date.now() + 400 * DAY)).toHaveLength(0);
  });

  test('promoting another season moves the renewal to it', async () => {
    const cookie = await h.signIn(await h.member('ada', 'active', 'admin'));
    await season(30);
    const next = await h.store.seasons.create({
      name: '2027/28',
      startsAt: new Date(Date.now() + 300 * DAY),
      endsAt: new Date(Date.now() + 600 * DAY),
      renewalAt: new Date(Date.now() + 320 * DAY),
    });

    await h.call(`/seasons/${next.id}/promote`, { method: 'POST', cookie });

    const queued = await due('season.renewal', Date.now() + 400 * DAY);
    expect(queued.map((job) => job.payload)).toEqual([{ seasonId: next.id }]);
  });
});

/**
 * Deleting one. The roster is what actually goes, so that is what is asserted: the memberships are
 * gone, the events that were filed under it are not, and the message it owed is not sent to a
 * roster that no longer exists.
 */
describe('a season that is deleted', () => {
  test('takes its roster, leaves the events, and cancels what it owed', async () => {
    const ada = await h.member('ada', 'active', 'admin');
    const cookie = await h.signIn(ada);
    const now = Date.now();

    /** Through the route, so the season owes the renewal the deletion has to take back. */
    const open = (await (
      await h.call('/seasons', {
        method: 'POST',
        cookie,
        body: JSON.stringify({
          name: '2026/27',
          startsAt: new Date(now).toISOString(),
          endsAt: new Date(now + 300 * DAY).toISOString(),
          renewalAt: new Date(now + 30 * DAY).toISOString(),
          current: true,
        }),
      })
    ).json()) as { id: SeasonId };
    await h.store.seasons.join(ada.id, open.id);

    const written = await h.event(ada);
    await h.store.events.update(written.id, { seasonId: open.id });
    expect(await h.store.jobs.count({ kind: 'season.renewal' })).toBe(1);

    const gone = await h.call(`/seasons/${open.id}`, { method: 'DELETE', cookie });
    expect(gone.status).toBe(200);
    expect(await gone.json()).toEqual({ ok: true, removed: 1 });

    expect(await h.store.seasons.byId(open.id)).toBeNull();
    expect(await h.store.seasons.holds(ada.id, open.id)).toBe(false);
    expect(await h.store.jobs.count({ kind: 'season.renewal' })).toBe(0);

    /** The evening happened. What it loses is the year it was filed under, not its own row. */
    const kept = await h.store.events.byId(written.id);
    expect(kept?.seasonId).toBeNull();
  });

  test('is recorded, and is refused to everybody but an organiser', async () => {
    const open = await season(30);
    const theirs = await h.signIn(await h.member('dee'));

    const refused = await h.call(`/seasons/${open.id}`, { method: 'DELETE', cookie: theirs });
    expect(refused.status).toBe(403);
    expect(await h.store.seasons.byId(open.id)).not.toBeNull();

    const cookie = await h.signIn(await h.member('ada', 'active', 'admin'));
    await h.call(`/seasons/${open.id}`, { method: 'DELETE', cookie });

    const trail = await h.store.audit.list();
    const entry = trail.find((one) => one.act === 'season.delete');
    expect(entry?.subject).toBe(open.id);
    expect(entry?.detail).toMatchObject({ name: '2026/27', roster: 0 });
  });

  test('a season that is not there is a 404', async () => {
    const cookie = await h.signIn(await h.member('ada', 'active', 'admin'));
    const missing = await h.call('/seasons/01ARZ3NDEKTSV4RRFFQ69G5FAV', { method: 'DELETE', cookie });
    expect(missing.status).toBe(404);
  });
});

describe('an event written while a season is open', () => {
  /** The promote button has always promised this. Until now nothing made it true. */
  test('lands in it without anybody choosing', async () => {
    const cookie = await h.signIn(await h.member('ada', 'active', 'admin'));
    const open = await season(30);

    const created = (await (
      await h.call('/events', {
        method: 'POST',
        cookie,
        body: JSON.stringify({
          title: 'Training night',
          kind: 'meeting' as KindId,
          startsAt: new Date(Date.now() + DAY).toISOString(),
        }),
      })
    ).json()) as { seasonId: string | null };

    expect(created.seasonId).toBe(open.id);
  });

  test('keeps the season it was given, when it was given one', async () => {
    const cookie = await h.signIn(await h.member('ada', 'active', 'admin'));
    await season(30);
    const other = await h.store.seasons.create({
      name: 'summer',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + DAY),
    });

    const created = (await (
      await h.call('/events', {
        method: 'POST',
        cookie,
        body: JSON.stringify({
          title: 'Summer party',
          kind: 'meeting' as KindId,
          startsAt: new Date(Date.now() + DAY).toISOString(),
          seasonId: other.id,
        }),
      })
    ).json()) as { seasonId: string | null };

    expect(created.seasonId).toBe(other.id);
  });
});
