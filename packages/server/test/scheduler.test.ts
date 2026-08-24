import { beforeEach, describe, expect, test } from 'bun:test';
import { type Event, type KindId, type Member, Rsvp } from '@clubbie/core';
import { Logger } from '@clubbie/log';
import { type Message, Notify, type Sender } from '@clubbie/notify';
import { Store } from '@clubbie/store';
import { Scheduler } from '../src/scheduler.ts';

const NOW = new Date('2026-03-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const BASE = 'http://localhost:3000';

let store: Store;
let sent: { to: string; message: Message }[];
let scheduler: Scheduler;

/** A channel that records, so a test asserts on what a member would have received. */
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

async function event(organiser: Member, capacity: number | null = null): Promise<Event> {
  return store.events.create(
    {
      title: 'Training night',
      kind: 'meeting' as KindId,
      state: 'published',
      startsAt: new Date(NOW.getTime() + DAY),
      capacity,
    },
    organiser.id,
    NOW,
  );
}

beforeEach(async () => {
  const { log } = Logger.memory();
  store = await Store.open(Store.MEMORY, log);
  sent = [];
  scheduler = new Scheduler({ store, notify: new Notify(store, [recorder], log), log, baseUrl: BASE });
});

describe('the scheduler', () => {
  test('an announcement reaches every active member, with a link to the event', async () => {
    const ada = await member('ada');
    await member('alan');
    const night = await event(ada);

    await store.jobs.schedule('event.announce', { eventId: night.id }, NOW, NOW);
    expect(await scheduler.tick(NOW)).toBe(1);

    expect(sent.map((one) => one.to).sort()).toEqual(['ada@example.org', 'alan@example.org']);
    expect(sent[0]?.message.body).toContain(`${BASE}/events/${night.id}`);
  });

  test('a reminder reaches only the people who said they were coming', async () => {
    const ada = await member('ada');
    const alan = await member('alan');
    const night = await event(ada);

    await store.rsvps.answer(night.id, ada.id, Rsvp.IMPLIED, NOW);
    await store.rsvps.answer(night.id, alan.id, Rsvp.MAYBE, NOW);

    await store.jobs.schedule('event.remind', { eventId: night.id }, NOW, NOW);
    await scheduler.tick(NOW);

    expect(sent.map((one) => one.to)).toEqual(['ada@example.org']);
  });

  test('a promotion tells the one member it is about', async () => {
    const ada = await member('ada');
    const night = await event(ada, 1);

    await store.jobs.schedule('rsvp.promoted', { eventId: night.id, memberId: ada.id }, NOW, NOW);
    await scheduler.tick(NOW);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.message.subject).toContain('place');
  });

  /** The bug this guards: a demotion fell through the dispatch and ran a housekeeping sweep. */
  test('losing a place tells the one member it is about, and sweeps nothing', async () => {
    const ada = await member('ada');
    const night = await event(ada, 1);

    await store.jobs.schedule('rsvp.demoted', { eventId: night.id, memberId: ada.id }, NOW, NOW);
    await scheduler.tick(NOW);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.message.subject).toContain('has gone');

    /** A sweep would have queued the next one; nothing here should have. */
    const later = new Date(NOW.getTime() + Scheduler.SWEEP + 1000);
    expect(await store.jobs.claim(later)).toHaveLength(0);
  });

  test('being admitted is told to the member, whatever they switched off', async () => {
    const ken = await member('ken');
    await store.prefs.update(ken.id, { announcements: false, reminders: false });

    await store.jobs.schedule('member.admitted', { memberId: ken.id }, NOW, NOW);
    await scheduler.tick(NOW);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('ken@example.org');
  });

  test('a job about an event that has been deleted is finished rather than retried', async () => {
    const ada = await member('ada');
    const night = await event(ada);
    await store.jobs.schedule('event.announce', { eventId: night.id }, NOW, NOW);
    await store.events.remove(night.id);

    await scheduler.tick(NOW);
    expect(sent).toHaveLength(0);
    expect(await store.jobs.list({ state: 'failed' })).toHaveLength(0);
  });

  test('a sweep queues the next one, and only one', async () => {
    await store.jobs.schedule('sweep', {}, NOW, NOW);
    await scheduler.tick(NOW);

    const later = new Date(NOW.getTime() + Scheduler.SWEEP + 1000);
    const due = await store.jobs.claim(later);
    expect(due.map((job) => job.kind)).toEqual(['sweep']);
  });

  test('a tick with nothing due does nothing', async () => {
    expect(await scheduler.tick(NOW)).toBe(0);
  });
});
