import { beforeEach, describe, expect, test } from 'bun:test';
import { type EventId, Job, type MemberId } from '@clubbie/core';
import type { Store } from '../src/index.ts';
import { Fixture } from './harness.ts';

const NOW = new Date('2026-03-01T12:00:00Z');
const LATER = new Date(NOW.getTime() + 60_000);
const EVENT = 'EVENT' as EventId;

let store: Store;

beforeEach(async () => {
  store = await Fixture.open();
});

describe('the queue', () => {
  test('a job that is not due yet is not claimed', async () => {
    await store.jobs.schedule('event.announce', { eventId: EVENT }, LATER, NOW);
    expect(await store.jobs.claim(NOW)).toHaveLength(0);
    expect(await store.jobs.claim(LATER)).toHaveLength(1);
  });

  test('a claimed job is not claimed twice', async () => {
    await store.jobs.schedule('event.announce', { eventId: EVENT }, NOW, NOW);

    expect(await store.jobs.claim(NOW)).toHaveLength(1);
    expect(await store.jobs.claim(NOW)).toHaveLength(0);
  });

  test('a job whose lease expired is handed out again', async () => {
    await store.jobs.schedule('event.announce', { eventId: EVENT }, NOW, NOW);
    await store.jobs.claim(NOW);

    /** The process that took it died: past the lease, the work is owed to somebody else. */
    const after = new Date(NOW.getTime() + Job.LEASE + 1000);
    expect(await store.jobs.claim(after)).toHaveLength(1);
  });

  test('a failure is retried with a longer fuse, then left where a person finds it', async () => {
    await store.jobs.schedule('event.remind', { eventId: EVENT }, NOW, NOW);

    for (let attempt = 1; attempt <= Job.TRIES; attempt++) {
      const [claimed] = await store.jobs.claim(new Date(NOW.getTime() + attempt * Job.BACKOFF * 4));
      expect(claimed).toBeDefined();
      await store.jobs.failed(claimed as Job, 'the provider said no', NOW);
    }

    const failures = await store.jobs.list({ state: 'failed' });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.attempts).toBe(Job.TRIES);
    expect(failures[0]?.error).toBe('the provider said no');
  });

  test('a finished job is dropped by a sweep, a pending one is not', async () => {
    await store.jobs.schedule('event.announce', { eventId: EVENT }, NOW, NOW);
    await store.jobs.schedule('event.remind', { eventId: EVENT }, NOW, NOW);

    /** One tick claims both, so the survivor is the one this tick did not finish. */
    const [finished, other] = await store.jobs.claim(NOW);
    await store.jobs.done(finished as Job);

    expect(await store.jobs.sweep(new Date(NOW.getTime() + 1000))).toBe(1);
    expect(await store.jobs.byId((finished as Job).id)).toBeNull();
    expect(await store.jobs.byId((other as Job).id)).not.toBeNull();
  });

  /**
   * The bug this guards: a worker that stalled past its lease had the job handed to somebody else,
   * who sent it. When the first one woke up, its `done` wrote over the second one's claim, and its
   * `failed` put an announcement that had already gone out back into the queue for a third send.
   */
  test('a worker whose lease was taken away reports on nothing', async () => {
    await store.jobs.schedule('event.announce', { eventId: EVENT }, NOW, NOW);

    const [stalled] = await store.jobs.claim(NOW);
    const later = new Date(NOW.getTime() + Job.LEASE + 1000);
    expect(await store.jobs.reclaim(later)).toBe(1);

    const [second] = await store.jobs.claim(later);
    expect(second?.id).toBe((stalled as Job).id);

    await store.jobs.failed(stalled as Job, 'the provider said no', later);
    expect(await store.jobs.claim(later)).toHaveLength(0);
    expect(await store.jobs.list({ state: 'failed' })).toHaveLength(0);

    await store.jobs.done(second as Job);
    expect(await store.jobs.claim(later)).toHaveLength(0);
  });

  /** The bug this guards: cancelling an announcement also dropped a promotion somebody was owed. */
  test('cancelling one kind leaves another about the same event alone', async () => {
    await store.jobs.schedule('event.announce', { eventId: EVENT }, NOW, NOW);
    await store.jobs.schedule('rsvp.promoted', { eventId: EVENT, memberId: 'MEMBER' as MemberId }, NOW, NOW);

    expect(await store.jobs.cancel('event.announce', { eventId: EVENT })).toBe(1);

    const left = await store.jobs.claim(NOW);
    expect(left).toHaveLength(1);
    expect(left[0]?.kind).toBe('rsvp.promoted');
  });

  test('a claimed batch keeps the order the jobs were due in', async () => {
    await store.jobs.schedule('event.remind', { eventId: 'LATE' as EventId }, LATER, NOW);
    await store.jobs.schedule('event.announce', { eventId: EVENT }, NOW, NOW);

    const claimed = await store.jobs.claim(new Date(LATER.getTime() + 1000));
    expect(claimed.map((job) => job.kind)).toEqual(['event.announce', 'event.remind']);
  });
  /**
   * What the failed-job screen does. Both writes re-assert `failed` rather than trusting the row
   * the page was rendered from: a job somebody else has already put back, or that a drainer has
   * since claimed, must not be dragged out of the state it is in and sent twice.
   */
  describe('a spent job', () => {
    async function spend(): Promise<Job> {
      const job = await store.jobs.schedule('event.announce', { eventId: EVENT }, NOW, NOW);
      for (let attempt = 0; attempt < Job.TRIES; attempt++) {
        const [claimed] = await store.jobs.claim(new Date(NOW.getTime() + Job.BACKOFF * 8));
        await store.jobs.failed(claimed as Job, 'the provider said no', NOW);
      }
      return job;
    }

    test('goes back into the queue with its attempts wound back', async () => {
      const job = await spend();

      expect(await store.jobs.requeue(job.id, NOW)).toBe(true);
      const due = await store.jobs.claim(NOW);
      expect(due.map((one) => one.id)).toEqual([job.id]);
      expect(due[0]?.attempts).toBe(0);
      expect(await store.jobs.list({ state: 'failed' })).toHaveLength(0);
    });

    test('is put back once however many times a page is pressed', async () => {
      const job = await spend();

      expect(await store.jobs.requeue(job.id, NOW)).toBe(true);
      expect(await store.jobs.requeue(job.id, NOW)).toBe(true);
      expect(await store.jobs.claim(NOW)).toHaveLength(1);
    });

    test('can be thrown away, and is gone the second time', async () => {
      const job = await spend();

      expect(await store.jobs.drop(job.id)).toBe(true);
      expect(await store.jobs.byId(job.id)).toBeNull();
      expect(await store.jobs.drop(job.id)).toBe(false);
    });
  });

  /**
   * What the jobs screen may do to a job that has not failed. A job waiting its turn is a job an
   * admin can send now or call off; a job a drainer is holding is neither, because the row is not
   * theirs to move and the drainer is about to report on it.
   */
  describe('a job that has not failed', () => {
    test('is run now when it is only waiting, and can be called off', async () => {
      const soon = await store.jobs.schedule('event.announce', { eventId: EVENT }, LATER, NOW);
      expect(await store.jobs.claim(NOW)).toHaveLength(0);

      expect(await store.jobs.requeue(soon.id, NOW)).toBe(true);
      expect((await store.jobs.claim(NOW)).map((one) => one.id)).toEqual([soon.id]);

      const called = await store.jobs.schedule('event.remind', { eventId: EVENT }, LATER, NOW);
      expect(await store.jobs.drop(called.id)).toBe(true);
    });

    test('is left alone while a drainer is holding it', async () => {
      await store.jobs.schedule('event.announce', { eventId: EVENT }, NOW, NOW);
      const [claimed] = await store.jobs.claim(NOW);
      const running = (claimed as Job).id;

      expect(await store.jobs.requeue(running, NOW)).toBe(false);
      expect(await store.jobs.drop(running)).toBe(false);
      expect((await store.jobs.byId(running))?.state).toBe('running');
    });
  });

  /** What the screen reads: a filtered page, its total, and how much work is in each state. */
  describe('the queue as a screen reads it', () => {
    test('filters by state and by kind, and counts what it filtered', async () => {
      await store.jobs.schedule('event.announce', { eventId: EVENT }, NOW, NOW);
      await store.jobs.schedule('event.remind', { eventId: EVENT }, LATER, NOW);
      await store.jobs.schedule('sweep', {}, LATER, NOW);

      expect(await store.jobs.count()).toBe(3);
      expect(await store.jobs.count({ kind: 'sweep' })).toBe(1);
      expect((await store.jobs.list({ kind: 'event.remind' })).map((one) => one.kind)).toEqual([
        'event.remind',
      ]);

      await store.jobs.claim(NOW);
      expect(await store.jobs.count({ state: 'running' })).toBe(1);
      expect(await store.jobs.tally()).toEqual({ pending: 2, running: 1, done: 0, failed: 0 });
    });

    test('pages the newest first, without repeating a row', async () => {
      for (let index = 0; index < 5; index++) {
        await store.jobs.schedule('event.remind', { eventId: `E${index}` as EventId }, NOW, NOW);
      }

      const first = await store.jobs.list({ limit: 2, offset: 0 });
      const second = await store.jobs.list({ limit: 2, offset: 2 });

      expect(first).toHaveLength(2);
      expect(new Set([...first, ...second].map((one) => one.id)).size).toBe(4);
    });
  });
});
