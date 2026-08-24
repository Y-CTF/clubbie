import { describe, expect, test } from 'bun:test';
import { Event, type EventFields, type EventId, Id, type KindId, type MemberId, Rsvp } from '../src/index.ts';

const NOW = new Date('2026-03-01T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function event(fields: Partial<EventFields> = {}): Event {
  return new Event({
    id: Id.create<'event'>(),
    title: 'Weekly meeting',
    description: null,
    kind: 'meeting' as KindId,
    state: 'published',
    startsAt: new Date(NOW.getTime() + HOUR),
    endsAt: null,
    closesAt: null,
    location: null,
    capacity: null,
    seasonId: null,
    scheduleId: null,
    listed: false,
    createdBy: 'someone' as MemberId,
    createdAt: NOW,
    ...fields,
  });
}

describe('Event', () => {
  test('answers close at the start when no deadline is set', () => {
    const one = event();
    expect(one.deadline).toEqual(one.startsAt);
    expect(one.open(NOW)).toBe(true);
    expect(one.open(new Date(NOW.getTime() + 2 * HOUR))).toBe(false);
  });

  test('a deadline closes answers before the start', () => {
    const one = event({ closesAt: new Date(NOW.getTime() - HOUR) });
    expect(one.open(NOW)).toBe(false);
  });

  test('a draft or cancelled event never takes an answer', () => {
    expect(event({ state: 'draft' }).open(NOW)).toBe(false);
    expect(event({ state: 'cancelled' }).open(NOW)).toBe(false);
  });

  test('a draft is visible to its organiser and to admins only', () => {
    const mine = 'mine' as MemberId;
    const draft = event({ state: 'draft', createdBy: mine });
    expect(draft.visibleTo(mine, false)).toBe(true);
    expect(draft.visibleTo('other' as MemberId, false)).toBe(false);
    expect(draft.visibleTo('other' as MemberId, true)).toBe(true);
  });

  test('past is measured from the end when there is one', () => {
    const one = event({
      startsAt: new Date(NOW.getTime() - 2 * HOUR),
      endsAt: new Date(NOW.getTime() + HOUR),
    });
    expect(one.past(NOW)).toBe(false);
  });
});

describe('Rsvp', () => {
  test('a seated answer that was never marked present is a no-show', () => {
    const rsvp = new Rsvp({
      eventId: 'e' as EventId,
      memberId: 'm' as MemberId,
      answer: 'going',
      attendedAt: null,
      answeredAt: NOW,
    });
    expect(rsvp.seated).toBe(true);
    expect(rsvp.noShow).toBe(true);
  });

  test('a maybe takes no seat', () => {
    const rsvp = new Rsvp({
      eventId: 'e' as EventId,
      memberId: 'm' as MemberId,
      answer: 'maybe',
      attendedAt: null,
      answeredAt: NOW,
    });
    expect(rsvp.seated).toBe(false);
    expect(rsvp.noShow).toBe(false);
  });
});
