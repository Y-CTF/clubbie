import { describe, expect, test } from 'bun:test';
import { Recur, Zone } from '../src/index.ts';

const ZURICH = 'Europe/Zurich';
const AUCKLAND = 'Pacific/Auckland';
const HOUR = 60 * 60 * 1000;

/**
 * The zone arithmetic a repeating event stands on. Every case here is one a club has actually been
 * bitten by: the meeting that moved an hour in October, the monthly one that skipped February, and
 * the southern-hemisphere deployment where the clocks go the other way.
 */
describe('a named zone', () => {
  test('reads a clock rather than an offset', () => {
    /** 19:00 in Zurich in January is 18:00 UTC; in July it is 17:00 UTC. */
    expect(Zone.parts(new Date('2026-01-06T18:00:00Z'), ZURICH).hour).toBe(19);
    expect(Zone.parts(new Date('2026-07-07T17:00:00Z'), ZURICH).hour).toBe(19);
  });

  test('turns a clock back into an instant, on both sides of a change', () => {
    const winter = Zone.instant({ year: 2026, month: 1, day: 6, hour: 19, minute: 0, second: 0 }, ZURICH);
    const summer = Zone.instant({ year: 2026, month: 7, day: 7, hour: 19, minute: 0, second: 0 }, ZURICH);

    expect(winter.toISOString()).toBe('2026-01-06T18:00:00.000Z');
    expect(summer.toISOString()).toBe('2026-07-07T17:00:00.000Z');
  });

  test('normalises an out-of-range day, so calendar arithmetic is addition', () => {
    const at = Zone.instant({ year: 2026, month: 1, day: 33, hour: 12, minute: 0, second: 0 }, ZURICH);
    expect(Zone.parts(at, ZURICH)).toMatchObject({ year: 2026, month: 2, day: 2 });
  });

  test('answers an hour that never happened one gap later on the clock', () => {
    /** Switzerland goes forward at 02:00 on 29 March 2026, so 02:30 does not exist. */
    const at = Zone.instant({ year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 }, ZURICH);

    expect(at.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(Zone.parts(at, ZURICH)).toMatchObject({ hour: 3, minute: 30 });
  });

  test('answers an hour that happened twice with the second of the two', () => {
    /** Switzerland goes back at 03:00 on 25 October 2026, so 02:30 happens at 00:30Z and 01:30Z. */
    const at = Zone.instant({ year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 }, ZURICH);

    expect(at.toISOString()).toBe('2026-10-25T01:30:00.000Z');
    expect(Zone.parts(at, ZURICH)).toMatchObject({ hour: 2, minute: 30 });
  });

  test('knows the last day of a month, including a leap February', () => {
    expect(Zone.last(2026, 2)).toBe(28);
    expect(Zone.last(2028, 2)).toBe(29);
    expect(Zone.last(2026, 12)).toBe(31);
  });

  test('reports an offset, negative west of Greenwich', () => {
    expect(Zone.offset(new Date('2026-01-06T12:00:00Z'), ZURICH)).toBe(HOUR);
    expect(Zone.offset(new Date('2026-01-06T12:00:00Z'), 'America/New_York')).toBe(-5 * HOUR);
  });

  test('refuses to claim a zone it does not have', () => {
    expect(Zone.valid(ZURICH)).toBe(true);
    expect(Zone.valid('Middle/Earth')).toBe(false);
  });
});

describe('a rule stepping in a club zone', () => {
  /**
   * The bug this guards: a weekly meeting stepped in milliseconds drifts by an hour when the
   * clocks change, so a club that meets at 19:00 finds itself listed at 18:00 for half the year.
   */
  test('keeps its wall clock across a daylight saving change', () => {
    const weekly = new Recur({ freq: 'weekly', interval: 1, count: 10, until: null });
    /** A Monday in March, before Switzerland goes forward. */
    const anchor = new Date('2026-03-23T18:00:00Z');

    const dates = weekly.dates(anchor, 4, ZURICH);
    expect(dates.map((at) => Zone.parts(at, ZURICH).hour)).toEqual([19, 19, 19, 19]);
    /** And the instants really did move: the same clock is a different number of hours from UTC. */
    expect(dates[0]?.toISOString()).toBe('2026-03-23T18:00:00.000Z');
    expect(dates[1]?.toISOString()).toBe('2026-03-30T17:00:00.000Z');
  });

  test('keeps its wall clock where the clocks go the other way', () => {
    const weekly = new Recur({ freq: 'weekly', interval: 1, count: 4, until: null });
    const anchor = Zone.instant({ year: 2026, month: 9, day: 21, hour: 19, minute: 0, second: 0 }, AUCKLAND);

    const dates = weekly.dates(anchor, 4, AUCKLAND);
    expect(dates.map((at) => Zone.parts(at, AUCKLAND).hour)).toEqual([19, 19, 19, 19]);
  });

  test('clamps a monthly rule to the end of a shorter month, in the club zone', () => {
    const monthly = new Recur({ freq: 'monthly', interval: 1, count: 4, until: null });
    const anchor = Zone.instant({ year: 2026, month: 1, day: 31, hour: 19, minute: 0, second: 0 }, ZURICH);

    const days = monthly.dates(anchor, 4, ZURICH).map((at) => Zone.parts(at, ZURICH).day);
    expect(days).toEqual([31, 28, 31, 30]);
  });

  test('finds the next occurrence in a zone without walking the whole rule', () => {
    const weekly = new Recur({ freq: 'weekly', interval: 1, count: null, until: null });
    const anchor = new Date('2020-01-07T18:00:00Z');

    const next = weekly.after(anchor, new Date('2030-06-11T12:00:00Z'), ZURICH);
    expect(next).not.toBeNull();
    expect(Zone.parts(next as Date, ZURICH).hour).toBe(19);
    expect((next as Date).getTime()).toBeGreaterThan(new Date('2030-06-11T12:00:00Z').getTime());
  });
});

/**
 * The bug this guards: an occurrence that lost its milliseconds on the way through a zone would
 * be a different row under the unique index on `(scheduleId, startsAt)`, so a schedule stamped
 * before this and topped up after it would end up with two of every night.
 */
describe('a round trip', () => {
  test('gives back the instant it was given, to the millisecond', () => {
    for (const iso of ['2026-01-06T18:00:00.439Z', '2026-07-07T17:30:12.001Z']) {
      const at = new Date(iso);
      expect(Zone.instant(Zone.parts(at, ZURICH), ZURICH).toISOString()).toBe(iso);
      expect(Zone.instant(Zone.parts(at, null), null).getTime()).toBe(at.getTime());
    }
  });

  test('a rule keeps the milliseconds of its anchor', () => {
    const weekly = new Recur({ freq: 'weekly', interval: 1, count: 3, until: null });
    const anchor = new Date('2026-08-31T21:46:22.439Z');

    for (const at of weekly.dates(anchor, 3, ZURICH)) expect(at.getMilliseconds()).toBe(439);
  });
});
