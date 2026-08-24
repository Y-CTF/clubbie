import { Bytes, type Member, type MemberId } from '@clubbie/core';
import type { Kysely } from 'kysely';
import { Row } from '../row.ts';
import type { Schema } from '../schema.ts';
import { Members } from './members.ts';

export interface Chat {
  readonly memberId: MemberId;
  readonly chatId: string;
  readonly username: string | null;
  readonly linkedAt: Date;
}

/**
 * Linking a chat account to a member. A member asks the web app for a code, then sends it to the
 * bot; the bot never learns anything about a member it was not handed a live code for.
 */
export class Links {
  /** A code is worth a session if it leaks, so it lives for minutes and is spent on first use. */
  static readonly TTL = 15 * 60 * 1000;
  static readonly BYTES = 12;

  constructor(private readonly db: Kysely<Schema>) {}

  static code(): string {
    return Bytes.token(Links.BYTES);
  }

  async issue(memberId: MemberId, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
    const token = Links.code();
    const expiresAt = new Date(now.getTime() + Links.TTL);
    await this.db
      .insertInto('link')
      .values({ token, memberId, expiresAt: Row.ms(expiresAt), usedAt: null })
      .execute();
    return { token, expiresAt };
  }

  /**
   * Spends a code and links the chat to its member, or answers null if the code is unknown, spent
   * or expired. One transaction, so two messages carrying the same code cannot both link.
   */
  async redeem(
    token: string,
    chatId: string,
    username: string | null,
    now: Date = new Date(),
  ): Promise<Member | null> {
    return this.db.transaction().execute(async (tx) => {
      const spent = await tx
        .updateTable('link')
        .set({ usedAt: Row.ms(now) })
        .where('token', '=', token)
        .where('usedAt', 'is', null)
        .where('expiresAt', '>', Row.ms(now))
        .returningAll()
        .executeTakeFirst();
      if (!spent) return null;

      await tx
        .insertInto('telegram')
        .values({ memberId: spent.memberId, chatId, username, linkedAt: Row.ms(now) })
        .onConflict((c) => c.column('memberId').doUpdateSet({ chatId, username, linkedAt: Row.ms(now) }))
        .execute();

      const member = await tx
        .selectFrom('member')
        .selectAll()
        .where('id', '=', spent.memberId)
        .executeTakeFirstOrThrow();
      return Members.of(member);
    });
  }

  async byChat(chatId: string): Promise<Member | null> {
    const row = await this.db
      .selectFrom('telegram')
      .innerJoin('member', 'member.id', 'telegram.memberId')
      .selectAll('member')
      .where('telegram.chatId', '=', chatId)
      .executeTakeFirst();
    return row ? Members.of(row) : null;
  }

  async chat(memberId: MemberId): Promise<Chat | null> {
    const row = await this.db
      .selectFrom('telegram')
      .selectAll()
      .where('memberId', '=', memberId)
      .executeTakeFirst();
    return row ? { ...row, linkedAt: Row.at(row.linkedAt) } : null;
  }

  /** The chats of particular members, for a notice that goes to some of them rather than all. */
  async chats(memberIds: readonly MemberId[]): Promise<Chat[]> {
    if (memberIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('telegram')
      .selectAll()
      .where('memberId', 'in', memberIds)
      .execute();
    return rows.map((row) => ({ ...row, linkedAt: Row.at(row.linkedAt) }));
  }

  async unlink(memberId: MemberId): Promise<void> {
    await this.db.deleteFrom('telegram').where('memberId', '=', memberId).execute();
  }

  async sweep(now: Date = new Date()): Promise<number> {
    const result = await this.db.deleteFrom('link').where('expiresAt', '<=', Row.ms(now)).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
}
