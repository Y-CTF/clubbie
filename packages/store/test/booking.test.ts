import { beforeEach, describe, expect, test } from 'bun:test';
import { type Event, type KindId, type Member, Rsvp } from '@clubbie/core';
import { Rsvps, type Store } from '../src/index.ts';
import { Fixture } from './harness.ts';

const NOW = new Date('2026-03-01T12:00:00Z');
const HOUR = 60 * 60 * 1000;

let store: Store;

/** One member, enrolled the way signing in enrols one. */
async function member(name: string): Promise<Member> {
  return store.members.enroll(
    { provider: 'test', subject: name, email: `${name}@example.org`, name, avatar: null },
    NOW,
  );
}

async function event(capacity: number | null, organiser: Member): Promise<Event> {
  return store.events.create(
    {
      title: 'Workshop',
      kind: 'workshop' as KindId,
      state: 'published',
      startsAt: new Date(NOW.getTime() + HOUR),
      capacity,
    },
    organiser.id,
    NOW,
  );
}

beforeEach(async () => {
  store = await Fixture.open();
});

describe('seats', () => {
  /**
   * The invariant, under the condition that breaks it.
   *
   * Counting the seats and taking one are two statements, so on Postgres, where transactions
   * interleave under `READ COMMITTED`, ten members answering at once each counted an empty event
   * and each took the one place. `Lock` is what makes them queue; on SQLite the driver already
   * did. The test is written against both because the answer must not depend on the dialect.
   */
  test('ten members answering at once still fill one seat', async () => {
    const organiser = await member('ada');
    const night = await event(1, organiser);
    const racing = await Promise.all(Array.from({ length: 10 }, (_, index) => member(`racer${index}`)));

    const claims = await Promise.all(
      racing.map((one) => store.rsvps.claim(night.id, one.id, Rsvp.IMPLIED, 1, NOW)),
    );

    expect(claims.filter((claim) => claim.rsvp !== null)).toHaveLength(1);
    expect(await store.rsvps.seated(night.id)).toBe(1);
  });

  test('the last place goes to one member, and the next is refused', async () => {
    const ada = await member('ada');
    const alan = await member('alan');
    const grace = await member('grace');
    const workshop = await event(2, ada);

    const first = await store.rsvps.claim(workshop.id, ada.id, 'going', workshop.capacity, NOW);
    const second = await store.rsvps.claim(workshop.id, alan.id, 'going', workshop.capacity, NOW);
    const third = await store.rsvps.claim(workshop.id, grace.id, 'going', workshop.capacity, NOW);

    expect(first.rsvp?.seated).toBe(true);
    expect(second.rsvp?.seated).toBe(true);
    expect(third.rsvp).toBeNull();
    expect(third.taken).toBe(2);
  });

  test('a member who already holds a seat may say so again', async () => {
    const ada = await member('ada');
    const workshop = await event(1, ada);

    await store.rsvps.claim(workshop.id, ada.id, 'going', workshop.capacity, NOW);
    const again = await store.rsvps.claim(workshop.id, ada.id, 'going', workshop.capacity, NOW);
    expect(again.rsvp?.seated).toBe(true);
  });

  test('a guest occupies a place, so a member is refused the last one', async () => {
    const ada = await member('ada');
    const alan = await member('alan');
    const workshop = await event(1, ada);

    await store.guests.add(workshop.id, { name: 'a friend' }, ada.id, workshop.capacity, NOW);
    const refused = await store.rsvps.claim(workshop.id, alan.id, 'going', workshop.capacity, NOW);

    expect(refused.rsvp).toBeNull();
    expect(await store.rsvps.seated(workshop.id)).toBe(1);
  });

  test('answering the same thing twice keeps a member their place in the queue', async () => {
    const ada = await member('ada');
    const alan = await member('alan');
    const workshop = await event(1, ada);

    await store.rsvps.answer(workshop.id, ada.id, Rsvp.QUEUED, NOW);
    await store.rsvps.answer(workshop.id, alan.id, Rsvp.QUEUED, new Date(NOW.getTime() + 1000));
    /** Ada says the same thing again later, which must not move her behind Alan. */
    await store.rsvps.answer(workshop.id, ada.id, Rsvp.QUEUED, new Date(NOW.getTime() + 2000));

    const queue = await store.rsvps.queue(workshop.id);
    expect(queue.map((rsvp) => rsvp.memberId)).toEqual([ada.id, alan.id]);
  });
});

