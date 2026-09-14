import { Brand } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { Logger } from '@clubbie/log';
import { markup } from '@clubbie/term';
import { type Dialect, Kysely, sql } from 'kysely';
import { Codes } from './codes.ts';
import { Postgres } from './dialect/postgres.ts';
import { SqliteDialect } from './dialect/sqlite.ts';
import { Lock } from './lock.ts';
import { MIGRATIONS, type Migration } from './migrations.ts';
import { Assets } from './repo/assets.ts';
import { Audits } from './repo/audits.ts';
import { Clubs } from './repo/club.ts';
import { Events } from './repo/events.ts';
import { Guests } from './repo/guests.ts';
import { Jobs } from './repo/jobs.ts';
import { Kinds } from './repo/kinds.ts';
import { Links } from './repo/links.ts';
import { Members } from './repo/members.ts';
import { Preferences } from './repo/prefs.ts';
import { Rsvps } from './repo/rsvps.ts';
import { Schedules } from './repo/schedules.ts';
import { Seasons } from './repo/seasons.ts';
import { Sessions } from './repo/sessions.ts';
import { Signins } from './repo/signins.ts';
import type { Schema } from './schema.ts';
import { Search } from './search.ts';

/**
 * The database handle and the repositories over it. A url picks the dialect, so nothing above
 * the store names a driver and a deployment moves from SQLite to Postgres by editing one string.
 *
 * Every query is timed. A slow one is a `warn` with its SQL, because the query that will hurt a
 * club's server is the one nobody knew was doing a table scan, and a failing one is an `error`
 * carrying the statement, since a driver's own message alone never says which query it was.
 */
export class Store {
  static readonly SQLITE = 'sqlite:';
  static readonly POSTGRES = ['postgres://', 'postgresql://'];
  /** What `DATABASE_URL` falls back to, and what a test opens. Built, so the two agree. */
  static readonly MEMORY = `${Store.SQLITE}${SqliteDialect.MEMORY}`;
  /** A file path as a url this store will open. The one place the scheme is written onto a path. */
  static file(path: string): string {
    return `${Store.SQLITE}${path}`;
  }

  /** The variable a bad url is underlined in. */
  static readonly VAR = 'DATABASE_URL';
  /** A query past this is logged at `warn` however well it went. */
  static readonly SLOW = 200;

  readonly members: Members;
  readonly sessions: Sessions;
  readonly seasons: Seasons;
  readonly events: Events;
  readonly rsvps: Rsvps;
  readonly links: Links;
  readonly signins: Signins;
  readonly club: Clubs;
  readonly schedules: Schedules;
  readonly guests: Guests;
  readonly jobs: Jobs;
  readonly audit: Audits;
  readonly assets: Assets;
  readonly kinds: Kinds;
  readonly prefs: Preferences;

  private constructor(
    readonly db: Kysely<Schema>,
    readonly log: Logger,
    readonly lock: Lock,
    readonly search: Search,
  ) {
    this.members = new Members(db, lock, search);
    this.sessions = new Sessions(db);
    this.seasons = new Seasons(db);
    this.events = new Events(db, search);
    this.rsvps = new Rsvps(db, lock);
    this.links = new Links(db);
    this.signins = new Signins(db);
    this.club = new Clubs(db, lock);
    this.schedules = new Schedules(db);
    this.guests = new Guests(db, lock);
    this.jobs = new Jobs(db);
    this.audit = new Audits(db);
    this.assets = new Assets(db);
    this.kinds = new Kinds(db);
    this.prefs = new Preferences(db);
  }

  static async open(url: string = Store.MEMORY, parent: Logger = Logger.create(Brand.scope)): Promise<Store> {
    const log = parent.child('store', { dialect: Store.kind(url) });
    const db = new Kysely<Schema>({
      dialect: await Store.dialect(url, log),
      log: (event) => {
        const took = event.queryDurationMillis;
        const sql = event.query.sql;
        if (event.level === 'error') {
          log.error('query failed', event.error, { sql, took: Math.round(took) });
        } else if (took >= Store.SLOW) {
          log.warn('slow query', { sql, took: Math.round(took) });
        } else {
          log.trace('query', { sql, took: Math.round(took) });
        }
      },
    });

    const postgres = Store.kind(url) === 'postgres';
    const store = new Store(
      db,
      log,
      postgres ? Lock.ROWS : Lock.NONE,
      postgres ? Search.UNICODE : Search.ASCII,
    );
    await store.migrate();
    return store;
  }

