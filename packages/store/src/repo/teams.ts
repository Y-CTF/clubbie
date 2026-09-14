import { type Event, type EventId, Id, type MemberId, Team, type TeamId } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import type { Kysely, Selectable } from 'kysely';
import { Codes } from '../codes.ts';
import type { Lock } from '../lock.ts';
import { Row } from '../row.ts';
import type { Schema, TeamTable } from '../schema.ts';

/** A team with its members, which is the only shape a page ever wants. */
export interface Roster {
  readonly team: Team;
  readonly members: readonly { readonly id: MemberId; readonly name: string }[];
}

export interface Draft {
  readonly name: string;
}

export class Teams {
  constructor(
    private readonly db: Kysely<Schema>,
    private readonly lock: Lock,
  ) {}

  static of(row: Selectable<TeamTable>): Team {
    return new Team({
      id: row.id,
      eventId: row.eventId,
      name: row.name,
      captainId: row.captainId,
      createdAt: Row.at(row.createdAt),
    });
  }

  /** Every team on one event, each with its members, in the order they were formed. */
  async list(eventId: EventId): Promise<Roster[]> {
    const teams = await this.db
      .selectFrom('team')
      .selectAll()
      .where('eventId', '=', eventId)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .limit(Team.LIMIT)
      .execute();
    if (teams.length === 0) return [];

    const mates = await this.db
      .selectFrom('teammate')
      .innerJoin('member', 'member.id', 'teammate.memberId')
      .select(['teammate.teamId', 'member.id', 'member.name'])
      .where(
        'teammate.teamId',
        'in',
        teams.map((one) => one.id),
      )
      .orderBy('teammate.joinedAt', 'asc')
      .execute();

    return teams.map((row) => ({
      team: Teams.of(row),
      members: mates.filter((mate) => mate.teamId === row.id).map(({ id, name }) => ({ id, name })),
    }));
  }

  async byId(id: TeamId): Promise<Team | null> {
    const row = await this.db.selectFrom('team').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? Teams.of(row) : null;
  }

  /** The team a member is on for one event, since they are only ever on one. */
  async mine(eventId: EventId, memberId: MemberId): Promise<TeamId | null> {
    const row = await this.db
      .selectFrom('teammate')
      .select('teamId')
      .where('eventId', '=', eventId)
      .where('memberId', '=', memberId)
      .executeTakeFirst();
    return row?.teamId ?? null;
  }

