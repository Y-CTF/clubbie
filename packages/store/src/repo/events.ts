import {
  Event,
  type EventId,
  Id,
  type KindId,
  type MemberId,
  Rsvp,
  Schedule,
  type ScheduleId,
  type SeasonId,
  type State,
} from '@clubbie/core';
import type { Expression, ExpressionBuilder, Kysely, Selectable, SqlBool } from 'kysely';
import { sql } from 'kysely';
import { Row } from '../row.ts';
import type { EventTable, Schema } from '../schema.ts';
import { Search } from '../search.ts';

export interface Draft {
  readonly title: string;
  readonly description?: string | null | undefined;
  readonly kind: KindId;
  readonly state?: State | undefined;
  readonly startsAt: Date;
  readonly endsAt?: Date | null | undefined;
  readonly closesAt?: Date | null | undefined;
  readonly location?: string | null | undefined;
  readonly capacity?: number | null | undefined;
  readonly seasonId?: SeasonId | null | undefined;
  readonly scheduleId?: ScheduleId | null | undefined;
  readonly listed?: boolean | undefined;
}

export type Patch = { readonly [K in keyof Draft]?: Draft[K] | undefined };

export interface Filter {
  readonly state?: State | undefined;
  readonly kind?: KindId | undefined;
  readonly seasonId?: SeasonId | undefined;
  readonly scheduleId?: ScheduleId | undefined;
  /** Only events a signed-out visitor may see, which is what the public page asks for. */
  readonly listed?: boolean | undefined;
  /** Only events that have not finished yet. What the default listing shows. */
  readonly upcoming?: Date | undefined;
  /**
   * Everything that touches a stretch of the clock, which is what a calendar asks for. It is one
   * field rather than two loose ends because half a window is not a question anybody has: a page
   * showing March asks for March, and `from` alone is what `upcoming` already answers.
   */
  readonly window?: Window | undefined;
  /** A typed word, matched against a title, a room or a description. */
  readonly query?: string | undefined;
  /**
   * Who is asking. A draft belongs to whoever wrote it, and this is what keeps everybody else's
   * out of the page *before* the limit is applied: filtering them out afterwards means fifty of
   * somebody else's drafts can push a member's own off the end of their own search. It mirrors
   * `Event.visibleTo`, which is the definition, and `api/test/surface.test.ts` proves they agree.
   */
  readonly viewer?: MemberId | undefined;
  /** True when the caller may read every draft, which is what `event:manage` grants. */
  readonly drafts?: boolean | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

/** A stretch of the clock, half open: `from` is inside it and `to` is the first instant after. */
export interface Window {
  readonly from: Date;
  readonly to: Date;
}

/** An event with the answers counted, which is what every listing wants and no page wants to count. */
export interface Tally {
  readonly event: Event;
  readonly going: number;
  readonly maybe: number;
  readonly waiting: number;
  readonly guests: number;
  /**
   * Places held: members going, plus guests. It is one number because a capacity is one door, and
   * a page that showed only the members would offer a seat every answer is then refused.
   */
  readonly taken: number;
  readonly attended: number;
}

/**
 * Two questions about an instant, named because they are not the same question and were quietly
 * being answered by the same predicate.
 *
 * `pending` is "still worth showing": an event with an end is over when its end has passed, one
 * without is over when it has started, and tonight's meeting belongs in a listing while it is
 * happening.
 *
 * `unstarted` is "still ours to reshape": the meeting that is happening right now is not. Its room
 * cannot change, because the club is standing in the old one, and it cannot be dropped by a rule
 * change, because somebody is taking attendance at it. So the writes stop at the door and the
 * listing does not.
 */
function pending(eb: ExpressionBuilder<Schema, 'event'>, at: number): Expression<SqlBool> {
  return eb.or([
    eb('event.endsAt', '>=', at),
    eb.and([eb('event.endsAt', 'is', null), eb('event.startsAt', '>=', at)]),
  ]);
}

function unstarted(eb: ExpressionBuilder<Schema, 'event'>, at: number): Expression<SqlBool> {
  return eb('event.startsAt', '>=', at);
}

/**
 * Anything a window can see: it begins before the window ends, and it has not finished before the
 * window begins. An evening that started on Sunday and ran into Monday belongs to both days, which
 * is the whole reason this is an overlap rather than a comparison against the start.
 */
function within(eb: ExpressionBuilder<Schema, 'event'>, from: number, to: number): Expression<SqlBool> {
  return eb.and([eb('event.startsAt', '<', to), pending(eb, from)]);
}

export class Events {
  /**
   * How many events one window may answer with. It is far above a page because a window is already
   * bounded by the calendar asking it: a month of a busy club is a hundred nights, and the caller
   * cannot page through a grid it is drawing all at once.
   */
  static readonly WINDOW = 500;

