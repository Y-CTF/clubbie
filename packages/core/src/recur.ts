import { Millis } from './millis.ts';
import { Zone } from './zone.ts';

/**
 * How often something repeats. Deliberately smaller than an RFC 5545 rule: a club meets daily,
 * weekly, every other week or monthly, and every rule beyond that has been a way to get a wrong
 * date on a calendar.
 */
export const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface RecurFields {
  readonly freq: Frequency;
  /** Every nth period. Two with `weekly` is a fortnightly meeting. */
  readonly interval: number;
  /** How many occurrences in all, counting the first. Null with `until` set, or open-ended. */
  readonly count: number | null;
  /** The last instant an occurrence may fall on. Null when `count` bounds the rule instead. */
  readonly until: Date | null;
}

/** The fields are declared once, in `RecurFields`; the class carries them by declaration merging. */
export interface Recur extends RecurFields {}

/**
 * Steps in wall-clock terms rather than in milliseconds: a Tuesday meeting at 19:00 stays at 19:00
 * across a daylight saving change, which a fixed 604800000 would not.
 *
 * Which wall clock is a parameter rather than a property, because the zone belongs to the club and
 * the rule belongs to the schedule: storing it on the rule would be the same fact in every row,
 * and a club that moved cities would have to rewrite them all. Every method takes it last and
 * defaults to the runtime's own, which is what a caller with no club to ask gets.
 */
export class Recur {
  static readonly FREQUENCIES = FREQUENCIES;
  static readonly EVERY = 1;
  /** How many occurrences a caller materialises when it does not say. */
  static readonly AHEAD = 12;
  /** A hard stop, so an open-ended rule cannot be asked to enumerate forever. */
  static readonly LIMIT = 500;
  /** Days in a week and months in a year: named for what they count, not for what they add up to. */
  static readonly DAYS = 7;
  static readonly MONTHS = 12;
  /** Only ever used to estimate an index: real stepping is by wall clock, in `shift`. */
  static readonly DAY = Millis.DAY;

  constructor(fields: RecurFields) {
    Object.assign(this, fields);
  }

  get endless(): boolean {
    return this.count === null && this.until === null;
  }

  /**
   * The occurrences of a rule anchored at `anchor`, the anchor included, newest last. `wanted`
   * bounds an endless rule; `count` and `until` bound the rest.
   */
  dates(anchor: Date, wanted: number = Recur.AHEAD, zone: string | null = null): Date[] {
    const many = Math.min(wanted, this.count ?? Recur.LIMIT, Recur.LIMIT);
    const out: Date[] = [];

    for (let step = 0; out.length < many; step++) {
      const at = this.shift(anchor, step, zone);
      if (this.until && at.getTime() > this.until.getTime()) break;
      out.push(at);
    }
    return out;
  }

  /**
   * The first occurrence strictly after an instant, or null once the rule has run out.
   *
   * The index is estimated from the elapsed time and then corrected, rather than counted from the
   * anchor, so a weekly meeting still answers in its tenth year. Counting would hit `LIMIT` and
   * report that a club which meets every week has no next meeting.
   */
  after(anchor: Date, instant: Date, zone: string | null = null): Date | null {
    const last = this.count === null ? Number.POSITIVE_INFINITY : this.count - 1;
    let step = Math.max(0, this.estimate(anchor, instant, zone) - 1);

    for (let tries = 0; tries <= Recur.LIMIT; tries++, step++) {
      if (step > last) return null;

      const at = this.shift(anchor, step, zone);
      if (this.until && at.getTime() > this.until.getTime()) return null;
      if (at.getTime() > instant.getTime()) return at;
    }
    return null;
  }

  /**
   * Roughly how many periods separate two instants. It is allowed to be a period out either way:
   * `after` corrects from here, and the point of the estimate is only to skip the walk.
   */
  private estimate(anchor: Date, instant: Date, zone: string | null): number {
    const elapsed = instant.getTime() - anchor.getTime();
    if (elapsed <= 0) return 0;

    switch (this.freq) {
      case 'daily':
        return Math.floor(elapsed / Recur.DAY / this.interval);
      case 'weekly':
        return Math.floor(elapsed / (Recur.DAY * Recur.DAYS) / this.interval);
      case 'monthly': {
        const from = Zone.parts(anchor, zone);
        const to = Zone.parts(instant, zone);
        const months = (to.year - from.year) * Recur.MONTHS + (to.month - from.month);
        return Math.floor(months / this.interval);
      }
    }
  }

  /**
   * The anchor moved on by `step` periods, read and written as a clock in `zone`. A monthly rule
   * anchored on the 31st lands on the last day of a shorter month rather than spilling into the
   * next one, which plain month addition does.
   */
  private shift(anchor: Date, step: number, zone: string | null): Date {
    const at = Zone.parts(anchor, zone);
    const moved = step * this.interval;

    switch (this.freq) {
      /** `Zone.instant` normalises an out-of-range day, so addition is the whole of the step. */
      case 'daily':
        return Zone.instant({ ...at, day: at.day + moved }, zone);
      case 'weekly':
        return Zone.instant({ ...at, day: at.day + moved * Recur.DAYS }, zone);
      case 'monthly': {
        const index = at.month - 1 + moved;
        const year = at.year + Math.floor(index / Recur.MONTHS);
        const month = (((index % Recur.MONTHS) + Recur.MONTHS) % Recur.MONTHS) + 1;
        return Zone.instant({ ...at, year, month, day: Math.min(at.day, Zone.last(year, month)) }, zone);
      }
    }
  }
}