describe('the waitlist', () => {
  test('a withdrawal promotes whoever waited longest, once', async () => {
    const ada = await member('ada');
    const alan = await member('alan');
    const grace = await member('grace');
    const workshop = await event(1, ada);

    await store.rsvps.claim(workshop.id, ada.id, 'going', workshop.capacity, NOW);
    await store.rsvps.answer(workshop.id, alan.id, Rsvp.QUEUED, NOW);
    await store.rsvps.answer(workshop.id, grace.id, Rsvp.QUEUED, new Date(NOW.getTime() + 1000));

    const promoted = await store.rsvps.withdraw(workshop.id, ada.id, workshop.capacity, NOW);
    expect(promoted).toEqual([alan.id]);

    /** Nothing more to give: a second pass promotes nobody rather than over-filling the room. */
    expect(await store.rsvps.promote(workshop.id, workshop.capacity, NOW)).toEqual([]);
    expect((await store.rsvps.byMember(workshop.id, grace.id))?.queued).toBe(true);
  });

  test('raising a capacity hands the new places out', async () => {
    const ada = await member('ada');
    const alan = await member('alan');
    const workshop = await event(1, ada);

    await store.rsvps.claim(workshop.id, ada.id, 'going', workshop.capacity, NOW);
    await store.rsvps.answer(workshop.id, alan.id, Rsvp.QUEUED, NOW);

    expect(await store.rsvps.promote(workshop.id, 2, NOW)).toEqual([alan.id]);
  });

  test('shrinking a capacity takes the newest places back', async () => {
    const ada = await member('ada');
    const alan = await member('alan');
    const workshop = await event(2, ada);

    await store.rsvps.claim(workshop.id, ada.id, 'going', workshop.capacity, NOW);
    await store.rsvps.claim(workshop.id, alan.id, 'going', workshop.capacity, new Date(NOW.getTime() + 1000));

    const demoted = await store.rsvps.trim(workshop.id, 1, NOW);
    expect(demoted).toEqual([alan.id]);
    expect((await store.rsvps.byMember(workshop.id, ada.id))?.seated).toBe(true);
  });

  test('a tally counts places, waiting members and guests the same way the listing does', async () => {
    const ada = await member('ada');
    const alan = await member('alan');
    const workshop = await event(2, ada);

    await store.rsvps.claim(workshop.id, ada.id, 'going', workshop.capacity, NOW);
    await store.rsvps.answer(workshop.id, alan.id, Rsvp.QUEUED, NOW);
    await store.guests.add(workshop.id, { name: 'a friend' }, ada.id, workshop.capacity, NOW);
    await store.rsvps.attend(workshop.id, ada.id, true, NOW);

    const [listed] = await store.events.list({ state: 'published' });
    const counted = Rsvps.tally(
      workshop,
      await store.rsvps.sheet(workshop.id),
      await store.guests.list(workshop.id),
    );

    expect(listed?.taken).toBe(counted.taken);
    expect(listed?.waiting).toBe(counted.waiting);
    expect(listed?.attended).toBe(counted.attended);
    expect(counted.taken).toBe(2);
  });

  test('a guest is refused the place a member already took, in the same transaction a member is', async () => {
    const ada = await member('ada');
    const workshop = await event(1, ada);

    await store.rsvps.claim(workshop.id, ada.id, 'going', workshop.capacity, NOW);
    const refused = await store.guests.add(workshop.id, { name: 'a friend' }, ada.id, workshop.capacity, NOW);

    expect(refused.guest).toBeNull();
    expect(refused.taken).toBe(1);
    expect(await store.guests.list(workshop.id)).toHaveLength(0);
  });
});
