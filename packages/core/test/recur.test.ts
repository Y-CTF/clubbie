import { describe, expect, test } from 'bun:test';
import { type KindId, Recur, Schedule } from '../src/index.ts';

/** A Tuesday evening, which is what most of these rules are anchored to. */
const ANCHOR = new Date('2026-01-06T19:00:00');

function rule(fields: Partial<Recur> = {}): Recur {
  return new Recur({ freq: 'weekly', interval: 1, count: null, until: null, ...fields });
}

const days = (dates: readonly Date[]) => dates.map((at) => at.toDateString());

describe('Recur', () => {
  test('a weekly rule steps by seven days', () => {
    expect(days(rule().dates(ANCHOR, 3))).toEqual(['Tue Jan 06 2026', 'Tue Jan 13 2026', 'Tue Jan 20 2026']);
  });

  test('an interval of two is a fortnightly meeting', () => {
    expect(days(rule({ interval: 2 }).dates(ANCHOR, 3))).toEqual([
      'Tue Jan 06 2026',
      'Tue Jan 20 2026',
      'Tue Feb 03 2026',
    ]);
  });

  test('a monthly rule anchored on the 31st lands on the last day of a shorter month', () => {
    const monthly = rule({ freq: 'monthly' });
    expect(days(monthly.dates(new Date('2026-01-31T18:00:00'), 4))).toEqual([
      'Sat Jan 31 2026',
      'Sat Feb 28 2026',
      'Tue Mar 31 2026',
      'Thu Apr 30 2026',
    ]);
  });

  test('the wall clock survives a daylight saving change', () => {
    const spring = new Date('2026-03-24T19:00:00');
    const across = rule().dates(spring, 3);
    expect(across.map((at) => at.getHours())).toEqual([19, 19, 19]);
  });

  test('a count bounds the rule, however many are asked for', () => {
    expect(rule({ count: 3 }).dates(ANCHOR, 10)).toHaveLength(3);
  });

  test('an until date bounds the rule', () => {
    const bounded = rule({ until: new Date('2026-01-21T00:00:00') });
    expect(days(bounded.dates(ANCHOR, 10))).toEqual([
      'Tue Jan 06 2026',
      'Tue Jan 13 2026',
      'Tue Jan 20 2026',
    ]);
  });

  test('a rule with neither is endless, and says so', () => {
    expect(rule().endless).toBe(true);
    expect(rule({ count: 5 }).endless).toBe(false);
  });

  /** The bug this guards: enumerating from the anchor ran into `LIMIT` and reported no next date. */
  test('a weekly meeting still has a next date ten years in', () => {
    const far = new Date('2036-06-01T12:00:00');
    const next = rule().after(ANCHOR, far);
    expect(next).not.toBeNull();
    expect(next?.getTime()).toBeGreaterThan(far.getTime());
    expect(next?.getHours()).toBe(19);
  });

  test('after answers null once the rule has run out', () => {
    expect(rule({ count: 3 }).after(ANCHOR, new Date('2026-03-01T00:00:00'))).toBeNull();
  });

  test('after never returns the instant it was given', () => {
    const exact = rule().after(ANCHOR, ANCHOR);
    expect(exact?.toDateString()).toBe('Tue Jan 13 2026');
  });
});

function schedule(minutes: number | null): Schedule {
  return new Schedule({
    id: 'SCHEDULE' as Schedule['id'],
    title: 'Training night',
    description: null,
    kind: 'meeting' as KindId,
    location: null,
    capacity: null,
    seasonId: null,
    startsAt: ANCHOR,
    minutes,
    listed: false,
    recur: rule({ count: 2 }),
    createdBy: 'ORGANISER' as Schedule['createdBy'],
    createdAt: ANCHOR,
  });
}

describe('Schedule', () => {
  test('an occurrence ends after the minutes the schedule carries', () => {
    const nightly = schedule(90);
    expect(nightly.occurrences()).toHaveLength(2);
    expect(nightly.ends(ANCHOR)?.getTime()).toBe(ANCHOR.getTime() + 90 * Schedule.MINUTE);
  });

  test('a schedule with no duration stamps events with no end', () => {
    expect(schedule(null).ends(ANCHOR)).toBeNull();
  });
});