  /** The dialect a url names, for logging and for the error when it names none. */
  static kind(url: string): 'sqlite' | 'postgres' | 'unknown' {
    if (url.startsWith(Store.SQLITE)) return 'sqlite';
    if (Store.POSTGRES.some((scheme) => url.startsWith(scheme))) return 'postgres';
    return 'unknown';
  }

  private static async dialect(url: string, log: Logger): Promise<Dialect> {
    switch (Store.kind(url)) {
      case 'sqlite': {
        const path = url.slice(Store.SQLITE.length);
        log.debug('opening sqlite', { path });
        return new SqliteDialect(path);
      }
      case 'postgres':
        log.debug('connecting to postgres');
        return Postgres.dialect(url);
      default:
        throw Diag.error(Codes.url, 'that database url names no dialect clubbie knows')
          .over(Store.VAR, url)
          .at(url.split(':')[0] ?? url, 'unrecognised scheme')
          .note('supported: `sqlite:<path>`, `postgres://…`, `postgresql://…`')
          .help('for a single-machine deployment, `sqlite:clubbie.db` needs nothing else');
    }
  }

  /**
   * Refuses a migration list with two of anything.
   *
   * Migrations are append-only and applied by "greater than the version we are on", so two rows
   * claiming version 10 (which is what two branches adding a migration each and merging cleanly
   * produces) meant the first ran, the second was silently skipped for ever, and the schema was
   * wrong in a way nothing reported. It is checked on every boot because that is the moment the
   * merge is discovered.
   */
  private static distinct(migrations: readonly Migration[]): void {
    const seen = new Map<number, string>();
    for (const migration of migrations) {
      const first = seen.get(migration.version);
      if (first !== undefined) {
        throw Diag.error(Codes.migration, markup`two migrations claim version ${migration.version}`)
          .note(markup`*${first}* and *${migration.name}*`)
          .help('renumber the later one: migrations are append-only and applied in order');
      }
      seen.set(migration.version, migration.name);
    }
  }

  /** The newest version any migration declares, rather than a constant that can fall behind. */
  static get latest(): number {
    return Math.max(...MIGRATIONS.map((m) => m.version));
  }

  get version(): Promise<number> {
    return this.db
      .selectFrom('migration')
      .select('version')
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst()
      .then((row) => row?.version ?? 0);
  }

  /**
   * Applies every migration newer than the recorded version. Each runs in its own transaction
   * together with the row that records it, so a failed migration leaves no half-applied schema
   * and no version claiming work that did not happen.
   *
   * A failure is reported as a diagnostic naming the migration, since the driver's own message
   * ("no such column") says nothing about which change was being applied.
   */
  async migrate(migrations: readonly Migration[] = MIGRATIONS): Promise<number[]> {
    await this.db.schema
      .createTable('migration')
      .ifNotExists()
      .addColumn('version', 'integer', (c) => c.primaryKey())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('appliedAt', 'bigint', (c) => c.notNull())
      .execute();

    const applied: number[] = [];
    const from = await this.version;
    Store.distinct(migrations);

    const pending = [...migrations].sort((a, b) => a.version - b.version).filter((m) => m.version > from);

    if (pending.length === 0) {
      this.log.debug('schema up to date', { version: from });
      return applied;
    }

    this.log.info('migrating', { from, to: Store.latest, pending: pending.length });
    for (const migration of pending) {
      try {
        await this.db.transaction().execute(async (tx) => {
          await migration.up(tx);
          await tx
            .insertInto('migration')
            .values({ version: migration.version, name: migration.name, appliedAt: Date.now() })
            .execute();
        });
      } catch (error) {
        throw Diag.of(error, Codes.migration)
          .note(markup`migration ${migration.version} (*${migration.name}*) was rolled back`)
          .note(markup`the schema is still at version ${await this.version}`)
          .help('fix the migration, or restore the database from a backup before retrying');
      }
      this.log.info('migration applied', { version: migration.version, name: migration.name });
      applied.push(migration.version);
    }
    return applied;
  }

  /** Proves the connection answers, which is what a health check and `clubbie migrate` report. */
  async ping(): Promise<void> {
    await sql`select 1`.execute(this.db);
  }

  async close(): Promise<void> {
    await this.db.destroy();
    this.log.debug('closed');
  }
}