  constructor(
    private readonly db: Kysely<Schema>,
    private readonly search: Search = Search.ASCII,
  ) {}

  static of(row: Selectable<EventTable>): Event {
    return new Event({
      id: row.id,
      title: row.title,
      description: row.description,
      kind: row.kind,
      state: row.state,
      startsAt: Row.at(row.startsAt),
      endsAt: Row.atOrNull(row.endsAt),
      closesAt: Row.atOrNull(row.closesAt),
      location: row.location,
      capacity: row.capacity,
      seasonId: row.seasonId,
      scheduleId: row.scheduleId,
      listed: Row.flag(row.listed),
      createdBy: row.createdBy,
      createdAt: Row.at(row.createdAt),
    });
  }

  async byId(id: EventId): Promise<Event | null> {
    const row = await this.db.selectFrom('event').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? Events.of(row) : null;
  }

  async list(filter: Filter = {}): Promise<Tally[]> {
    let query = this.db
      .selectFrom('event')
      .selectAll('event')
      .select((eb) => [
        eb
          .selectFrom('rsvp')
          .select(({ fn }) => fn.countAll<number>().as('n'))
          .whereRef('rsvp.eventId', '=', 'event.id')
          .where('rsvp.answer', 'in', Rsvp.SEATED)
          .as('going'),
        eb
          .selectFrom('rsvp')
          .select(({ fn }) => fn.countAll<number>().as('n'))
          .whereRef('rsvp.eventId', '=', 'event.id')
          .where('rsvp.answer', '=', Rsvp.MAYBE)
          .as('maybe'),
        eb
          .selectFrom('rsvp')
          .select(({ fn }) => fn.countAll<number>().as('n'))
          .whereRef('rsvp.eventId', '=', 'event.id')
          .where('rsvp.answer', '=', Rsvp.QUEUED)
          .as('waiting'),
        eb
          .selectFrom('guest')
          .select(({ fn }) => fn.countAll<number>().as('n'))
          .whereRef('guest.eventId', '=', 'event.id')
          .as('guests'),
        eb
          .selectFrom('rsvp')
          .select(({ fn }) => fn.countAll<number>().as('n'))
          .whereRef('rsvp.eventId', '=', 'event.id')
          .where('rsvp.attendedAt', 'is not', null)
          .as('attended'),
        eb
          .selectFrom('guest')
          .select(({ fn }) => fn.countAll<number>().as('n'))
          .whereRef('guest.eventId', '=', 'event.id')
          .where('guest.attendedAt', 'is not', null)
          .as('present'),
      ])
      .orderBy('event.startsAt', 'asc')
      /**
       * A total order, so page two is not page one again with two rows swapped. Ties on the start
       * are the normal case here, a whole term stamped from one schedule, and Postgres returns
       * equal keys in whatever order the heap holds them, which `retemplate` rewrites wholesale.
       */
      .orderBy('event.id', 'asc')
      .limit(filter.limit ?? (filter.window ? Events.WINDOW : Event.PAGE))
      .offset(filter.offset ?? 0);

    if (filter.state) query = query.where('event.state', '=', filter.state);
    if (!filter.drafts) {
      const viewer = filter.viewer;
      query = query.where((eb) =>
        viewer
          ? eb.or([eb('event.state', '!=', Event.INITIAL), eb('event.createdBy', '=', viewer)])
          : eb('event.state', '!=', Event.INITIAL),
      );
    }
    if (filter.kind) query = query.where('event.kind', '=', filter.kind);
    if (filter.seasonId) query = query.where('event.seasonId', '=', filter.seasonId);
    if (filter.scheduleId) query = query.where('event.scheduleId', '=', filter.scheduleId);
    if (filter.listed !== undefined) query = query.where('event.listed', '=', Row.bit(filter.listed));
    const wanted = filter.query?.trim();
    if (wanted) {
      query = query.where((eb) =>
        this.search.any(eb, ['event.title', 'event.location', 'event.description'], wanted),
      );
    }
    if (filter.upcoming) {
      const at = Row.ms(filter.upcoming);
      query = query.where((eb) => pending(eb, at));
    }
    if (filter.window) {
      const { from, to } = filter.window;
      query = query.where((eb) => within(eb, Row.ms(from), Row.ms(to)));
    }

    return (await query.execute()).map((row) => ({
      event: Events.of(row),
      going: Number(row.going),
      maybe: Number(row.maybe),
      waiting: Number(row.waiting),
      guests: Number(row.guests),
      taken: Number(row.going) + Number(row.guests),
      attended: Number(row.attended) + Number(row.present),
    }));
  }

