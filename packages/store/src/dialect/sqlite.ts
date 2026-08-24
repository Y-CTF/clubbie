import {
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely';

/**
 * The slice of a SQLite binding this driver uses. `bun:sqlite` and `node:sqlite` both satisfy it,
 * so the runtime picks the binding and nothing else in the store knows which one answered.
 */
export interface Binding {
  prepare(sql: string): Statement;
  close(): void;
}

export interface Statement {
  all(...params: readonly unknown[]): unknown[];
  run(...params: readonly unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

export class SqliteDialect implements Dialect {
  static readonly PRAGMAS = ['PRAGMA journal_mode = WAL', 'PRAGMA foreign_keys = ON'];
  /** `:memory:` is the path a test opens, and it is the default so a test needs no argument. */
  static readonly MEMORY = ':memory:';

  constructor(private readonly path: string = SqliteDialect.MEMORY) {}

  static async open(path: string): Promise<Binding> {
    if (typeof Bun !== 'undefined') {
      const { Database } = await import('bun:sqlite');
      return new Database(path, { create: true }) as unknown as Binding;
    }
    const { DatabaseSync } = await import('node:sqlite');
    return new DatabaseSync(path) as unknown as Binding;
  }

  createDriver(): Driver {
    return new SqliteDriver(this.path);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}

/**
 * SQLite is synchronous and single-writer, so the driver holds one connection and serialises
 * every query behind a promise chain. Two overlapping transactions would otherwise interleave
 * statements on the same handle, which SQLite would apply as one transaction.
 */
class SqliteDriver implements Driver {
  /** The transaction verbs, named rather than repeated as literals in three methods. */
  static readonly TX = { begin: 'BEGIN', commit: 'COMMIT', rollback: 'ROLLBACK' } as const;

  private binding: Binding | null = null;
  private connection: SqliteConnection | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async init(): Promise<void> {
    this.binding = await SqliteDialect.open(this.path);
    for (const pragma of SqliteDialect.PRAGMAS) this.binding.prepare(pragma).run();
    this.connection = new SqliteConnection(this.binding);
  }

  /**
   * Waits for the connection, which there is one of, and hands it over with the release that lets
   * the next caller have it.
   *
   * The release runs before any throw. It used to be created, chained onto the queue and then
   * skipped by the "used before init" throw, which left the queue awaiting a promise nothing
   * could ever resolve: every later query on that store hung for good rather than failing. A
   * store closed while a request was still running is exactly how that happens.
   */
  async acquireConnection(): Promise<DatabaseConnection> {
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waited = this.queue;
    this.queue = waited.then(() => held);
    await waited;

    if (!this.connection) {
      release();
      throw new Error('sqlite driver used before init');
    }

    this.connection.release = release;
    return this.connection;
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await SqliteDriver.verb(connection, SqliteDriver.TX.begin);
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await SqliteDriver.verb(connection, SqliteDriver.TX.commit);
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await SqliteDriver.verb(connection, SqliteDriver.TX.rollback);
  }

  /** Kysely's transaction hooks hand over raw SQL, which has no compiled query to carry. */
  private static async verb(connection: DatabaseConnection, sql: string): Promise<void> {
    await connection.executeQuery({
      sql,
      parameters: [],
      query: SqliteConnection.RAW,
      queryId: SqliteConnection.ID,
    });
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    (connection as SqliteConnection).release();
  }

  async destroy(): Promise<void> {
    this.binding?.close();
    this.binding = null;
    this.connection = null;
  }
}

class SqliteConnection implements DatabaseConnection {
  /** A statement returns rows when it selects, and `RETURNING` makes a write do so too. */
  static readonly READS = /^\s*(select|with)\b|\breturning\b/i;
  /** What a raw statement carries where a compiled query would be. Kysely never reads them. */
  static readonly RAW = { kind: 'RawNode', sqlFragments: [], parameters: [] } as never;
  static readonly ID = { queryId: 'raw' } as never;

  release: () => void = () => {};

  constructor(private readonly binding: Binding) {}

  async executeQuery<R>(compiled: { sql: string; parameters: readonly unknown[] }): Promise<QueryResult<R>> {
    const statement = this.binding.prepare(compiled.sql);
    if (SqliteConnection.READS.test(compiled.sql)) {
      return { rows: statement.all(...compiled.parameters) as R[] };
    }
    const { changes, lastInsertRowid } = statement.run(...compiled.parameters);
    return {
      rows: [],
      numAffectedRows: BigInt(changes),
      insertId: BigInt(lastInsertRowid),
    };
  }

  /** SQLite reads a result set in one go here, so nothing streams and asking for it is a bug. */
  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('sqlite does not stream');
  }
}
