import type { EventId } from './event.ts';
import type { MemberId } from './member.ts';

/**
 * What a member said they would do. Attendance is what they did, and is recorded separately.
 *
 * `waitlist` is an answer rather than a second table: a member who wants a full event is in the
 * same row they would be in anyway, so promoting them is an update and nothing has to be moved.
 */
export const ANSWERS = ['going', 'waitlist', 'maybe', 'declined'] as const;
export type Answer = (typeof ANSWERS)[number];

export interface RsvpFields {
  readonly eventId: EventId;
  readonly memberId: MemberId;
  readonly answer: Answer;
  /** Set when an organiser marked the member present. Null while the event has not been checked. */
  readonly attendedAt: Date | null;
  readonly answeredAt: Date;
}

/** The fields are declared once, in `RsvpFields`; the class carries them by declaration merging. */
export interface Rsvp extends RsvpFields {}

export class Rsvp {
  static readonly ANSWERS = ANSWERS;
  /** Answers that take a seat when an event has a capacity. */
  static readonly SEATED: readonly Answer[] = ['going'];
  /** The answer of somebody waiting for a seat, which is what a withdrawal promotes. */
  static readonly QUEUED: Answer = 'waitlist';
  /** What a promotion turns a queued answer into, and what marking a walk-in present implies. */
  static readonly IMPLIED: Answer = 'going';
  /** Counted, but seated by nothing: a maybe is interest rather than a place. */
  static readonly MAYBE: Answer = 'maybe';

  constructor(fields: RsvpFields) {
    Object.assign(this, fields);
  }

  get seated(): boolean {
    return Rsvp.SEATED.includes(this.answer);
  }

  get maybe(): boolean {
    return this.answer === Rsvp.MAYBE;
  }

  get queued(): boolean {
    return this.answer === Rsvp.QUEUED;
  }

  get attended(): boolean {
    return this.attendedAt !== null;
  }

  /** Said one thing, did another. What an organiser actually wants a listing to surface. */
  get noShow(): boolean {
    return this.seated && !this.attended;
  }
}
