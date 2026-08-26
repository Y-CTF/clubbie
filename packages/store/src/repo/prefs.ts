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

  /**
   * Changes the switches a patch names, and only those.
   *
   * It used to read the row, merge, and write all four columns back. Two patches in flight, which
   * is a member on the settings page and the bot unlinking their chat, both read the old row and
   * the later write silently reverted the earlier one. Now the conflict update carries the touched
   * columns alone, so a switch nobody moved is a switch nobody writes.
   */
  async update(memberId: MemberId, patch: Patch): Promise<Prefs> {
    const touched = {
      ...(patch.telegram !== undefined && { telegram: Row.bit(patch.telegram) }),
      ...(patch.email !== undefined && { email: Row.bit(patch.email) }),
      ...(patch.announcements !== undefined && { announcements: Row.bit(patch.announcements) }),
      ...(patch.reminders !== undefined && { reminders: Row.bit(patch.reminders) }),
    };
    if (Object.keys(touched).length === 0) return this.read(memberId);

    const fallback = Prefs.default(memberId);
    return this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('preference')
        .values({
          memberId,
          telegram: Row.bit(fallback.telegram),
          email: Row.bit(fallback.email),
          announcements: Row.bit(fallback.announcements),
          reminders: Row.bit(fallback.reminders),
          ...touched,
        })
        .onConflict((c) => c.column('memberId').doUpdateSet(touched))
        .execute();

      const row = await tx
        .selectFrom('preference')
        .selectAll()
        .where('memberId', '=', memberId)
        .executeTakeFirstOrThrow();
      return Preferences.of(row);
    });
  }
}
