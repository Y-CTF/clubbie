import type { Id } from './id.ts';
import type { KindId } from './kind.ts';
import type { MemberId } from './member.ts';
import type { ScheduleId } from './schedule.ts';
import type { SeasonId } from './season.ts';
import type { Maker } from './team.ts';

export type EventId = Id<'event'>;

/** `draft` is invisible to members, `cancelled` stays visible so nobody turns up. */
export const STATES = ['draft', 'published', 'cancelled'] as const;
export type State = (typeof STATES)[number];

export interface EventFields {
  readonly id: EventId;
  readonly title: string;
  readonly description: string | null;
  readonly kind: KindId;
  readonly state: State;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  /** Last moment an answer may change. Null means up to the start. */
  readonly closesAt: Date | null;
  readonly location: string | null;
  readonly capacity: number | null;
  readonly seasonId: SeasonId | null;
  /** The schedule that stamped this occurrence, or null for an event typed in on its own. */
  readonly scheduleId: ScheduleId | null;
  /** Whether a signed-out visitor may see it on the public page. Never true for a draft. */
  readonly listed: boolean;
  /** Whether this event is entered in teams at all. Off is the ordinary event. */
  readonly teams: boolean;
  /** How many members one team may hold here. Null is a team with no stated size. */
  readonly teamSize: number | null;
  /** Who may start one, when teams are on. */
  readonly teamsBy: Maker;
  readonly createdBy: MemberId;
  readonly createdAt: Date;
}

/** The fields are declared once, in `EventFields`; the class carries them by declaration merging. */
export interface Event extends EventFields {}

export class Event {
  static readonly STATES = STATES;
  /** An event is a draft until somebody publishes it, so a half-written one is never announced. */
  static readonly INITIAL: State = 'draft';
  /** The only state that takes answers, and the one a listing shows by default. */
  static readonly LIVE: State = 'published';
  /** Called off, and still on the calendar, because that is how somebody learns not to come. */
  static readonly CANCELLED: State = 'cancelled';
  /** How many events one page of a listing holds. A calendar asks by window instead. */
  static readonly PAGE = 50;

  constructor(fields: EventFields) {
    Object.assign(this, fields);
  }

  /** The instant answers stop being accepted, which is the deadline or the start. */
  get deadline(): Date {
    return this.closesAt ?? this.startsAt;
  }

  /** Whether an answer may still be given or changed. A cancelled event never takes one. */
  open(now: Date = new Date()): boolean {
    return this.state === Event.LIVE && now.getTime() <= this.deadline.getTime();
  }

  past(now: Date = new Date()): boolean {
    return (this.endsAt ?? this.startsAt).getTime() < now.getTime();
  }

  /** Draft events belong to their organisers until published. */
  visibleTo(memberId: MemberId, admin: boolean): boolean {
    return this.state !== Event.INITIAL || admin || this.createdBy === memberId;
  }

  /** What a signed-out visitor may see: published, marked listed, and still to come. */
  public(now: Date = new Date()): boolean {
    return this.listed && this.state === Event.LIVE && !this.past(now);
  }
}
