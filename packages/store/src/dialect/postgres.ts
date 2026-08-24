import { type Dialect, PostgresDialect as KyselyPostgres } from 'kysely';

/**
 * Postgres is optional: `pg` is imported only when a `postgres://` url is opened, so a SQLite
 * deployment installs no native module and a Workers build never bundles one.
 *
 * `bigint` arrives from `pg` as a string, because 64 bits do not fit a JS number in general.
 * Every bigint this schema holds is an epoch millisecond, which does fit, so the type parser is
 * told to hand back a number and instants decode the same way in both dialects.
 */
export namespace Postgres {
  /** `pg`'s oid for `int8`. */
  export const INT8 = 20;

  export async function dialect(url: string): Promise<Dialect> {
    const pg = await import('pg');
    pg.types.setTypeParser(INT8, Number);
    return new KyselyPostgres({ pool: new pg.Pool({ connectionString: url }) });
  }
}
