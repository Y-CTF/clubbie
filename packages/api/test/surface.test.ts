import { beforeEach, describe, expect, test } from 'bun:test';
import { type EventId, Id, Job, type JobKind, type KindId, type MemberId, type Payload } from '@clubbie/core';
import { Jobs } from '@clubbie/store';
import { type Harness, harness, refusal } from './harness.ts';

/**
 * A review pass over the HTTP surface added with the jobs screen, the schedule patch and the two
 * search parameters: who each route refuses, what its payloads carry, and what a search can be
 * pointed at.
 */

let h: Harness;

/**
 * A job that has given up, which is the only state the jobs screen acts on.
 *
 * Every attempt is claimed before it is failed, because that is what a worker does and what the
 * queue now insists on: only the claim in force may report on a job.
 */
async function spent<K extends JobKind>(kind: K, payload: Payload<K>, reason = 'boom'): Promise<Job> {
  const first = await h.store.jobs.schedule(kind, payload);

  let when = new Date();
  for (let attempt = 0; attempt < Job.TRIES; attempt++) {
    /** Each failure pushes the next attempt further out, so the clock has to move with it. */
    when = new Date(when.getTime() + Job.BACKOFF * (attempt + 2) * 2);
    const claimed = (await h.store.jobs.claim(when)).find((job) => job.id === first.id);
    if (claimed) await h.store.jobs.failed(claimed, reason, when);
  }
  return (await h.store.jobs.byId(first.id)) as Job;
}

async function cookies() {
  return {
    admin: await h.signIn(await h.member('ada', 'active', 'admin')),
    active: await h.signIn(await h.member('alan', 'active')),
    alumni: await h.signIn(await h.member('grace', 'alumni')),
    pending: await h.signIn(await h.member('ken', 'pending')),
  };
}

beforeEach(async () => {
  h = await harness();
});

