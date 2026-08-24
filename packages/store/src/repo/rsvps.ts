import {
  type Answer,
  type Event,
  type EventId,
  type Guest,
  type Member,
  type MemberId,
  Rsvp,
} from '@clubbie/core';
import type { Kysely, Selectable } from 'kysely';
import { Lock } from '../lock.ts';
import { Row } from '../row.ts';
import type { RsvpTable, Schema } from '../schema.ts';
import { Events, type Tally } from './events.ts';
import { Members } from './members.ts';

/** An answer with the person attached, which is what an attendance sheet is. */
export interface Entry {
  readonly rsvp: Rsvp;
  readonly member: Member;
}

export class Rsvps {
  /** How many answers a member's own history goes back. */
  static readonly PAGE = 100;

  constructor(
    private readonly db: Kysely<Schema>,
    private readonly lock: Lock = Lock.NONE,
  ) {}

  /**
   * Counts a sheet into the same shape a listing produces, so an event page and an event list
   * report identical numbers and neither counts answers by hand.
   */
  static tally(event: Event, sheet: readonly Entry[], guests: readonly Guest[] = []): Tally {
    const going = sheet.filter((entry) => entry.rsvp.seated).length;
    return {
      event,
      going,
      taken: going + guests.length,
      maybe: sheet.filter((entry) => entry.rsvp.maybe).length,
      waiting: sheet.filter((entry) => entry.rsvp.queued).length,
      guests: guests.length,
      attended: sheet.filter((entry) => entry.rsvp.attended).length + guests.filter((g) => g.attended).length,
    };
  }

  static of(row: Selectable<RsvpTable>): Rsvp {
    return new Rsvp({
      eventId: row.eventId,
      memberId: row.memberId,
      answer: row.answer,
      attendedAt: Row.atOrNull(row.attendedAt),
      answeredAt: Row.at(row.answeredAt),
    });
  }

  async byMember(eventId: EventId, memberId: MemberId): Promise<Rsvp | null> {
    const row = await this.db
      .selectFrom('rsvp')
      .selectAll()
      .where('eventId', '=', eventId)
      .where('memberId', '=', memberId)
      .executeTakeFirst();
    return row ? Rsvps.of(row) : null;
  }

  /**
   * What one member answered to each of a list of events, as a map.
   *
   * It is one query rather than one per event because it exists for the calendar: a month of a
   * busy club is a hundred nights, and asking the database a hundred times so a grid can tick the
   * ones a member is going to is a hundred round trips for one column of the answer.
   */
  async mine(memberId: MemberId, events: readonly EventId[]): Promise<Map<EventId, Answer>> {
    if (events.length === 0) return new Map();

    const rows = await this.db
      .selectFrom('rsvp')
      .select(['eventId', 'answer'])
      .where('memberId', '=', memberId)
      .where('eventId', 'in', events)
      .execute();
    return new Map(rows.map((row) => [row.eventId, row.answer]));
  }

  /**
   * Records an answer, replacing whatever the member said before. Attendance is deliberately left
   * alone: someone who turned up and later edits their answer did still turn up.
   *
   * `answeredAt` only moves when the answer itself changed, because it is what orders the
   * waitlist: a member who reloads the page, or taps twice, must not go to the back of a queue
   * they were already in.
   */
  async answer(eventId: EventId, memberId: MemberId, answer: Answer, now: Date = new Date()): Promise<Rsvp> {
    const row = await this.db
      .insertInto('rsvp')
      .values({ eventId, memberId, answer, attendedAt: null, answeredAt: Row.ms(now) })
      .onConflict((c) =>
        c
          .columns(['eventId', 'memberId'])
          .doUpdateSet({ answer, answeredAt: Row.ms(now) })
          .whereRef('rsvp.answer', '!=', 'excluded.answer'),
      )
      .returningAll()
      .executeTakeFirst();
    /** The update was skipped because nothing changed, so the row as it stands is the answer. */
    return row ? Rsvps.of(row) : ((await this.byMember(eventId, memberId)) as Rsvp);
  }