  async create(draft: Draft, createdBy: MemberId, now: Date = new Date()): Promise<Event> {
    const row = await this.db
      .insertInto('event')
      .values(Events.values(draft, createdBy, now))
      .returningAll()
      .executeTakeFirstOrThrow();
    return Events.of(row);
  }

  /** A draft as a row, written once so `create` and `stamp` cannot fill a column differently. */
  private static values(draft: Draft, createdBy: MemberId, now: Date) {
    return {
      id: Id.create<'event'>(),
      title: draft.title,
      description: draft.description ?? null,
      kind: draft.kind,
      state: draft.state ?? Event.INITIAL,
      startsAt: Row.ms(draft.startsAt),
      endsAt: Row.msOrNull(draft.endsAt ?? null),
      closesAt: Row.msOrNull(draft.closesAt ?? null),
      location: draft.location ?? null,
      capacity: draft.capacity ?? null,
      seasonId: draft.seasonId ?? null,
      scheduleId: draft.scheduleId ?? null,
      listed: Row.bit(draft.listed ?? false),
      createdBy,
      createdAt: Row.ms(now),
    };
  }

  /**
   * Creates one occurrence of a schedule, or answers null because that night already exists. The
   * unique index on `(scheduleId, startsAt)` is what settles two expansions racing: one of them
   * inserts and the other is told, rather than both creating the same night with its own sheet.
   */
  async stamp(draft: Draft, createdBy: MemberId, now: Date = new Date()): Promise<Event | null> {
    const row = await this.db
      .insertInto('event')
      .values(Events.values(draft, createdBy, now))
      .onConflict((c) => c.columns(['scheduleId', 'startsAt']).doNothing())
      .returningAll()
      .executeTakeFirst();
    return row ? Events.of(row) : null;
  }

  async update(id: EventId, patch: Patch): Promise<Event | null> {
    const values = {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.kind !== undefined && { kind: patch.kind }),
      ...(patch.state !== undefined && { state: patch.state }),
      ...(patch.startsAt !== undefined && { startsAt: Row.ms(patch.startsAt) }),
      ...(patch.endsAt !== undefined && { endsAt: Row.msOrNull(patch.endsAt) }),
      ...(patch.closesAt !== undefined && { closesAt: Row.msOrNull(patch.closesAt) }),
      ...(patch.location !== undefined && { location: patch.location }),
      ...(patch.capacity !== undefined && { capacity: patch.capacity }),
      ...(patch.seasonId !== undefined && { seasonId: patch.seasonId }),
      ...(patch.scheduleId !== undefined && { scheduleId: patch.scheduleId }),
      ...(patch.listed !== undefined && { listed: Row.bit(patch.listed) }),
    };
    if (Object.keys(values).length === 0) return this.byId(id);

    const row = await this.db
      .updateTable('event')
      .set(values)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? Events.of(row) : null;
  }