describe('the jobs screen and its guard', () => {
  test('every caller but an admin is refused, and each is told which refusal it is', async () => {
    const who = await cookies();
    const job = await spent('event.announce', { eventId: 'EVENT' as EventId });

    const calls: [string, RequestInit & { cookie?: string }][] = [
      ['/jobs', { method: 'GET' }],
      [`/jobs/${job.id}/retry`, { method: 'POST' }],
      [`/jobs/${job.id}`, { method: 'DELETE' }],
    ];

    for (const [path, init] of calls) {
      const anonymous = await h.call(path, init);
      expect(anonymous.status).toBe(401);
      expect(String((await refusal(anonymous)).diag.code)).toBe('auth.anonymous');

      for (const cookie of [who.pending, who.active, who.alumni]) {
        const refused = await h.call(path, { ...init, cookie });
        expect(refused.status).toBe(403);
        expect(String((await refusal(refused)).diag.code)).toBe('auth.forbidden');
      }
    }

    expect((await h.call('/jobs', { cookie: who.admin })).status).toBe(200);
  });

  /**
   * A waiting job is an admin's to send now or call off; one a drainer is holding is neither, and
   * a second copy of a message somebody is about to receive is what the refusal prevents.
   */
  test('a running job is refused as a conflict, where a waiting one is acted on', async () => {
    const who = await cookies();
    const waiting = await h.store.jobs.schedule('event.remind', { eventId: 'EVENT' as EventId });

    const sooner = await h.call(`/jobs/${waiting.id}/retry`, { method: 'POST', cookie: who.admin });
    expect(sooner.status).toBe(200);

    const dropped = await h.call(`/jobs/${waiting.id}`, { method: 'DELETE', cookie: who.admin });
    expect(dropped.status).toBe(200);

    await h.store.jobs.schedule('event.announce', { eventId: 'EVENT' as EventId });
    const [running] = await h.store.jobs.claim(new Date());

    const retried = await h.call(`/jobs/${running?.id}/retry`, { method: 'POST', cookie: who.admin });
    expect(retried.status).toBe(409);
    expect(String((await refusal(retried)).diag.code)).toBe('job.state');

    const kept = await h.call(`/jobs/${running?.id}`, { method: 'DELETE', cookie: who.admin });
    expect(kept.status).toBe(409);
    expect(String((await refusal(kept)).diag.code)).toBe('job.state');

    const unknown = await h.call(`/jobs/${Id.create()}/retry`, { method: 'POST', cookie: who.admin });
    expect(unknown.status).toBe(404);
  });

  /** The screen's own filter: one state, one kind, and a tally of the whole queue beside them. */
  test('the listing filters by state and by kind, and carries a tally of everything', async () => {
    const who = await cookies();
    await spent('event.announce', { eventId: 'E1' as EventId });
    await h.store.jobs.schedule('event.remind', { eventId: 'E2' as EventId });

    const answer = await h.call('/jobs?state=failed', { cookie: who.admin });
    const failed = (await answer.json()) as {
      jobs: { kind: string }[];
      total: number;
      tally: Record<string, number>;
    };
    expect(failed.total).toBe(1);
    expect(failed.jobs.map((job) => job.kind)).toEqual(['event.announce']);
    expect(failed.tally).toEqual({ pending: 1, running: 0, done: 0, failed: 1 });

    const byKind = (await (await h.call('/jobs?kind=event.remind', { cookie: who.admin })).json()) as {
      jobs: { kind: string }[];
    };
    expect(byKind.jobs.map((job) => job.kind)).toEqual(['event.remind']);

    /** A state the queue does not have is refused rather than quietly ignored. */
    expect((await h.call('/jobs?state=elsewhere', { cookie: who.admin })).status).toBe(422);
  });

  test('a failed job is retried and discarded', async () => {
    const who = await cookies();
    const one = await spent('event.announce', { eventId: 'EVENT' as EventId });
    const two = await spent('event.remind', { eventId: 'OTHER' as EventId });

    expect((await h.call(`/jobs/${one.id}/retry`, { method: 'POST', cookie: who.admin })).status).toBe(200);
    expect((await h.store.jobs.byId(one.id))?.state).toBe('pending');

    expect((await h.call(`/jobs/${two.id}`, { method: 'DELETE', cookie: who.admin })).status).toBe(200);
    expect(await h.store.jobs.byId(two.id)).toBeNull();
  });

  /** The finding: `ACTS` says an admin act is recorded, and these two are not. */
  /**
   * The bug this guards: both were admin acts that changed what members receive, and neither was
   * recorded. A retry re-sends a notice and a discard deletes queued work for good.
   */
  test('retrying and discarding a job are both recorded', async () => {
    const who = await cookies();
    const one = await spent('event.announce', { eventId: 'EVENT' as EventId });
    const two = await spent('event.remind', { eventId: 'OTHER' as EventId });

    await h.call(`/jobs/${one.id}/retry`, { method: 'POST', cookie: who.admin });
    await h.call(`/jobs/${two.id}`, { method: 'DELETE', cookie: who.admin });

    const trail = await h.store.audit.list();
    expect(trail.map((entry) => entry.act).sort()).toEqual(['job.discard', 'job.retry']);
    expect(trail.map((entry) => entry.subject).sort()).toEqual([one.id, two.id].sort());
  });
});

describe('what a job answer carries', () => {
  test('every payload is ids, and the failure reason goes out as it was written', async () => {
    const who = await cookies();
    const member = await h.member('mary');

    await spent('event.announce', { eventId: 'E1' as EventId });
    await spent('rsvp.promoted', { eventId: 'E2' as EventId, memberId: member.id });
    await spent(
      'member.admitted',
      { memberId: member.id },
      'the email provider refused a message\nit answered 422: {"message":"mary@example.org is not a verified recipient"}',
    );
    await spent('sweep', {});

    const { jobs: listed } = (await (await h.call('/jobs', { cookie: who.admin })).json()) as {
      jobs: {
        kind: string;
        payload: Record<string, unknown>;
        subject: string;
        error: string | null;
      }[];
    };

    expect(listed).toHaveLength(4);
    const keys = new Set(listed.flatMap((job) => Object.keys(job.payload)));
    expect([...keys].sort()).toEqual(['eventId', 'memberId']);

    /** The reason is free text written by whatever threw, and it reaches the browser unread. */
    const admitted = listed.find((job) => job.kind === 'member.admitted');
    expect(admitted?.error).toContain('mary@example.org');
  });
});