  /**
   * Takes a seat, or reports that there was none.
   *
   * The count and the write are one transaction, which is the whole point: two members answering
   * `going` at once would otherwise both read nine of ten seats taken and both take the tenth.
   * A `capacity` of null is an event with no door to fit through, so nothing is counted.
   */
  async claim(
    eventId: EventId,
    memberId: MemberId,
    answer: Answer,
    capacity: number | null,
    now: Date = new Date(),
  ): Promise<{ rsvp: Rsvp | null; taken: number }> {
    return this.db.transaction().execute(async (tx) => {
      /** Counting the seats and taking one are only one decision if nobody else may count now. */
      await this.lock.event(tx, eventId);

      const taken = await Rsvps.taken(tx, eventId);
      if (capacity !== null && Rsvp.SEATED.includes(answer)) {
        const held = await tx
          .selectFrom('rsvp')
          .select('answer')
          .where('eventId', '=', eventId)
          .where('memberId', '=', memberId)
          .executeTakeFirst();

        /** A member who already holds a seat is not taking another one by saying so again. */
        const holds = held ? Rsvp.SEATED.includes(held.answer) : false;
        if (!holds && taken >= capacity) return { rsvp: null, taken };
      }

      const row = await tx
        .insertInto('rsvp')
        .values({ eventId, memberId, answer, attendedAt: null, answeredAt: Row.ms(now) })
        .onConflict((c) =>
          c
            .columns(['eventId', 'memberId'])
            .doUpdateSet({ answer, answeredAt: Row.ms(now) })
            .whereRef('rsvp.answer', '!=', 'excluded.answer'),
        )
        .returningAll()
        .executeTakeFirst();

      const rsvp = row
        ? Rsvps.of(row)
        : Rsvps.of(
            await tx
              .selectFrom('rsvp')
              .selectAll()
              .where('eventId', '=', eventId)
              .where('memberId', '=', memberId)
              .executeTakeFirstOrThrow(),
          );
      return { rsvp, taken };
    });
  }

  /**
   * Puts the newest seated answers back on the waitlist until the event fits its capacity again,
   * and reports who moved. What shrinking a room means: somebody has to lose a place, and the
   * fairest somebody is whoever took theirs last.
   */
  async trim(eventId: EventId, capacity: number, now: Date = new Date()): Promise<MemberId[]> {
    return this.db.transaction().execute(async (tx) => {
      await this.lock.event(tx, eventId);

      const over = (await Rsvps.taken(tx, eventId)) - capacity;
      if (over <= 0) return [];

      const seated = await tx
        .selectFrom('rsvp')
        .select('memberId')
        .where('eventId', '=', eventId)
        .where('answer', 'in', Rsvp.SEATED)
        .orderBy('answeredAt', 'desc')
        /**
         * A total order, so two answers written in the same millisecond do not leave the database
         * to pick. Without it, whose seat is taken back depends on which row the engine happened
         * to reach first, and the two dialects happen to disagree.
         */
        .orderBy('memberId', 'desc')
        .limit(over)
        .execute();
      if (seated.length === 0) return [];

      const moving = seated.map((row) => row.memberId);
      const moved = await tx
        .updateTable('rsvp')
        .set({ answer: Rsvp.QUEUED, answeredAt: Row.ms(now) })
        .where('eventId', '=', eventId)
        .where('memberId', 'in', moving)
        .where('answer', 'in', Rsvp.SEATED)
        .returning('memberId')
        .execute();
      return moved.map((row) => row.memberId);
    });
  }

  /**
   * Withdraws an answer and hands the seat to whoever has waited longest, in one transaction.
   * Two statements would let a second withdrawal, or a fresh answer, take the same seat between
   * them, and two members told they have a place at a full event is the failure that matters.
   */
  async withdraw(
    eventId: EventId,
    memberId: MemberId,
    capacity: number | null = null,
    now: Date = new Date(),
  ): Promise<MemberId[]> {
    return this.db.transaction().execute(async (tx) => {
      await this.lock.event(tx, eventId);

      await tx.deleteFrom('rsvp').where('eventId', '=', eventId).where('memberId', '=', memberId).execute();
      return Rsvps.fill(tx, eventId, capacity, now);
    });
  }

  /**
   * How many seats an event has taken, guests included: a capacity is what fits through the door,
   * and somebody's friend occupies as much of it as a member does.
   */
  async seated(eventId: EventId): Promise<number> {
    return Rsvps.taken(this.db, eventId);
  }

  /** Everyone waiting for a seat, in the order they asked, which is the order they are promoted. */
  async queue(eventId: EventId): Promise<Rsvp[]> {
    const rows = await this.db
      .selectFrom('rsvp')
      .selectAll()
      .where('eventId', '=', eventId)
      .where('answer', '=', Rsvp.QUEUED)
      .orderBy('answeredAt', 'asc')
      .orderBy('memberId', 'asc')
      .execute();
    return rows.map(Rsvps.of);
  }

