import type { Id } from './id.ts';
import type { KindId } from './kind.ts';
import type { MemberId } from './member.ts';
import { Recur } from './recur.ts';
import type { SeasonId } from './season.ts';

export type ScheduleId = Id<'schedule'>;

/**
 * The template a repeating event is stamped from, and the rule that says when.
 *
 * A schedule generates rows rather than being one: every occurrence is an ordinary event with its
 * own answers, and cancelling next Tuesday is a state change on that event alone. The alternative,
 * computing occurrences on the fly, cannot hold an answer for one of them.
 */
export interface ScheduleFields {
  readonly id: ScheduleId;
  readonly title: string;
  readonly description: string | null;
  readonly kind: KindId;
  readonly location: string | null;
  readonly capacity: number | null;
  readonly seasonId: SeasonId | null;
  /** The first occurrence, and the wall clock every later one keeps. */
  readonly startsAt: Date;
  /** How long an occurrence lasts, carried forward rather than stored per event. */
  readonly minutes: number | null;
  readonly recur: Recur;
  /** Whether the occurrences it stamps are shown on the public page. */
  readonly listed: boolean;
  readonly createdBy: MemberId;
  readonly createdAt: Date;
}

/** The fields are declared once, in `ScheduleFields`; the class carries them by declaration merging. */
export interface Schedule extends ScheduleFields {}

export class Schedule {
  /** How far ahead occurrences are materialised, so a listing is never empty and never endless. */
  static readonly AHEAD = Recur.AHEAD;
  static readonly MINUTE = 60_000;

  constructor(fields: ScheduleFields) {
    Object.assign(this, fields);
  }

  /**
   * Every occurrence this schedule should have, the first included, bounded by its own rule. The
   * zone is the club's, and the wall clock is kept in it: see `Recur`.
   */
  occurrences(wanted: number = Schedule.AHEAD, zone: string | null = null): Date[] {
    return this.recur.dates(this.startsAt, wanted, zone);
  }

  /** When an occurrence starting at `startsAt` ends, or null for a schedule with no duration. */
  ends(startsAt: Date): Date | null {
    return this.minutes === null ? null : new Date(startsAt.getTime() + this.minutes * Schedule.MINUTE);
  }
}