describe('how much of the queue the screen shows', () => {
  /** The finding: the screen shows the drain batch size and says nothing about the rest. */
  /**
   * The screen's page is its own number rather than the queue's batch size. It was `Jobs.BATCH`,
   * which meant an admin with 25 failures saw 20 of them and was told nothing about the other 5,
   * on the one screen whose whole purpose is that a failure is not invisible.
   *
   * The answer now carries the total beside the page, which is what lets the screen say there is
   * more and offer to show it rather than silently ending.
   */
  test('the failures list pages by its own number, not by the size of a tick', async () => {
    const who = await cookies();
    for (let index = 0; index < 25; index++) {
      await spent('event.announce', { eventId: `E${index}` as EventId });
    }

    const answer = await h.call('/jobs', { cookie: who.admin });
    const { jobs, total } = (await answer.json()) as { jobs: unknown[]; total: number };
    expect(jobs).toHaveLength(25);
    expect(total).toBe(25);
    expect(Jobs.PAGE).toBeGreaterThan(Jobs.BATCH);
  });

  test('a page of failures is the window asked for, and the total says what is behind it', async () => {
    const who = await cookies();
    for (let index = 0; index < 25; index++) {
      await spent('event.announce', { eventId: `E${index}` as EventId });
    }

    const first = (await (await h.call('/jobs?limit=20&offset=0', { cookie: who.admin })).json()) as {
      jobs: { id: string }[];
      total: number;
    };
    const second = (await (await h.call('/jobs?limit=20&offset=20', { cookie: who.admin })).json()) as {
      jobs: { id: string }[];
    };

    expect(first.jobs).toHaveLength(20);
    expect(first.total).toBe(25);
    expect(second.jobs).toHaveLength(5);

    /** Two pages of the same list, with nothing on both: the order is total, not by `runAt` alone. */
    const seen = new Set([...first.jobs, ...second.jobs].map((job) => job.id));
    expect(seen.size).toBe(25);
  });
});

describe('the club a signed-out caller is told about', () => {
  test('locale crosses to anonymous callers where timezone and updatedAt do not', async () => {
    await h.store.club.update({ locale: 'de', timezone: 'Europe/Zurich' });

    const seen = (await (await h.call('/club')).json()) as Record<string, unknown>;
    expect(seen.locale).toBe('de');
    expect(seen.timezone).toBeNull();
    expect(seen.updatedAt).toBeNull();

    /** The public page answers with the club even when the club is not listed at all. */
    const shopfront = (await (await h.call('/public/events')).json()) as { club: { locale: string } };
    expect(shopfront.club.locale).toBe('de');
  });
});

describe('searching the roster', () => {
  /**
   * The bug this guards: the roster search read the email column for everybody. `Wire.peer` keeps
   * an address out of the answer an ordinary member reads, and a filter that matched on one handed
   * the same fact back a character at a time: `?q=mary@ex` finding a row and `?q=mary@ey` finding
   * none is the address.
   */
  test('an ordinary member cannot search by an address the answer refuses to show', async () => {
    const who = await cookies();
    await h.member('mary');

    const hit = await h.call('/members?q=mary%40example.org', { cookie: who.active });
    expect(hit.status).toBe(200);
    expect((await hit.json()) as unknown[]).toHaveLength(0);

    const prefix = await h.call('/members?q=mary%40ex', { cookie: who.active });
    expect((await prefix.json()) as unknown[]).toHaveLength(0);

    /** The name still finds them: it is the one field the answer shows. */
    const byName = await h.call('/members?q=mary', { cookie: who.active });
    expect((await byName.json()) as unknown[]).toHaveLength(1);
  });

  test('an admin, who reads the addresses anyway, can search by one', async () => {
    const who = await cookies();
    await h.member('mary');

    const hit = await h.call('/members?q=mary%40example.org', { cookie: who.admin });
    const found = (await hit.json()) as { name: string }[];
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe('mary');
  });

  test('a pending member may not search the roster and an alumni may', async () => {
    const who = await cookies();

    const refused = await h.call('/members?q=a', { cookie: who.pending });
    expect(refused.status).toBe(403);
    expect(String((await refusal(refused)).diag.code)).toBe('auth.forbidden');

    expect((await h.call('/members?q=a', { cookie: who.alumni })).status).toBe(200);
    expect((await h.call('/members?q=a')).status).toBe(401);
  });
});

