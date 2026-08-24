import { Id, type Member, type Membership, Season, type SeasonId } from '@clubbie/core';
import type { Kysely, Selectable } from 'kysely';
import { Row } from '../row.ts';
import type { Schema, SeasonTable } from '../schema.ts';
import { Members } from './members.ts';

export interface Draft {
  readonly name: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly renewalAt?: Date | null | undefined;
  readonly current?: boolean | undefined;
}

export class Seasons {
  constructor(private readonly db: Kysely<Schema>) {}

  static of(row: Selectable<SeasonTable>): Season {
    return new Season({
      id: row.id,
      name: row.name,
      startsAt: Row.at(row.startsAt),
      endsAt: Row.at(row.endsAt),
      current: Row.flag(row.current),
      renewalAt: Row.atOrNull(row.renewalAt),
      createdAt: Row.at(row.createdAt),
    });
  }

  async byId(id: SeasonId): Promise<Season | null> {
    const row = await this.db.selectFrom('season').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? Seasons.of(row) : null;
  }

  async current(): Promise<Season | null> {
    const row = await this.db
      .selectFrom('season')
      .selectAll()
      .where('current', '=', Row.TRUE)
      .executeTakeFirst();
    return row ? Seasons.of(row) : null;
  }

  async list(): Promise<Season[]> {
    return (await this.db.selectFrom('season').selectAll().orderBy('startsAt', 'desc').execute()).map(
      Seasons.of,
    );
  }

  async create(draft: Draft, now: Date = new Date()): Promise<Season> {
    const id = Id.create<'season'>();
    return this.db.transaction().execute(async (tx) => {
      if (draft.current) await Seasons.clear(tx);
      const row = await tx
        .insertInto('season')
        .values({
          id,
          name: draft.name,
          startsAt: Row.ms(draft.startsAt),
          endsAt: Row.ms(draft.endsAt),
          current: Row.bit(draft.current ?? false),
          renewalAt: Row.msOrNull(draft.renewalAt ?? null),
          createdAt: Row.ms(now),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return Seasons.of(row);
    });
  }

  /**
   * Makes one season the current one. Clearing the others in the same transaction is what keeps
   * "at most one current season" true, since neither dialect can express it as a constraint.
   */
  async promote(id: SeasonId): Promise<Season | null> {
    return this.db.transaction().execute(async (tx) => {
      await Seasons.clear(tx);
      const row = await tx
        .updateTable('season')
        .set({ current: Row.TRUE })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      return row ? Seasons.of(row) : null;
    });
  }

  private static async clear(tx: Kysely<Schema>): Promise<void> {
    await tx.updateTable('season').set({ current: Row.FALSE }).where('current', '=', Row.TRUE).execute();
  }

  /** Idempotent: joining a season twice is the same membership, not an error. */
  async join(memberId: Membership['memberId'], seasonId: SeasonId, now: Date = new Date()): Promise<void> {
    await this.db
      .insertInto('membership')
      .values({ memberId, seasonId, joinedAt: Row.ms(now) })
      .onConflict((c) => c.columns(['memberId', 'seasonId']).doNothing())
      .execute();
  }

  async leave(memberId: Membership['memberId'], seasonId: SeasonId): Promise<void> {
    await this.db
      .deleteFrom('membership')
      .where('memberId', '=', memberId)
      .where('seasonId', '=', seasonId)
      .execute();
  }

  /**
   * Whether one member is on one roster. It is a question every page load asks about the caller,
   * which is why it is not "read the roster and search it": a club of two hundred would send two
   * hundred rows to answer whether one of them is you.
   */
  async holds(memberId: Membership['memberId'], seasonId: SeasonId): Promise<boolean> {
    const row = await this.db
      .selectFrom('membership')
      .select('memberId')
      .where('memberId', '=', memberId)
      .where('seasonId', '=', seasonId)
      .executeTakeFirst();
    return row !== undefined;
  }

  /**
   * Deletes a season, and answers how many memberships went with it.
   *
   * The count is read rather than derived from the delete, because the two dialects do not agree
   * on whether a cascade counts: `bun:sqlite` reports the rows the foreign key took and the others
   * do not, and this number is written into the trail where a person reads it.
   *
   * What the cascade takes is the roster and nothing else. An event filed under the season keeps
   * its own row with `seasonId` set to null, which is the schema's decision and the right one: the
   * evening happened whether or not the club still files that year.
   */
  async remove(id: SeasonId): Promise<number | null> {
    const held = await this.db
      .selectFrom('membership')
      .select((eb) => eb.fn.countAll().as('total'))
      .where('seasonId', '=', id)
      .executeTakeFirst();

    const gone = await this.db.deleteFrom('season').where('id', '=', id).returning('id').execute();
    return gone.length > 0 ? Number(held?.total ?? 0) : null;
  }

  /** The roster: who counts as a member of this season, whatever their status is today. */
  async roster(seasonId: SeasonId): Promise<Member[]> {
    const rows = await this.db
      .selectFrom('membership')
      .innerJoin('member', 'member.id', 'membership.memberId')
      .selectAll('member')
      .where('membership.seasonId', '=', seasonId)
      .orderBy('member.name', 'asc')
      .execute();
    return rows.map(Members.of);
  }
}