  /**
   * Carries a changed template onto the occurrences that have not happened yet, and answers which
   * ones moved. The past is left alone: a room that changes in March did not change in February,
   * and rewriting what a sheet says happened would be a lie a report is built from.
   *
   * Only the fields a template owns are accepted. A start time is not one of them: moving a night
   * is a rule change, which drops and restamps rather than editing in place, because two
   * occurrences of one schedule may not share a start. Neither is a state: an occurrence somebody
   * cancelled by hand stays cancelled, and no template edit un-cancels a term's worth of them.
   */
  async retemplate(
    scheduleId: ScheduleId,
    from: Date,
    patch: Omit<Patch, 'startsAt' | 'scheduleId' | 'state'>,
  ): Promise<EventId[]> {
    const values = {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.kind !== undefined && { kind: patch.kind }),
      ...(patch.endsAt !== undefined && { endsAt: Row.msOrNull(patch.endsAt) }),
      ...(patch.closesAt !== undefined && { closesAt: Row.msOrNull(patch.closesAt) }),
      ...(patch.location !== undefined && { location: patch.location }),
      ...(patch.capacity !== undefined && { capacity: patch.capacity }),
      ...(patch.seasonId !== undefined && { seasonId: patch.seasonId }),
      ...(patch.listed !== undefined && { listed: Row.bit(patch.listed) }),
    };
    if (Object.keys(values).length === 0) return [];

    const touched = await this.db
      .updateTable('event')
      .set(values)
      .where('scheduleId', '=', scheduleId)
      .where((eb) => unstarted(eb, Row.ms(from)))
      .returning('id')
      .execute();
    return touched.map((row) => row.id);
  }

  /**
   * Sets the length of every occurrence still to come, each from its own start.
   *
   * It is one statement rather than a row at a time because it is one rule: an occurrence ends
   * `minutes` after it begins. It is not part of `retemplate` because it cannot be, that being a
   * single `SET` of constants, and every row here needs its own arithmetic.
   */
  async restretch(scheduleId: ScheduleId, from: Date, minutes: number | null): Promise<number> {
    const ends =
      minutes === null ? sql<number | null>`null` : sql<number>`"startsAt" + ${minutes * Schedule.MINUTE}`;

    const touched = await this.db
      .updateTable('event')
      .set({ endsAt: ends })
      .where('scheduleId', '=', scheduleId)
      .where((eb) => unstarted(eb, Row.ms(from)))
      .returning('id')
      .execute();
    return touched.length;
  }

  /**
   * Drops the occurrences still to come that the rule no longer asks for, and answers how many.
   *
   * This is what makes editing a schedule survivable. Deleting every future night and stamping it
   * again is correct only when every night moved; a rule that gained two weeks on the end, or one
   * whose length changed, produces the same dates it did before, and throwing those rows away
   * takes every answer, every guest and every attendance mark with them.
   */
  async reconcile(scheduleId: ScheduleId, from: Date, keep: readonly Date[]): Promise<EventId[]> {
    let query = this.db
      .deleteFrom('event')
      .where('scheduleId', '=', scheduleId)
      .where((eb) => unstarted(eb, Row.ms(from)));

    /** An empty list means the rule has run out: everything still to come goes. */
    if (keep.length > 0) query = query.where('startsAt', 'not in', keep.map(Row.ms));

    return (await query.returning('id').execute()).map((row) => row.id);
  }

  /** When a schedule has already been stamped, so topping it up never creates the same night twice. */
  async occurrences(scheduleId: ScheduleId): Promise<Date[]> {
    const rows = await this.db
      .selectFrom('event')
      .select('startsAt')
      .where('scheduleId', '=', scheduleId)
      .orderBy('startsAt', 'asc')
      .execute();
    return rows.map((row) => Row.at(row.startsAt));
  }

  async remove(id: EventId): Promise<void> {
    await this.db.deleteFrom('event').where('id', '=', id).execute();
  }

  /** Drops the occurrences of a schedule that have not happened yet, which is what deleting one is. */
  async removeOccurrences(scheduleId: ScheduleId, from: Date): Promise<number> {
    /**
     * The rows are read back rather than counted from the driver: `bun:sqlite` reports cascaded
     * children in its change count and `node:sqlite` and Postgres do not, so the number an
     * organiser is shown would depend on which binding the runtime happened to have.
     */
    const dropped = await this.db
      .deleteFrom('event')
      .where('scheduleId', '=', scheduleId)
      .where((eb) => unstarted(eb, Row.ms(from)))
      .returning('id')
      .execute();
    return dropped.length;
  }
}