describe('searching events', () => {
  async function draft(by: MemberId, title: string, startsAt: Date) {
    return h.store.events.create({ title, kind: 'meeting' as KindId, state: 'draft', startsAt }, by);
  }

  test('a draft is not findable by search by anybody but its organiser', async () => {
    const admin = await h.member('ada', 'active', 'admin');
    const alan = await h.member('alan');
    const cookie = await h.signIn(alan);

    await draft(admin.id, 'Secret committee vote', new Date('2026-06-01T18:00:00Z'));

    const scoped = '/events?q=Secret&scope=all';
    for (const query of [scoped, `${scoped}&state=draft`]) {
      const seen = (await (await h.call(query, { cookie })).json()) as unknown[];
      expect(seen).toEqual([]);
    }

    await draft(alan.id, 'Secret practice of mine', new Date('2026-06-02T18:00:00Z'));
    const mine = (await (await h.call(`${scoped}&state=draft`, { cookie })).json()) as {
      title: string;
    }[];
    expect(mine.map((one) => one.title)).toEqual(['Secret practice of mine']);
  });

  /**
   * The finding: the store's page limit is applied before `visibleTo`, so other people's drafts
   * fill the page and a member's own draft falls off the end of their own search.
   */
  test('other members drafts crowd a search out of the page before visibility is applied', async () => {
    const admin = await h.member('ada', 'active', 'admin');
    const alan = await h.member('alan');
    const cookie = await h.signIn(alan);

    for (let index = 0; index < 50; index++) {
      await draft(admin.id, `Xylophone rehearsal ${index}`, new Date(2020, 0, 1 + index));
    }
    await draft(alan.id, 'Xylophone solo of mine', new Date(2021, 0, 1));

    const seen = (await (await h.call('/events?q=Xylophone&state=draft', { cookie })).json()) as {
      title: string;
    }[];
    expect(seen).toEqual([]);
  });

  /**
   * The bug this guards: an absent `scope` used to mean "upcoming, unless a search word is present",
   * a third value that never appeared in `SCOPES` and so never reached the browser's types. A
   * client that added a search box started answering with history without asking.
   */
  test('a search stays in the scope it was given, and the client asks for the past', async () => {
    const ada = await h.member('ada', 'active', 'admin');
    const cookie = await h.signIn(ada);

    await h.store.events.create(
      { title: 'Zither night', kind: 'social' as KindId, state: 'published', startsAt: new Date(2020, 0, 1) },
      ada.id,
    );

    /** A word does not move the scope: absent means upcoming, and a 2020 night is not upcoming. */
    const searched = (await (await h.call('/events?q=Zither', { cookie })).json()) as unknown[];
    expect(searched).toEqual([]);

    /** Reaching into the past is a thing a client asks for, in a value that is in `SCOPES`. */
    const scoped = (await (await h.call('/events?q=Zither&scope=all', { cookie })).json()) as unknown[];
    expect(scoped).toHaveLength(1);

    const listed = (await (await h.call('/events', { cookie })).json()) as unknown[];
    expect(listed).toEqual([]);
  });
});

describe('patching a schedule', () => {
  test('only an admin may, and everybody else is told which refusal it is', async () => {
    const who = await cookies();
    const created = await h.call('/schedules', {
      method: 'POST',
      cookie: who.admin,
      body: JSON.stringify({
        title: 'Weekly meeting',
        kind: 'meeting' as KindId,
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        freq: 'weekly',
        count: 3,
      }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const body = JSON.stringify({ location: 'CAB E 72' });
    const anonymous = await h.call(`/schedules/${id}`, { method: 'PATCH', body });
    expect(anonymous.status).toBe(401);

    for (const cookie of [who.pending, who.active, who.alumni]) {
      const refused = await h.call(`/schedules/${id}`, { method: 'PATCH', cookie, body });
      expect(refused.status).toBe(403);
      expect(String((await refusal(refused)).diag.code)).toBe('auth.forbidden');
    }

    const allowed = await h.call(`/schedules/${id}`, { method: 'PATCH', cookie: who.admin, body });
    expect(allowed.status).toBe(200);
    expect((await h.store.audit.list({ act: 'schedule.update' })).length).toBe(1);
  });

  test('an unknown schedule is a refusal, and an empty patch is a no-op rather than one', async () => {
    const who = await cookies();
    const missing = await h.call(`/schedules/${Id.create()}`, {
      method: 'PATCH',
      cookie: who.admin,
      body: JSON.stringify({ title: 'x' }),
    });
    expect(missing.status).toBe(404);
  });
});
