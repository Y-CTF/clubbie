import { type MemberId, Prefs } from '@clubbie/core';
import type { Kysely, Selectable } from 'kysely';
import { Row } from '../row.ts';
import type { PreferenceTable, Schema } from '../schema.ts';

export interface Patch {
  readonly telegram?: boolean | undefined;
  readonly email?: boolean | undefined;
  readonly announcements?: boolean | undefined;
  readonly reminders?: boolean | undefined;
}

/**
 * What each member has agreed to hear. A member with no row has agreed to everything, which is
 * what `Prefs.default` says, so nothing has to write a row when somebody signs up.
 */
export class Preferences {
  constructor(private readonly db: Kysely<Schema>) {}

  static of(row: Selectable<PreferenceTable>): Prefs {
    return new Prefs({
      memberId: row.memberId,
      telegram: Row.flag(row.telegram),
      email: Row.flag(row.email),
      announcements: Row.flag(row.announcements),
      reminders: Row.flag(row.reminders),
    });
  }

  async read(memberId: MemberId): Promise<Prefs> {
    const row = await this.db
      .selectFrom('preference')
      .selectAll()
      .where('memberId', '=', memberId)
      .executeTakeFirst();
    return row ? Preferences.of(row) : Prefs.default(memberId);
  }

  /** The preferences of several members at once, which is what a broadcast needs. */
  async many(memberIds: readonly MemberId[]): Promise<Map<MemberId, Prefs>> {
    const out = new Map<MemberId, Prefs>(memberIds.map((id) => [id, Prefs.default(id)]));
    if (memberIds.length === 0) return out;

    const rows = await this.db
      .selectFrom('preference')
      .selectAll()
      .where('memberId', 'in', memberIds)
      .execute();
    for (const row of rows) out.set(row.memberId, Preferences.of(row));
    return out;
  }

  async update(memberId: MemberId, patch: Patch): Promise<Prefs> {
    const current = await this.read(memberId);
    const next = new Prefs({
      memberId,
      telegram: patch.telegram ?? current.telegram,
      email: patch.email ?? current.email,
      announcements: patch.announcements ?? current.announcements,
      reminders: patch.reminders ?? current.reminders,
    });

    const values = {
      memberId,
      telegram: Row.bit(next.telegram),
      email: Row.bit(next.email),
      announcements: Row.bit(next.announcements),
      reminders: Row.bit(next.reminders),
    };

    await this.db
      .insertInto('preference')
      .values(values)
      .onConflict((c) => c.column('memberId').doUpdateSet(values))
      .execute();
    return next;
  }
}
