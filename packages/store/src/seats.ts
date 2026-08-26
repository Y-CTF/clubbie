import { type EventId, Rsvp } from '@clubbie/core';
import type { Kysely } from 'kysely';
import type { Schema } from './schema.ts';

/**
 * How many places an event has taken, guests included: a capacity is what fits through the door,
 * and somebody's friend occupies as much of it as a member does.
 *
 * It counts here rather than on either repository because two things take a place: a member
 * answering, and an organiser writing a guest onto the list. Two counts would drift, and whichever
 * undercounted would seat somebody the room does not fit.
 */
export namespace Seats {
  export async function taken(tx: Kysely<Schema>, eventId: EventId): Promise<number> {
    const answers = await tx
      .selectFrom('rsvp')
      .select(({ fn }) => fn.countAll<number>().as('total'))
      .where('eventId', '=', eventId)
      .where('answer', 'in', Rsvp.SEATED)
      .executeTakeFirstOrThrow();
    const guests = await tx
      .selectFrom('guest')
      .select(({ fn }) => fn.countAll<number>().as('total'))
      .where('eventId', '=', eventId)
      .executeTakeFirstOrThrow();
    return Number(answers.total) + Number(guests.total);
  }
}
