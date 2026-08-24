import {
  type Frequency,
  Id,
  type KindId,
  type MemberId,
  Recur,
  Schedule,
  type ScheduleId,
  type SeasonId,
} from '@clubbie/core';
import type { Kysely, Selectable } from 'kysely';
import { Row } from '../row.ts';
import type { ScheduleTable, Schema } from '../schema.ts';

export interface Draft {
  readonly title: string;
  readonly description?: string | null | undefined;
  readonly kind: KindId;
  readonly location?: string | null | undefined;
  readonly capacity?: number | null | undefined;
  readonly seasonId?: SeasonId | null | undefined;
  readonly startsAt: Date;
  readonly minutes?: number | null | undefined;
  readonly freq: Frequency;
  readonly interval?: number | undefined;
  readonly count?: number | null | undefined;
  readonly until?: Date | null | undefined;
  readonly listed?: boolean | undefined;
}

export type Patch = { readonly [K in keyof Draft]?: Draft[K] | undefined };

/**
 * The rules behind repeating events. The rule is flattened into columns rather than stored as a
 * blob, because "every second Tuesday until June" is four values and a query may want to know
 * which schedule end this season.
 */
export class Schedules {
  constructor(private readonly db: Kysely<Schema>) {}

  static of(row: Selectable<ScheduleTable>): Schedule {
    return new Schedule({
      id: row.id,
      title: row.title,
      description: row.description,
      kind: row.kind,
      location: row.location,
      capacity: row.capacity,
      seasonId: row.seasonId,
      startsAt: Row.at(row.startsAt),
      minutes: row.minutes,
      listed: Row.flag(row.listed),
      recur: new Recur({
        freq: row.freq,
        interval: row.interval,
        count: row.count,
        until: Row.atOrNull(row.until),
      }),
      createdBy: row.createdBy,
      createdAt: Row.at(row.createdAt),
    });
  }

  async byId(id: ScheduleId): Promise<Schedule | null> {
    const row = await this.db.selectFrom('schedule').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? Schedules.of(row) : null;
  }

  async list(): Promise<Schedule[]> {
    const rows = await this.db.selectFrom('schedule').selectAll().orderBy('startsAt', 'desc').execute();
    return rows.map(Schedules.of);
  }

  async create(draft: Draft, createdBy: MemberId, now: Date = new Date()): Promise<Schedule> {
    const row = await this.db
      .insertInto('schedule')
      .values({
        id: Id.create<'schedule'>(),
        title: draft.title,
        description: draft.description ?? null,
        kind: draft.kind,
        location: draft.location ?? null,
        capacity: draft.capacity ?? null,
        seasonId: draft.seasonId ?? null,
        startsAt: Row.ms(draft.startsAt),
        minutes: draft.minutes ?? null,
        freq: draft.freq,
        interval: draft.interval ?? Recur.EVERY,
        count: draft.count ?? null,
        until: Row.msOrNull(draft.until ?? null),
        listed: Row.bit(draft.listed ?? false),
        createdBy,
        createdAt: Row.ms(now),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return Schedules.of(row);
  }

  /**
   * Changes the template, the rule, or both. What it does not do is touch the events already
   * stamped from it: which of those follow a changed rule is a decision with an answer per club,
   * and it is made in `api/schedule.ts` where the occurrences and their answers are both in view.
   */
  async update(id: ScheduleId, patch: Patch): Promise<Schedule | null> {
    const values = {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.kind !== undefined && { kind: patch.kind }),
      ...(patch.location !== undefined && { location: patch.location }),
      ...(patch.capacity !== undefined && { capacity: patch.capacity }),
      ...(patch.seasonId !== undefined && { seasonId: patch.seasonId }),
      ...(patch.startsAt !== undefined && { startsAt: Row.ms(patch.startsAt) }),
      ...(patch.minutes !== undefined && { minutes: patch.minutes }),
      ...(patch.freq !== undefined && { freq: patch.freq }),
      ...(patch.interval !== undefined && { interval: patch.interval }),
      ...(patch.count !== undefined && { count: patch.count }),
      ...(patch.until !== undefined && { until: Row.msOrNull(patch.until) }),
      ...(patch.listed !== undefined && { listed: Row.bit(patch.listed) }),
    };
    if (Object.keys(values).length === 0) return this.byId(id);

    const row = await this.db
      .updateTable('schedule')
      .set(values)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? Schedules.of(row) : null;
  }

  async remove(id: ScheduleId): Promise<void> {
    await this.db.deleteFrom('schedule').where('id', '=', id).execute();
  }
}
