import { beforeEach, describe, expect, test } from 'bun:test';
import { Kind, type KindId } from '@clubbie/core';
import { DAY, type Harness, harness, refusal } from './harness.ts';

/**
 * The club's own vocabulary for what an event is.
 *
 * The rule this proves is the one in `AGENTS.md`: nothing about one club is compiled in. A choir
 * calls its evenings rehearsals and concerts, a hiking group calls them walks, and neither of them
 * should have to file an evening under "other" because this app was written for a CTF team.
 */
describe('what a club calls its events', () => {
  let h: Harness;
  let admin: string;
  let member: string;

  beforeEach(async () => {
    h = await harness();
    admin = await h.signIn(await h.member('ada', 'active', 'admin'));
    member = await h.signIn(await h.member('alan'));
  });

  test('starts as the list every older release accepted, so no event loses its meaning', async () => {
    const listing = (await (await h.call('/kinds', { cookie: member })).json()) as { id: string }[];
    expect(listing.map((one) => one.id)).toEqual(Kind.DEFAULTS.map((one) => one.id));
  });

  test("takes a word of the club's own, slugged from what it typed", async () => {
    const made = await h.call('/kinds', {
      method: 'POST',
      cookie: admin,
      body: JSON.stringify({ label: 'Générale répétition' }),
    });
    expect(made.status).toBe(201);
    expect(await made.json()).toMatchObject({ id: 'generale-repetition', label: 'Générale répétition' });
  });

  test('renaming one leaves every event that is one alone', async () => {
    const night = await h.store.events.create(
      { title: 'Pizza', kind: 'social' as KindId, state: 'published', startsAt: new Date(Date.now() + DAY) },
      (await h.member('bea')).id,
    );

    const renamed = await h.call('/kinds/social', {
      method: 'PATCH',
      cookie: admin,
      body: JSON.stringify({ label: 'apéro' }),
    });
    expect(renamed.status).toBe(200);

    /** The id is what an event stores, so the event is untouched and reads the new word. */
    expect((await h.store.events.byId(night.id))?.kind).toBe('social' as KindId);
    expect((await h.store.kinds.byId('social' as KindId))?.label).toBe('apéro');
  });

  test('a kind that events are will not be deleted, and says how many', async () => {
    await h.store.events.create(
      { title: 'Pizza', kind: 'social' as KindId, state: 'published', startsAt: new Date(Date.now() + DAY) },
      (await h.member('bea')).id,
    );

    const refused = await h.call('/kinds/social', { method: 'DELETE', cookie: admin });
    expect(refused.status).toBe(409);
    expect(String((await refusal(refused)).diag.code)).toBe('kind.used');

    /** One nothing uses goes, because nothing is pointing at it. */
    expect((await h.call('/kinds/conference', { method: 'DELETE', cookie: admin })).status).toBe(200);
  });

  test('an event cannot be filed under a word the club does not have', async () => {
    const refused = await h.call('/events', {
      method: 'POST',
      cookie: admin,
      body: JSON.stringify({ title: 'Regatta', kind: 'regatta', startsAt: new Date().toISOString() }),
    });
    expect(refused.status).toBe(422);
    expect(String((await refusal(refused)).diag.code)).toBe('kind.unknown');

    /** And can, the moment the club adds it. */
    await h.call('/kinds', { method: 'POST', cookie: admin, body: JSON.stringify({ label: 'regatta' }) });
    const made = await h.call('/events', {
      method: 'POST',
      cookie: admin,
      body: JSON.stringify({ title: 'Regatta', kind: 'regatta', startsAt: new Date().toISOString() }),
    });
    expect(made.status).toBe(201);
  });

  test('a schedule is held to the same list', async () => {
    const refused = await h.call('/schedules', {
      method: 'POST',
      cookie: admin,
      body: JSON.stringify({
        title: 'Weekly row',
        kind: 'regatta',
        startsAt: new Date(Date.now() + DAY).toISOString(),
        freq: 'weekly',
      }),
    });
    expect(refused.status).toBe(422);
    expect(String((await refusal(refused)).diag.code)).toBe('kind.unknown');
  });

  test('the last one stays, and a duplicate is refused', async () => {
    const taken = await h.call('/kinds', {
      method: 'POST',
      cookie: admin,
      body: JSON.stringify({ label: 'Workshop' }),
    });
    expect(taken.status).toBe(409);
    expect(String((await refusal(taken)).diag.code)).toBe('kind.taken');

    for (const { id } of Kind.DEFAULTS.slice(0, -1)) {
      expect((await h.call(`/kinds/${id}`, { method: 'DELETE', cookie: admin })).status).toBe(200);
    }

    const last = await h.call('/kinds/other', { method: 'DELETE', cookie: admin });
    expect(last.status).toBe(409);
    expect(String((await refusal(last)).diag.code)).toBe('kind.last');
  });

  test('reading it is every member, changing it is an admin', async () => {
    expect((await h.call('/kinds', { cookie: member })).status).toBe(200);
    expect((await h.call('/kinds', { cookie: member, method: 'POST', body: '{"label":"x"}' })).status).toBe(
      403,
    );
    expect((await h.call('/kinds/social', { method: 'DELETE', cookie: member })).status).toBe(403);
    expect((await h.call('/kinds')).status).toBe(401);
  });

  test('every change is in the trail', async () => {
    await h.call('/kinds', { method: 'POST', cookie: admin, body: JSON.stringify({ label: 'regatta' }) });
    await h.call('/kinds/regatta', {
      method: 'PATCH',
      cookie: admin,
      body: JSON.stringify({ label: 'rowing' }),
    });
    await h.call('/kinds/regatta', { method: 'DELETE', cookie: admin });

    const trail = await h.store.audit.list();
    expect(trail.map((entry) => entry.act).sort()).toEqual(['kind.create', 'kind.delete', 'kind.update']);
  });
});
