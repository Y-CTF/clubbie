import { beforeEach, describe, expect, test } from 'bun:test';
import { Job, type KindId, Zone } from '@clubbie/core';
import { DAY, type Harness, harness, NOW, refusal } from './harness.ts';

const ZURICH = 'Europe/Zurich';

/**
 * Editing a repeating event, and the two halves of one costing different things.
 *
 * The template carries: a room that changed has changed for every night still to come, and
 * every answer to those nights survives. The rule cannot carry, because a night on a different
 * date is a different night, so the future is dropped and stamped again and the organiser is told
 * how many answers that took with it.
 */
describe('editing a schedule', () => {
  let h: Harness;
  let admin: string;

  async function make(over: Record<string, unknown> = {}): Promise<{ id: string }> {
    const response = await h.call('/schedules', {
      method: 'POST',
      cookie: admin,
      body: JSON.stringify({
        title: 'Weekly meeting',
        kind: 'meeting' as KindId,
        location: 'HG F 30',
        /** Anchored ahead of the real clock: a schedule is only ever expanded forwards. */
        startsAt: new Date(Date.now() + DAY).toISOString(),
        minutes: 120,
        freq: 'weekly',
        interval: 1,
        count: 6,
        ...over,
      }),
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string };
  }

  async function patch(id: string, body: Record<string, unknown>): Promise<Response> {
    return h.call(`/schedules/${id}`, { method: 'PATCH', cookie: admin, body: JSON.stringify(body) });
  }

  beforeEach(async () => {
    h = await harness();
    admin = await h.signIn(await h.member('ada', 'active', 'admin'));
  });

  test('a changed room reaches every night that has not happened, and keeps the answers', async () => {
    const schedule = await make();
    const [first] = await h.store.events.list({ scheduleId: schedule.id as never });
    expect(first).toBeDefined();

    const alan = await h.member('alan');
    await h.call(`/events/${first?.event.id}/rsvp`, {
      method: 'PUT',
      cookie: await h.signIn(alan),
      body: JSON.stringify({ answer: 'going' }),
    });

    const response = await patch(schedule.id, { location: 'CAB E 72' });
    expect(response.status).toBe(200);

    const answer = (await response.json()) as { updated: number; dropped: number };
    expect(answer.dropped).toBe(0);
    expect(answer.updated).toBeGreaterThan(0);

    const after = await h.store.events.byId(first?.event.id as never);
    expect(after?.location).toBe('CAB E 72');
    expect(await h.store.rsvps.byMember(first?.event.id as never, alan.id)).not.toBeNull();
  });

  /**
   * A rule that really does move its nights drops them, because a night on a different date is a
   * different night. Two occurrences of one schedule cannot share a start either, so the drop has
   * to happen before the stamp or the unique index would refuse every new night silently.
   */
  test('a changed rule drops the nights it no longer asks for and stamps the new ones', async () => {
    const schedule = await make();
    const before = await h.store.events.list({ scheduleId: schedule.id as never });
    expect(before.length).toBeGreaterThan(1);

    const response = await patch(schedule.id, { freq: 'monthly' });
    expect(response.status).toBe(200);

    const answer = (await response.json()) as { dropped: number; created: number };
    expect(answer.created).toBeGreaterThan(0);

    const after = await h.store.events.list({ scheduleId: schedule.id as never });
    const dates = after.map((one) => one.event.startsAt.toISOString());
    expect(new Set(dates).size).toBe(dates.length);
    /** The first night is the anchor, which every rule produces, so it is never dropped. */
    expect(dates).toContain((before[0] as { event: { startsAt: Date } }).event.startsAt.toISOString());
  });

  /**
   * The bug this guards: any rule change deleted every future night, so an organiser extending the
   * term by a fortnight lost every answer, guest and attendance mark on the nights already booked.
   * These two edits move nothing, and must cost nothing.
   */
  test('widening a term keeps the nights already on the calendar, and their answers', async () => {
    const schedule = await make();
    const before = await h.store.events.list({ scheduleId: schedule.id as never });
    const first = before[0]?.event.id as never;

    const alan = await h.member('alan');
    await h.call(`/events/${first}/rsvp`, {
      method: 'PUT',
      cookie: await h.signIn(alan),
      body: JSON.stringify({ answer: 'going' }),
    });

    const response = await patch(schedule.id, { count: 8 });
    const answer = (await response.json()) as { dropped: number; created: number };

    expect(answer.dropped).toBe(0);
    expect(await h.store.events.byId(first)).not.toBeNull();
    expect((await h.store.rsvps.byMember(first, alan.id))?.answer).toBe('going');

    const after = await h.store.events.list({ scheduleId: schedule.id as never });
    expect(after.length).toBeGreaterThan(before.length);
  });

  test('a longer evening keeps every night, and moves its end', async () => {
    const schedule = await make();
    const [first] = await h.store.events.list({ scheduleId: schedule.id as never });
    const night = first?.event.id as never;

    const alan = await h.member('bea');
    await h.call(`/events/${night}/rsvp`, {
      method: 'PUT',
      cookie: await h.signIn(alan),
      body: JSON.stringify({ answer: 'going' }),
    });

    const response = await patch(schedule.id, { minutes: 90 });
    const answer = (await response.json()) as { dropped: number };
    expect(answer.dropped).toBe(0);

    const after = await h.store.events.byId(night);
    expect(after).not.toBeNull();
    expect((await h.store.rsvps.byMember(night, alan.id))?.answer).toBe('going');
    const night90 = after as { startsAt: Date; endsAt: Date };
    expect(night90.endsAt.getTime() - night90.startsAt.getTime()).toBe(90 * 60_000);
  });

  test('a capacity carried onto a full night gives the waiting member the new place', async () => {
    const schedule = await make({ capacity: 1 });
    const [first] = await h.store.events.list({ scheduleId: schedule.id as never });
    const night = first?.event.id as never;

    const ada = await h.member('bea');
    const alan = await h.member('cal');
    await h.call(`/events/${night}/rsvp`, {
      method: 'PUT',
      cookie: await h.signIn(ada),
      body: JSON.stringify({ answer: 'going' }),
    });
    await h.call(`/events/${night}/rsvp`, {
      method: 'PUT',
      cookie: await h.signIn(alan),
      body: JSON.stringify({ answer: 'waitlist' }),
    });
    expect((await h.store.rsvps.byMember(night, alan.id))?.answer).toBe('waitlist');

    expect((await patch(schedule.id, { capacity: 2 })).status).toBe(200);
    expect((await h.store.rsvps.byMember(night, alan.id))?.answer).toBe('going');
  });

  test('a rule that ends before it begins is refused with the dates in the diagnostic', async () => {
    const schedule = await make();
    const response = await patch(schedule.id, { until: NOW.toISOString() });

    expect(response.status).toBe(422);
    expect(String((await refusal(response)).diag.code)).toBe('schedule.range');
  });

  test('an ordinary member may not edit one', async () => {
    const schedule = await make();
    const theirs = await h.signIn(await h.member('dee'));

    const response = await h.call(`/schedules/${schedule.id}`, {
      method: 'PATCH',
      cookie: theirs,
      body: JSON.stringify({ title: 'mine now' }),
    });
    expect(response.status).toBe(403);
  });

  test('the nights a schedule offers are the ones still to come, in the club zone', async () => {
    await h.store.club.update({ timezone: ZURICH });

    /**
     * Anchored in January of this year, which is behind the clock on purpose: what the listing has
     * to answer with is the nights still to come, at the wall clock the rule was written in, and a
     * rule that only ever showed the front of itself would show a winter that has happened.
     */
    const startsAt = Zone.instant(
      { ...Zone.parts(new Date(), ZURICH), month: 1, day: 5, hour: 19, minute: 0, second: 0 },
      ZURICH,
    );
    await make({ startsAt: startsAt.toISOString(), count: null });

    const listing = await h.call('/schedules', { cookie: admin });
    const rows = (await listing.json()) as { next: string[] }[];
    const next = rows[0]?.next ?? [];

    expect(next.length).toBeGreaterThan(1);
    for (const at of next) {
      expect(Zone.parts(new Date(at), ZURICH).hour).toBe(19);
      expect(new Date(at).getTime()).toBeGreaterThan(Date.now());
    }
  });
});

/**
 * The queue an admin can see. Acting on a job is a person's decision rather than a fourth attempt,
 * and the route never moves one a drainer is holding.
 */
describe('the jobs screen', () => {
  let h: Harness;
  let admin: string;

  async function spend(): Promise<string> {
    const event = await h.event(await h.member('zed', 'active', 'member'));
    const job = await h.store.jobs.schedule('event.announce', { eventId: event.id }, NOW, NOW);

    for (let attempt = 0; attempt < Job.TRIES; attempt++) {
      const [claimed] = await h.store.jobs.claim(new Date(NOW.getTime() + Job.BACKOFF * 8));
      if (claimed) await h.store.jobs.failed(claimed, 'the provider said no', NOW);
    }
    return job.id;
  }

  beforeEach(async () => {
    h = await harness();
    admin = await h.signIn(await h.member('ada', 'active', 'admin'));
  });

  test('lists what did not get sent, with the reason', async () => {
    await spend();

    const response = await h.call('/jobs', { cookie: admin });
    expect(response.status).toBe(200);

    const { jobs: failures, total } = (await response.json()) as {
      jobs: { kind: string; error: string; attempts: number }[];
      total: number;
    };
    expect(total).toBe(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.kind).toBe('event.announce');
    expect(failures[0]?.error).toBe('the provider said no');
    expect(failures[0]?.attempts).toBe(Job.TRIES);
  });

  test('a retry puts it back in the queue, and a second one is refused', async () => {
    const id = await spend();

    expect((await h.call(`/jobs/${id}/retry`, { method: 'POST', cookie: admin })).status).toBe(200);
    expect(await h.store.jobs.claim(new Date())).toHaveLength(1);

    const again = await h.call(`/jobs/${id}/retry`, { method: 'POST', cookie: admin });
    expect(again.status).toBe(409);
    expect(String((await refusal(again)).diag.code)).toBe('job.state');
  });

  test('a discarded job is gone', async () => {
    const id = await spend();

    expect((await h.call(`/jobs/${id}`, { method: 'DELETE', cookie: admin })).status).toBe(200);
    const left = await h.call('/jobs', { cookie: admin });
    expect(await left.json()).toEqual({
      jobs: [],
      total: 0,
      tally: { pending: 0, running: 0, done: 0, failed: 0 },
    });
  });

  test('an ordinary member sees none of it', async () => {
    const theirs = await h.signIn(await h.member('dee'));
    expect((await h.call('/jobs', { cookie: theirs })).status).toBe(403);
  });
});
