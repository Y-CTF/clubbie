import { type EventId, Guest, type GuestId, Id, type MemberId } from '@clubbie/core';
import type { Kysely, Selectable } from 'kysely';
import { Row } from '../row.ts';
import type { GuestTable, Schema } from '../schema.ts';

export interface Draft {
  readonly name: string;
  readonly email?: string | null | undefined;
}

/** Guests: people at an event who have no account, and never will. */
export class Guests {
  constructor(private readonly db: Kysely<Schema>) {}

  static of(row: Selectable<GuestTable>): Guest {
    return new Guest({
      id: row.id,
      eventId: row.eventId,
      name: row.name,
      email: row.email,
      invitedBy: row.invitedBy,
      attendedAt: Row.atOrNull(row.attendedAt),
      createdAt: Row.at(row.createdAt),
    });
  }

  /**
   * One guest of one event.
   *
   * The event is part of the key rather than context the caller is trusted to have checked: a
   * guest id in another event's url used to be found, marked present and deleted, and the trail
   * then recorded the act against the event in the url rather than the one it happened to.
   */
  async byId(eventId: EventId, id: GuestId): Promise<Guest | null> {
    const row = await this.db
      .selectFrom('guest')
      .selectAll()
      .where('id', '=', id)
      .where('eventId', '=', eventId)
      .executeTakeFirst();
    return row ? Guests.of(row) : null;
  }

  async list(eventId: EventId): Promise<Guest[]> {
    const rows = await this.db
      .selectFrom('guest')
      .selectAll()
      .where('eventId', '=', eventId)
      .orderBy('name', 'asc')
      .execute();
    return rows.map(Guests.of);
  }

  async add(eventId: EventId, draft: Draft, invitedBy: MemberId, now: Date = new Date()): Promise<Guest> {
    const row = await this.db
      .insertInto('guest')
      .values({
        id: Id.create<'guest'>(),
        eventId,
        name: draft.name,
        email: draft.email ?? null,
        invitedBy,
        attendedAt: null,
        createdAt: Row.ms(now),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return Guests.of(row);
  }

  async attend(
    eventId: EventId,
    id: GuestId,
    attended: boolean,
    now: Date = new Date(),
  ): Promise<Guest | null> {
    const row = await this.db
      .updateTable('guest')
      .set({ attendedAt: attended ? Row.ms(now) : null })
      .where('id', '=', id)
      .where('eventId', '=', eventId)
      .returningAll()
      .executeTakeFirst();
    return row ? Guests.of(row) : null;
  }

  /** Reports whether there was one to remove, so a caller can answer "no such guest" honestly. */
  async remove(eventId: EventId, id: GuestId): Promise<boolean> {
    const result = await this.db
      .deleteFrom('guest')
      .where('id', '=', id)
      .where('eventId', '=', eventId)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }
}
