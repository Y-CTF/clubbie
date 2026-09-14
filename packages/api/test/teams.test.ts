import { beforeEach, describe, expect, test } from 'bun:test';
import { type Event, type KindId, Team } from '@clubbie/core';
import { Codes } from '../src/codes.ts';
import { DAY, type Harness, harness, refusal } from './harness.ts';

let h: Harness;
let admin: string;
let organiser: Awaited<ReturnType<Harness['member']>>;

beforeEach(async () => {
  h = await harness();
  organiser = await h.member('ada', 'active', 'admin');
  admin = await h.signIn(organiser);
});

/** An event that takes teams, with whatever size and maker a test wants to try. */
async function evening(over: Partial<Event> = {}): Promise<Event> {
  return h.store.events.create(
    {
      title: 'CTF night',
      kind: 'workshop' as KindId,
      state: 'published',
      startsAt: new Date(Date.now() + DAY),
      teams: true,
      ...over,
    },
    organiser.id,
  );
}

async function make(event: Event, name: string, cookie: string): Promise<Response> {
  return await h.call(`/events/${event.id}/teams`, {
    method: 'POST',
    cookie,
    body: JSON.stringify({ name }),
  });
}

async function team(event: Event, name: string, cookie: string): Promise<{ id: string }> {
  const response = await make(event, name, cookie);
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string };
}

describe('teams on an event', () => {
  test('an event that does not use them refuses every team act', async () => {
    const ordinary = await evening({ teams: false });

    const response = await make(ordinary, 'Alpha', admin);
    expect(response.status).toBe(409);
    expect((await refusal(response)).diag.code).toBe(Codes.team.off);
  });

  test('starting one puts the captain on it', async () => {
    const event = await evening();
    const made = (await (await make(event, 'Alpha', admin)).json()) as {
      name: string;
      captainId: string;
      members: { id: string }[];
    };

    expect(made.name).toBe('Alpha');
    expect(made.captainId).toBe(organiser.id);
    expect(made.members.map((one) => one.id)).toEqual([organiser.id]);
  });

  test('an ordinary member may start one when the event says members may', async () => {
    const event = await evening({ teamsBy: 'member' });
    const alan = await h.signIn(await h.member('alan'));

    expect((await make(event, 'Beta', alan)).status).toBe(201);
  });

  test('and may not when the event says only organisers may', async () => {
    const event = await evening({ teamsBy: 'organiser' });
    const alan = await h.signIn(await h.member('alan'));

    expect((await make(event, 'Beta', alan)).status).toBe(403);
    /** The organiser still may, whatever the setting says: it is about the members. */
    expect((await make(event, 'Beta', admin)).status).toBe(201);
  });

  test('one member is on one team per event', async () => {
    const event = await evening();
    await team(event, 'Alpha', admin);

    const response = await make(event, 'Beta', admin);
    expect(response.status).toBe(409);
  });

  test('joining fills a team up to its size and no further', async () => {
    const event = await evening({ teamSize: 2 });
    const alpha = await team(event, 'Alpha', admin);

    const alan = await h.signIn(await h.member('alan'));
    const grace = await h.signIn(await h.member('grace'));

    expect(
      (await h.call(`/events/${event.id}/teams/${alpha.id}/join`, { method: 'POST', cookie: alan })).status,
    ).toBe(200);

    const full = await h.call(`/events/${event.id}/teams/${alpha.id}/join`, {
      method: 'POST',
      cookie: grace,
    });
    expect(full.status).toBe(409);
  });

  test('a team with no stated size takes everybody', async () => {
    const event = await evening({ teamSize: null });
    const alpha = await team(event, 'Alpha', admin);

    for (const name of ['alan', 'grace', 'ken']) {
      const cookie = await h.signIn(await h.member(name));
      const response = await h.call(`/events/${event.id}/teams/${alpha.id}/join`, {
        method: 'POST',
        cookie,
      });
      expect(response.status).toBe(200);
    }
  });

  /** The other three did not leave, so the team does not go with whoever started it. */
  test('a captain who leaves hands the team to whoever has been on it longest', async () => {
    const event = await evening();
    const alpha = await team(event, 'Alpha', admin);

    const alan = await h.member('alan');
    const cookie = await h.signIn(alan);
    await h.call(`/events/${event.id}/teams/${alpha.id}/join`, { method: 'POST', cookie });

    await h.call(`/events/${event.id}/teams/mine`, { method: 'DELETE', cookie: admin });

    const listing = (await (await h.call(`/events/${event.id}/teams`, { cookie })).json()) as {
      teams: { id: string; captainId: string }[];
    };
    expect(listing.teams).toHaveLength(1);
    expect(listing.teams[0]?.captainId).toBe(alan.id);
  });

  test('and the last one out takes the team with them', async () => {
    const event = await evening();
    await team(event, 'Alpha', admin);

    await h.call(`/events/${event.id}/teams/mine`, { method: 'DELETE', cookie: admin });

    const listing = (await (await h.call(`/events/${event.id}/teams`, { cookie: admin })).json()) as {
      teams: unknown[];
    };
    expect(listing.teams).toHaveLength(0);
  });

  test('only the captain or an organiser renames one', async () => {
    const event = await evening({ teamsBy: 'member' });
    const alan = await h.signIn(await h.member('alan'));
    const theirs = await team(event, 'Beta', alan);

    const grace = await h.signIn(await h.member('grace'));
    const rename = (cookie: string) =>
      h.call(`/events/${event.id}/teams/${theirs.id}`, {
        method: 'PATCH',
        cookie,
        body: JSON.stringify({ name: 'Gamma' }),
      });

    expect((await rename(grace)).status).toBe(403);
    expect((await rename(alan)).status).toBe(200);
    /** An organiser may, whoever the captain is. */
    expect((await rename(admin)).status).toBe(200);
  });

  /** A team that changed after the deadline is a team the organiser printed a sheet for. */
  test('teams stop changing when answers close', async () => {
    const event = await evening({ closesAt: new Date(Date.now() - 1000) });

    const response = await make(event, 'Alpha', admin);
    expect(response.status).toBe(409);
    expect((await refusal(response)).diag.code).toBe(Codes.team.settled);
  });

  test('the listing says which team is the caller’s own', async () => {
    const event = await evening();
    const alpha = await team(event, 'Alpha', admin);

    const mine = (await (await h.call(`/events/${event.id}/teams`, { cookie: admin })).json()) as {
      mine: string | null;
    };
    expect(mine.mine).toBe(alpha.id);

    const alan = await h.signIn(await h.member('alan'));
    const theirs = (await (await h.call(`/events/${event.id}/teams`, { cookie: alan })).json()) as {
      mine: string | null;
    };
    expect(theirs.mine).toBeNull();
  });

  test('a team name is one line and not endless', async () => {
    const event = await evening();

    expect((await make(event, '', admin)).status).toBe(422);
    expect((await make(event, 'a'.repeat(Team.NAME + 1), admin)).status).toBe(422);
    expect((await make(event, 'one\ntwo', admin)).status).toBe(422);
  });

  test('a draft nobody may see has no teams to read either', async () => {
    const draft = await evening({ state: 'draft' });
    const alan = await h.signIn(await h.member('alan'));

    expect((await h.call(`/events/${draft.id}/teams`, { cookie: alan })).status).toBe(404);
  });
});