  /**
   * Promotes as many waiting members as there is room for, and reports who moved so the caller
   * can tell them. Called with a null capacity it promotes everybody, which is what removing a
   * capacity from an event means.
   */
  async promote(eventId: EventId, capacity: number | null, now: Date = new Date()): Promise<MemberId[]> {
    return this.db.transaction().execute(async (tx) => {
      await this.lock.event(tx, eventId);
      return Rsvps.fill(tx, eventId, capacity, now);
    });
  }

  private static async fill(
    tx: Kysely<Schema>,
    eventId: EventId,
    capacity: number | null,
    now: Date,
  ): Promise<MemberId[]> {
    const waiting = await tx
      .selectFrom('rsvp')
      .select('memberId')
      .where('eventId', '=', eventId)
      .where('answer', '=', Rsvp.QUEUED)
      .orderBy('answeredAt', 'asc')
      /** The same total order `queue` is read in, so what is shown is what is promoted. */
      .orderBy('memberId', 'asc')
      .execute();
    if (waiting.length === 0) return [];

    const free = capacity === null ? waiting.length : capacity - (await Rsvps.taken(tx, eventId));
    const moving = waiting.slice(0, Math.max(0, free)).map((row) => row.memberId);
    if (moving.length === 0) return [];

    /**
     * The answer is re-asserted in the update and the promoted members are read back from it,
     * rather than trusted from the select above. Two drainers that read the same queue would
     * otherwise both report the same promotions and tell those members twice.
     */
    const moved = await tx
      .updateTable('rsvp')
      .set({ answer: Rsvp.IMPLIED, answeredAt: Row.ms(now) })
      .where('eventId', '=', eventId)
      .where('memberId', 'in', moving)
      .where('answer', '=', Rsvp.QUEUED)
      .returning('memberId')
      .execute();
    return moved.map((row) => row.memberId);
  }

  private static async taken(tx: Kysely<Schema>, eventId: EventId): Promise<number> {
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

  /** Hidden members are still on an organiser's sheet; the filter belongs to the view, not here. */
  async sheet(eventId: EventId): Promise<Entry[]> {
    const rows = await this.db
      .selectFrom('rsvp')
      .innerJoin('member', 'member.id', 'rsvp.memberId')
      .select([
        'rsvp.eventId as eventId',
        'rsvp.memberId as rsvpMemberId',
        'rsvp.answer as answer',
        'rsvp.attendedAt as attendedAt',
        'rsvp.answeredAt as answeredAt',
      ])
      .selectAll('member')
      .where('rsvp.eventId', '=', eventId)
      .orderBy('member.name', 'asc')
      .execute();

    return rows.map((row) => ({
      rsvp: Rsvps.of({ ...row, memberId: row.rsvpMemberId }),
      member: Members.of(row),
    }));
  }

  /** Marking attendance implies an answer, so a walk-in is recorded rather than refused. */
  async attend(
    eventId: EventId,
    memberId: MemberId,
    attended: boolean,
    now: Date = new Date(),
  ): Promise<Rsvp> {
    const at = attended ? Row.ms(now) : null;
    const row = await this.db
      .insertInto('rsvp')
      .values({ eventId, memberId, answer: Rsvp.IMPLIED, attendedAt: at, answeredAt: Row.ms(now) })
      .onConflict((c) => c.columns(['eventId', 'memberId']).doUpdateSet({ attendedAt: at }))
      .returningAll()
      .executeTakeFirstOrThrow();
    return Rsvps.of(row);
  }

  /**
   * A member's answers with the events they belong to, newest first. What a history page reads,
   * and the reason it is one query: the alternative is a page fetching an event per row.
   */
  async timeline(memberId: MemberId, limit = Rsvps.PAGE): Promise<{ rsvp: Rsvp; event: Event }[]> {
    const rows = await this.db
      .selectFrom('rsvp')
      .innerJoin('event', 'event.id', 'rsvp.eventId')
      .select([
        'rsvp.answer as answer',
        'rsvp.attendedAt as attendedAt',
        'rsvp.answeredAt as answeredAt',
        'rsvp.memberId as memberId',
      ])
      .selectAll('event')
      .where('rsvp.memberId', '=', memberId)
      .orderBy('event.startsAt', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      rsvp: Rsvps.of({ ...row, eventId: row.id }),
      event: Events.of(row),
    }));
  }
}
