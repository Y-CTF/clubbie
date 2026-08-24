import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';
import { sql } from 'kysely';

/**
 * Substring search that means the same thing in both dialects.
 *
 * Several things differ between SQLite and Postgres here and all of them bite. `like` folds case
 * in SQLite and does not in Postgres, so a comparison is never written against `like` alone.
 * `ilike` exists only in Postgres. A backslash is the default escape character in a Postgres
 * `like` and an ordinary character in SQLite's, so the escape character is always named.
 *
 * And the one that decided the shape of this file: `lower()` in SQLite folds `A-Z` and nothing
 * else, while `lower()` in Postgres folds every letter Unicode knows about. A club whose members
 * are called Émile, Ölberg or Ärzte could therefore find them on Postgres and not on SQLite, and
 * SQLite is the default deployment. Since SQLite has no way to add a folding function and no
 * `ilike`, the pattern itself carries the case: `glob` does support character classes, so each
 * letter is asked for as "either of its two cases" and the comparison stops depending on what the
 * engine thinks a letter is.
 *
 * Control characters are dropped rather than escaped, because they are not a matching problem: a
 * NUL truncates the pattern at the C boundary in SQLite (so `%\0%` searches for `%` and matches
 * everybody) and is rejected outright by the Postgres protocol as an invalid byte. Neither is
 * something a person typed on purpose.
 *
 * It is a scan, and it is meant to be: a club has hundreds of members and hundreds of events, and
 * an index that fits that is an index nobody has to maintain. If a deployment ever outgrows it,
 * this is the one file that changes.
 */
export class Search {
  /** Named explicitly on every `like`, because the dialects disagree about the default. */
  static readonly ESCAPE = '!';
  /** What a caller may type before it is a `like` pattern rather than a word. */
  private static readonly SPECIAL = /[!%_]/g;
  /** The same for a glob, where `]` is handled by putting it first inside its own class. */
  private static readonly GLOBBED = new Set(['*', '?', '[', ']']);
  /** Anything a keyboard does not produce and a comparison cannot survive. */
  private static readonly CONTROL = /\p{Cc}/gu;
  /** Long enough for the longest thing anybody types, short of what an engine refuses. */
  static readonly LONGEST = 200;

  private constructor(private readonly classes: boolean) {}

  /** SQLite, where `lower()` is ASCII-only and the pattern has to fold the case itself. */
  static readonly ASCII = new Search(true);
  /** Postgres, where `lower()` folds everything and a plain `like` is enough. */
  static readonly UNICODE = new Search(false);

  /** Whether any of `columns` contains `text`, case-insensitively. A null column never matches. */
  any<Db, Tb extends keyof Db>(
    eb: ExpressionBuilder<Db, Tb>,
    columns: readonly Parameters<ExpressionBuilder<Db, Tb>['ref']>[0][],
    text: string,
  ): Expression<SqlBool> {
    const clauses = this.classes
      ? columns.map((column) => Search.globbed(eb, column, Search.glob(text)))
      : columns.map((column) => Search.liked(eb, column, Search.pattern(text)));
    return eb.or(clauses);
  }

  private static liked<Db, Tb extends keyof Db>(
    eb: ExpressionBuilder<Db, Tb>,
    column: Parameters<ExpressionBuilder<Db, Tb>['ref']>[0],
    wanted: string,
  ): Expression<SqlBool> {
    return sql<SqlBool>`lower(${eb.ref(column)}) like ${wanted} escape ${sql.lit(Search.ESCAPE)}`;
  }

  private static globbed<Db, Tb extends keyof Db>(
    eb: ExpressionBuilder<Db, Tb>,
    column: Parameters<ExpressionBuilder<Db, Tb>['ref']>[0],
    wanted: string,
  ): Expression<SqlBool> {
    return sql<SqlBool>`${eb.ref(column)} glob ${wanted}`;
  }

  /** What a caller typed, with everything that is not a word taken out of it. */
  private static clean(text: string): string {
    return text.replace(Search.CONTROL, '').slice(0, Search.LONGEST);
  }

  /** A typed word as a `like` pattern: the wildcards in it are the ones this adds. */
  static pattern(text: string): string {
    const clean = Search.clean(text).toLowerCase();
    return `%${clean.replace(Search.SPECIAL, (char) => Search.ESCAPE + char)}%`;
  }

  /**
   * The same word as a glob, with each letter written as the class of its two cases.
   *
   * `émile` becomes `*[Éé][Mm][Ii][Ll][Ee]*`, which matches `Émile Zola` and `ÉMILE` and asks
   * nothing of the engine's idea of case. A character with only one case is written as itself,
   * and the four characters a glob reserves are written as a class holding themselves.
   */
  static glob(text: string): string {
    const body = [...Search.clean(text)]
      .map((char) => {
        if (Search.GLOBBED.has(char)) return char === ']' ? '[]]' : `[${char}]`;

        const lower = char.toLowerCase();
        const upper = char.toUpperCase();
        /** A case pair is only a pair when both sides are one character: `ß` uppercases to `SS`. */
        return lower === upper || lower.length !== upper.length ? char : `[${upper}${lower}]`;
      })
      .join('');
    return `*${body}*`;
  }
}
