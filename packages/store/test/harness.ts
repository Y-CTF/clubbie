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

  export async function empty(store: Store): Promise<void> {
    for (const table of TABLES) await store.db.deleteFrom(table).execute();
  }
}
