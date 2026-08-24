import { beforeEach, describe, expect, test } from 'bun:test';
import { Job, type KindId, type Member, Rsvp } from '@clubbie/core';
import { Logger } from '@clubbie/log';
import { type Message, Notify, type Sender } from '@clubbie/notify';
import { Store } from '@clubbie/store';
import { Scheduler } from '../src/scheduler.ts';

/**
 * What a retried reminder does.
 *
 * `POST /jobs/:id/retry` puts a spent job back due *now* with its attempts wound back, so a
 * reminder queued for one evening can run weeks later. The bug this guards: `remind` checked only
 * that the event was still published, and an event three weeks past still is, so an admin clearing
 * their failed-job screen mailed the whole club that a night in February is tomorrow.
 */
const NOW = new Date('2026-03-01T12:00:00Z');
const WEEK = 7 * 24 * 60 * 60 * 1000;
const BASE = 'http://localhost:3000';

let store: Store;
let sent: { to: string; message: Message }[];
let scheduler: Scheduler;

const recorder: Sender = {
  channel: 'email',
  async send(to, message) {
    sent.push({ to, message });
  },
};

async function member(name: string): Promise<Member> {
  const enrolled = await store.members.enroll(
    { provider: 'test', subject: name, email: `${name}@example.org`, name, avatar: null },
    NOW,
  );
  return (await store.members.update(enrolled.id, { status: 'active' })) ?? enrolled;
}

beforeEach(async () => {
  const { log } = Logger.memory();
  store = await Store.open(Store.MEMORY, log);
  sent = [];
  scheduler = new Scheduler({ store, notify: new Notify(store, [recorder], log), log, baseUrl: BASE });
});

describe('a reminder about an event that already happened', () => {
  test('is dropped rather than sent', async () => {
    const ada = await member('ada');
    const night = await store.events.create(
      {
        title: 'Training night',
        kind: 'meeting' as KindId,
        state: 'published',
        startsAt: new Date(NOW.getTime() - 3 * WEEK),
      },
      ada.id,
      NOW,
    );
    await store.rsvps.answer(night.id, ada.id, Rsvp.IMPLIED, NOW);

    /** Spent the way a worker spends one, then put back by hand: pending, no attempts, due now. */
    const job = await store.jobs.schedule('event.remind', { eventId: night.id }, NOW, NOW);
    const [claimed] = await store.jobs.claim(NOW);
    const spent = new Job({ ...(claimed as Job), attempts: Job.TRIES - 1 });
    await store.jobs.failed(spent, 'the provider said no', NOW);
    expect(await store.jobs.requeue(job.id, NOW)).toBe(true);

    expect(await scheduler.tick(NOW)).toBe(1);
    expect(sent).toHaveLength(0);
    /** Dropped, not failed: there is nothing left to retry and nothing to put on the screen. */
    expect(await store.jobs.list({ state: 'failed' })).toHaveLength(0);
  });

  test('a reminder about a night still to come is sent', async () => {
    const ada = await member('ada');
    const night = await store.events.create(
      {
        title: 'Training night',
        kind: 'meeting' as KindId,
        state: 'published',
        startsAt: new Date(NOW.getTime() + WEEK),
      },
      ada.id,
      NOW,
    );
    await store.rsvps.answer(night.id, ada.id, Rsvp.IMPLIED, NOW);
    await store.jobs.schedule('event.remind', { eventId: night.id }, NOW, NOW);

    await scheduler.tick(NOW);
    expect(sent).toHaveLength(1);
  });
});