  /**
   * Starts a team with its captain already on it. Both writes are one transaction, because a team
   * with nobody on it is a row a member has to be told about and can do nothing with.
   */
  async create(event: Event, draft: Draft, captainId: MemberId, now: Date = new Date()): Promise<Team> {
    return this.db.transaction().execute(async (tx) => {
      const already = await tx
        .selectFrom('teammate')
        .select('teamId')
        .where('eventId', '=', event.id)
        .where('memberId', '=', captainId)
        .executeTakeFirst();
      if (already) throw Teams.taken();

      const total = await tx
        .selectFrom('team')
        .select(({ fn }) => fn.countAll<number>().as('total'))
        .where('eventId', '=', event.id)
        .executeTakeFirst();
      if (Number(total?.total ?? 0) >= Team.LIMIT) {
        throw Diag.error(Codes.conflict, markup`*${event.title}* already has as many teams as it holds`)
          .note(markup`the limit is ${Team.LIMIT}`)
          .help('join one of the teams that is already there');
      }

      const row = await tx
        .insertInto('team')
        .values({
          id: Id.create<'team'>(now.getTime()),
          eventId: event.id,
          name: draft.name,
          captainId,
          createdAt: Row.ms(now),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await tx
        .insertInto('teammate')
        .values({ teamId: row.id, eventId: event.id, memberId: captainId, joinedAt: Row.ms(now) })
        .execute();

      return Teams.of(row);
    });
  }

  /**
   * Puts a member on a team, counting the places and writing the answer in one transaction, the
   * way a seat is claimed. Two people taking the last place in a team of four is the same race.
   */
  async join(event: Event, teamId: TeamId, memberId: MemberId, now: Date = new Date()): Promise<Roster> {
    return this.db.transaction().execute(async (tx) => {
      await this.lock.event(tx, event.id);

      const team = await tx
        .selectFrom('team')
        .selectAll()
        .where('id', '=', teamId)
        .where('eventId', '=', event.id)
        .executeTakeFirst();
      if (!team) throw Diag.error(Codes.missing, 'no such team');

      const already = await tx
        .selectFrom('teammate')
        .select('teamId')
        .where('eventId', '=', event.id)
        .where('memberId', '=', memberId)
        .executeTakeFirst();
      if (already) throw Teams.taken();

      const taken = await tx
        .selectFrom('teammate')
        .select(({ fn }) => fn.countAll<number>().as('total'))
        .where('teamId', '=', teamId)
        .executeTakeFirst();

      if (Team.full(event.teamSize, Number(taken?.total ?? 0))) {
        throw Diag.error(Codes.conflict, markup`*${team.name}* is full`)
          .note(markup`a team here holds ${event.teamSize ?? 0}`)
          .help('join another team, or ask an organiser to make this one bigger');
      }

      await tx
        .insertInto('teammate')
        .values({ teamId, eventId: event.id, memberId, joinedAt: Row.ms(now) })
        .execute();

      return this.roster(tx, teamId);
    });
  }

  /**
   * Takes a member off their team, and drops the team when the last one leaves.
   *
   * A team the captain walked out of passes to whoever has been on it longest rather than being
   * dissolved: the other three did not leave, and a club that loses its team because one person
   * changed their mind on Tuesday would rather it did not.
   */
  async leave(eventId: EventId, memberId: MemberId): Promise<TeamId | null> {
    return this.db.transaction().execute(async (tx) => {
      const mate = await tx
        .deleteFrom('teammate')
        .where('eventId', '=', eventId)
        .where('memberId', '=', memberId)
        .returning('teamId')
        .executeTakeFirst();
      if (!mate) return null;

      const left = await tx
        .selectFrom('teammate')
        .select(['memberId'])
        .where('teamId', '=', mate.teamId)
        .orderBy('joinedAt', 'asc')
        .execute();

      if (left.length === 0) {
        await tx.deleteFrom('team').where('id', '=', mate.teamId).execute();
        return mate.teamId;
      }

      const captain = left[0]?.memberId;
      if (captain) {
        await tx
          .updateTable('team')
          .set({ captainId: captain })
          .where('id', '=', mate.teamId)
          .where('captainId', '=', memberId)
          .execute();
      }
      return mate.teamId;
    });
  }

  async rename(id: TeamId, name: string): Promise<Team | null> {
    const row = await this.db
      .updateTable('team')
      .set({ name })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? Teams.of(row) : null;
  }

  /** Drops a team and everybody on it, which is an organiser's or a captain's act. */
  async remove(id: TeamId): Promise<boolean> {
    const row = await this.db.deleteFrom('team').where('id', '=', id).returning('id').executeTakeFirst();
    return row !== undefined;
  }

  /** Whoever is on a team, for the sheet an organiser prints. */
  async sheet(eventId: EventId): Promise<Roster[]> {
    return this.list(eventId);
  }

  private async roster(tx: Kysely<Schema>, teamId: TeamId): Promise<Roster> {
    const team = await tx.selectFrom('team').selectAll().where('id', '=', teamId).executeTakeFirstOrThrow();
    const mates = await tx
      .selectFrom('teammate')
      .innerJoin('member', 'member.id', 'teammate.memberId')
      .select(['member.id', 'member.name'])
      .where('teammate.teamId', '=', teamId)
      .orderBy('teammate.joinedAt', 'asc')
      .execute();

    return { team: Teams.of(team), members: mates.map(({ id, name }) => ({ id, name })) };
  }

  private static taken(): Diag {
    return Diag.error(Codes.conflict, 'you are already on a team for this event')
      .note('one member is on one team per event')
      .help('leave the team you are on first');
  }
}
