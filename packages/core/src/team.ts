import type { Event, EventId } from './event.ts';
import type { Id } from './id.ts';
import type { MemberId } from './member.ts';

export type TeamId = Id<'team'>;

/**
 * Who may start a team on an event. `member` is a club that forms its own teams and `organiser` is
 * one where the committee draws them up, and both are real: a CTF night is the first and a
 * tournament with seeded groups is the second.
 */
export const MAKERS = ['member', 'organiser'] as const;
export type Maker = (typeof MAKERS)[number];

export interface TeamFields {
  readonly id: TeamId;
  readonly eventId: EventId;
  readonly name: string;
  /** Whoever started it. They may rename it and let people go; the organiser may do both anyway. */
  readonly captainId: MemberId;
  readonly createdAt: Date;
}

/** The fields are declared once, in `TeamFields`; the class carries them by declaration merging. */
export interface Team extends TeamFields {}

/**
 * A team on one event, and on no other.
 *
 * Deliberately not a club-level thing with a roster that persists. The same four people entering
 * four events are four teams here, which is the same call `Guest` makes and for the same reason: a
 * standing team is a second membership model, with its own joining, leaving and ownership, and
 * every question about it ("is this the same team as last term?") has to be answered by somebody.
 *
 * Teams follow the event's own clock. They may be formed and left while the event takes answers
 * and are fixed the moment it stops, because a team that changes after the deadline is a team the
 * organiser drew up a sheet for and no longer has.
 */
export class Team {
  static readonly MAKERS = MAKERS;
  /** A club that says nothing is one where members form their own teams. */
  static readonly MAKER: Maker = 'member';
  static readonly NAME = 60;
  /** How many teams one event may hold, so a listing is one query and one page. */
  static readonly LIMIT = 200;

  constructor(fields: TeamFields) {
    Object.assign(this, fields);
  }

  /** Whether the event still lets its teams change, which is exactly while it takes answers. */
  static settled(event: Event, now: Date = new Date()): boolean {
    return !event.open(now);
  }

  /**
   * Whether this caller may start a team. An organiser always may, whatever the event says, since
   * the setting is about the members rather than about the committee.
   */
  static creatable(maker: Maker, organiser: boolean): boolean {
    return organiser || maker === 'member';
  }

  /** Whether a team of `taken` has room for one more. Null is a team with no stated size. */
  static full(size: number | null, taken: number): boolean {
    return size !== null && taken >= size;
  }

  /** Whoever may rename it or put somebody out of it: the captain, or an organiser. */
  captained(memberId: MemberId, organiser: boolean): boolean {
    return organiser || this.captainId === memberId;
  }
}
