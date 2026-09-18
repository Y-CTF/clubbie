import { Logger } from '@clubbie/log';
import { Store } from '../src/index.ts';

/**
 * A store for a test: in-memory SQLite by default, and whatever `TEST_DATABASE_URL` names when it
 * is set, so the suite proves both dialects rather than asserting one and claiming the other.
 *
 * It reads a variable of its own, and deliberately not `DATABASE_URL`. Bun loads `.env` for
 * `bun test` as well as for `bun run`, so a fixture that honoured `DATABASE_URL` would open the
 * database the dev server is using and empty every table in it. That is not a hypothetical: it
 * happened, and it took a developer's club with it.
 *
 * A database that survives between runs is emptied first. The order matters: children before
 * parents, because the foreign keys are real.
 */
export namespace Fixture {
  /**
   * The one variable that points a test at a real database. It has to be set on purpose, because
   * everything this namespace does to a database is destructive.
   */
  export const VAR = 'TEST_DATABASE_URL';
  /** Every table with rows in it, children first. `migration` is deliberately left alone. */
  export const TABLES = [
    'asset',
    'audit',
    'job',
    'guest',
    'rsvp',
    'event',
    'schedule',
    'membership',
    'season',
    'preference',
    'telegram',
    'link',
    'signin',
    'team',
    'teammate',
    'session',
    'account',
    'member',
    'club',
    'kind',
  ] as const;

  export async function open(): Promise<Store> {
    const { log } = Logger.memory();
    const url = globalThis.process?.env?.[Fixture.VAR] ?? Store.MEMORY;
    const store = await Store.open(url, log);

    if (url !== Store.MEMORY) await empty(store);
    return store;
  }

  /**
   * Emptied, and then put back the way a migrated database arrives: with its club row.
   *
   * The row is a singleton that migration 16 guarantees exists, because `Lock.club` takes the
   * enrolment lock on it and `SELECT … FOR UPDATE` over an empty table locks nothing. Deleting it
   * between tests left the Postgres run testing a database no deployment ever has, and the test
   * that says so failed there while passing on the in-memory dialect, which is never re-emptied.
   */
  export async function empty(store: Store): Promise<void> {
    for (const table of TABLES) await store.db.deleteFrom(table).execute();
    await store.club.update({});
  }
}
