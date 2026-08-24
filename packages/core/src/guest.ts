import type { EventId } from './event.ts';
import type { Id } from './id.ts';
import type { MemberId } from './member.ts';

export type GuestId = Id<'guest'>;

export interface GuestFields {
  readonly id: GuestId;
  readonly eventId: EventId;
  readonly name: string;
  readonly email: string | null;
  /** The member who put them on the list, which is who to ask about them. */
  readonly invitedBy: MemberId;
  readonly attendedAt: Date | null;
  readonly createdAt: Date;
}

/** The fields are declared once, in `GuestFields`; the class carries them by declaration merging. */
export interface Guest extends GuestFields {}

/**
 * Somebody at an event who is not a member: a friend brought along, a speaker, a visitor from
 * another club. They are a row on one event and never an account, because an account they would
 * have to sign into is exactly what they do not want.
 *
 * A guest takes a seat like anybody else, so a capacity means what it says on the door.
 */
export class Guest {
  static readonly NAME = 100;

  constructor(fields: GuestFields) {
    Object.assign(this, fields);
  }

  get attended(): boolean {
    return this.attendedAt !== null;
  }
}
