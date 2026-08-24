import type { Member, MemberId } from '@clubbie/core';
import type { Kysely } from 'kysely';
import { Row } from '../row.ts';
import type { Schema } from '../schema.ts';
import { Members } from './members.ts';

export interface Session {
  readonly id: string;
  readonly member: Member;
  readonly expiresAt: Date;
}

/**
 * Sessions keyed by the digest of a bearer token, never the token itself, so a dump of this table
 * lets nobody sign in. Hashing is the auth package's job; the store only ever sees the digest.
 */
export class Sessions {
  constructor(private readonly db: Kysely<Schema>) {}

  async open(digest: string, memberId: MemberId, expiresAt: Date, now: Date = new Date()): Promise<void> {
    await this.db
      .insertInto('session')
      .values({
        id: digest,
        memberId,
        expiresAt: Row.ms(expiresAt),
        createdAt: Row.ms(now),
      })
      .execute();
  }

  /** An expired session reads as absent, so no caller has to remember to check the clock. */
  async resolve(digest: string, now: Date = new Date()): Promise<Session | null> {
    const row = await this.db
      .selectFrom('session')
      .innerJoin('member', 'member.id', 'session.memberId')
      .select(['session.id as sessionId', 'session.expiresAt as expiresAt'])
      .selectAll('member')
      .where('session.id', '=', digest)
      .where('session.expiresAt', '>', Row.ms(now))
      .executeTakeFirst();
    if (!row) return null;

    return {
      id: row.sessionId,
      member: Members.of(row),
      expiresAt: Row.at(row.expiresAt),
    };
  }

  /**
   * Pushes a session's expiry out. A member who uses the app every week is never signed out by
   * the clock, and one who disappears for a month still is, which is what a sliding window buys.
   */
  async renew(digest: string, expiresAt: Date): Promise<void> {
    await this.db
      .updateTable('session')
      .set({ expiresAt: Row.ms(expiresAt) })
      .where('id', '=', digest)
      .execute();
  }

  async close(digest: string): Promise<void> {
    await this.db.deleteFrom('session').where('id', '=', digest).execute();
  }

  /** Signs a member out everywhere, which is what a status change to `pending` must do. */
  async closeAll(memberId: MemberId): Promise<void> {
    await this.db.deleteFrom('session').where('memberId', '=', memberId).execute();
  }

  async sweep(now: Date = new Date()): Promise<number> {
    const result = await this.db
      .deleteFrom('session')
      .where('expiresAt', '<=', Row.ms(now))
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
}
