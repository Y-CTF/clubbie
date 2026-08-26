import { type EventId, Guest, type GuestId, Id, type MemberId } from '@clubbie/core';
import type { Kysely, Selectable } from 'kysely';
import { Lock } from '../lock.ts';
import { Row } from '../row.ts';
import type { GuestTable, Schema } from '../schema.ts';
import { Seats } from '../seats.ts';

export interface Draft {
  readonly name: string;
  readonly email?: string | null | undefined;
}

/** Guests: people at an event who have no account, and never will. */
export class Guests {
  constructor(
    private readonly db: Kysely<Schema>,
    private readonly lock: Lock = Lock.NONE,
  ) {}

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

  /**
   * Writes a guest onto the list, or reports that there was no place for one.
   *
   * A guest takes a place exactly as a member does, so the count and the write are one
   * transaction for the same reason `Rsvps.claim` is: two organisers adding the last guest would
   * otherwise both read the room as having room, and the event would sit permanently over
   * capacity, refusing every later answer as full.
   */
  async add(
    eventId: EventId,
    draft: Draft,
    invitedBy: MemberId,
    capacity: number | null,
    now: Date = new Date(),
  ): Promise<{ guest: Guest | null; taken: number }> {
    return this.db.transaction().execute(async (tx) => {
      await this.lock.event(tx, eventId);

      const taken = await Seats.taken(tx, eventId);
      if (capacity !== null && taken >= capacity) return { guest: null, taken };

      const row = await tx
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
      return { guest: Guests.of(row), taken };
    });
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
