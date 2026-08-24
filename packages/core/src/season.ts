import type { Id } from './id.ts';
import type { MemberId } from './member.ts';

export type SeasonId = Id<'season'>;

export interface SeasonFields {
  readonly id: SeasonId;
  readonly name: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The season new events and joins default into. At most one is current. */
  readonly current: boolean;
  readonly renewalAt: Date | null;
  readonly createdAt: Date;
}

/** The fields are declared once, in `SeasonFields`; the class carries them by declaration merging. */
export interface Season extends SeasonFields {}

export class Season {
  constructor(fields: SeasonFields) {
    Object.assign(this, fields);
  }

  covers(date: Date): boolean {
    return date >= this.startsAt && date <= this.endsAt;
  }

  /** Whether a lapsed member may still renew into this season without an organiser. */
  renewable(now: Date = new Date()): boolean {
    return this.renewalAt === null ? this.covers(now) : now <= this.renewalAt;
  }
}

export interface Membership {
  readonly memberId: MemberId;
  readonly seasonId: SeasonId;
  readonly joinedAt: Date;
}
