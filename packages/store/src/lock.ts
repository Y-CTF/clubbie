import type { EventId } from '@clubbie/core';
import type { Kysely, Transaction } from 'kysely';
import type { Schema } from './schema.ts';

/**
 * Holding a row still while a transaction decides something from it.
 *
 * Two decisions in this store are made by reading and then writing: whether the last seat is
 * free, and whether a sign-in is the first one (and therefore the founder). Under SQLite both are
 * safe for a reason that has nothing to do with the code: the driver runs one statement at a
 * time, so transactions never interleave. Under Postgres, `READ COMMITTED` gives each transaction
 * a snapshot per statement, and two of them counting nine seats both see nine, both insert, and
 * an event with ten places seats eleven people.
 *
 * So a lock is taken on a row that everybody competing has to pass through: the event for a seat,
 * the club for an enrolment. `SELECT … FOR UPDATE` makes the second transaction wait for the
 * first to commit, which is exactly the serialisation SQLite gives for free. It is a no-op on
 * SQLite because there the statement is not supported and not needed.
 */
export class Lock {
  private constructor(readonly held: boolean) {}

  /** Postgres, where transactions interleave and a decision made on a read needs holding. */
  static readonly ROWS = new Lock(true);
  /** SQLite, which serialises every statement in the driver. */
  static readonly NONE = new Lock(false);

  /** Holds the event a seat is being counted for, until the transaction that took it commits. */
  async event(tx: Transaction<Schema> | Kysely<Schema>, eventId: EventId): Promise<void> {
    if (!this.held) return;
    await tx.selectFrom('event').select('id').where('id', '=', eventId).forUpdate().execute();
  }

  /**
   * Holds the club row, which every enrolment reads through. It is the only singleton the schema
   * has, which makes it the one place two first-ever sign-ins can be made to queue behind each
   * other rather than both deciding they are the first.
   */
  async club(tx: Transaction<Schema> | Kysely<Schema>): Promise<void> {
    if (!this.held) return;
    await tx.selectFrom('club').select('id').forUpdate().execute();
  }
}
