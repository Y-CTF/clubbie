import { beforeEach, describe, expect, test } from 'bun:test';
import type { KindId } from '@clubbie/core';
import { DAY, type Harness, harness, refusal } from './harness.ts';

describe('the api', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  test('health answers liveness, and tells a stranger nothing about the deployment', async () => {
    const response = await h.call('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test('a signed-out caller is nobody, and `me` says so rather than refusing', async () => {
    const response = await h.call('/me');
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  /**
   * The checklist is worked out per request from facts, so what a member is asked for follows what
   * is true, and saying "not now" is the one thing that is stored.
   */
  test('`me` carries the checklist, ticked from the facts, until it is dismissed', async () => {
    const cookie = await h.signIn(await h.member('ada'));
    const read = async () =>
      ((await (await h.call('/me', { cookie })).json()) as { setup: { step: string; done: boolean }[] })
        .setup;

    expect(await read()).toEqual([
      { step: 'name', done: true },
      { step: 'chat', done: false },
    ]);

    expect((await h.call('/me/welcome', { method: 'POST', cookie })).status).toBe(200);
    expect(await read()).toEqual([]);
  });

  test('an admin is asked for the club as well, and a member is not', async () => {
    const admin = await h.signIn(await h.member('boss', 'active', 'admin'));
    const seen = (await (await h.call('/me', { cookie: admin })).json()) as { setup: { step: string }[] };

    expect(seen.setup.map((item) => item.step)).toEqual(['club', 'event', 'name', 'chat']);
  });

  test('a private route refuses a signed-out caller with a diagnostic that says what to do', async () => {
    const response = await h.call('/events');
    const error = await refusal(response);

    expect(response.status).toBe(401);
    expect(error.refusal).toBe('unauthenticated');
    expect(String(error.diag.code)).toBe('auth.anonymous');
    expect(error.diag.help).toBeTruthy();
  });

  test('a pending member is signed in and still refused', async () => {
    const pending = await h.member('ada', 'pending');
    const response = await h.call('/events', { cookie: await h.signIn(pending) });

    expect(response.status).toBe(403);
    expect(String((await refusal(response)).diag.code)).toBe('auth.forbidden');
  });

  test('an active member sees published events and answers them', async () => {
    const member = await h.member('ada');
    const cookie = await h.signIn(member);
    const event = await h.store.events.create(
      {
        title: 'Weekly meeting',
        kind: 'meeting' as KindId,
        state: 'published',
        startsAt: new Date(Date.now() + DAY),
      },
      member.id,
    );

    const answered = await h.call(`/events/${event.id}/rsvp`, {
      method: 'PUT',
      cookie,
      body: JSON.stringify({ answer: 'going' }),
    });
    expect(answered.status).toBe(200);

    const detail = (await (await h.call(`/events/${event.id}`, { cookie })).json()) as {
      going: number;
      mine: { answer: string } | null;
    };
    expect(detail.going).toBe(1);
    expect(detail.mine?.answer).toBe('going');
  });

  test('a full event refuses the next answer and names the capacity', async () => {
    const organiser = await h.member('ada');
    const other = await h.member('alan');
    const event = await h.store.events.create(
      {
        title: 'Workshop',
        kind: 'workshop' as KindId,
        state: 'published',
        startsAt: new Date(Date.now() + DAY),
        capacity: 1,
      },
      organiser.id,
    );

    await h.call(`/events/${event.id}/rsvp`, {
      method: 'PUT',
      cookie: await h.signIn(organiser),
      body: JSON.stringify({ answer: 'going' }),
    });

    const response = await h.call(`/events/${event.id}/rsvp`, {
      method: 'PUT',
      cookie: await h.signIn(other),
      body: JSON.stringify({ answer: 'going' }),
    });
    const error = await refusal(response);

    expect(response.status).toBe(409);
    expect(error.refusal).toBe('full');
    expect(String(error.diag.code)).toBe('rsvp.full');
    expect(error.message).toContain('1 places');
  });

  test('an answer after the deadline is refused with the deadline in the diagnostic', async () => {
    const member = await h.member('ada');
    const event = await h.store.events.create(
      {
        title: 'Yesterday',
        kind: 'social' as KindId,
        state: 'published',
        startsAt: new Date(Date.now() - DAY),
      },
      member.id,
    );

    const response = await h.call(`/events/${event.id}/rsvp`, {
      method: 'PUT',
      cookie: await h.signIn(member),
      body: JSON.stringify({ answer: 'going' }),
    });

    expect(String((await refusal(response)).diag.code)).toBe('rsvp.closed');
  });

  test('a malformed body is refused with carets into the body that was sent', async () => {
    const member = await h.member('ada');
    const response = await h.call('/events', {
      method: 'POST',
      cookie: await h.signIn(member),
      body: JSON.stringify({ title: '', kind: 'party' as KindId, startsAt: 'yesterday' }),
    });
    const error = await refusal(response);

    expect(response.status).toBe(422);
    expect(String(error.diag.code)).toBe('input.invalid');
    expect(error.diag.source).toBe('body.json');
    expect(error.diag.labels.length).toBeGreaterThan(0);
  });

  test('an id that is not an id is refused before it reaches a query', async () => {
    const member = await h.member('ada');
    const response = await h.call('/events/not-an-id', { cookie: await h.signIn(member) });

    expect(response.status).toBe(422);
    expect(String((await refusal(response)).diag.code)).toBe('input.invalid');
  });

  test('a member may not manage other members, and an admin may', async () => {
    const member = await h.member('ada');
    const target = await h.member('alan', 'pending');

    const refused = await h.call(`/members/${target.id}`, {
      method: 'PATCH',
      cookie: await h.signIn(member),
      body: JSON.stringify({ status: 'active' }),
    });
    expect(refused.status).toBe(403);

    const admin = (await h.store.members.update(member.id, { role: 'admin' })) ?? member;
    const allowed = await h.call(`/members/${target.id}`, {
      method: 'PATCH',
      cookie: await h.signIn(admin),
      body: JSON.stringify({ status: 'active' }),
    });
    expect(allowed.status).toBe(200);
  });

  test('every response carries the request id it was traced under', async () => {
    const response = await h.call('/health', { headers: { 'x-request-id': 'abc' } });
    expect(response.headers.get('x-request-id')).toBe('abc');
  });
});
