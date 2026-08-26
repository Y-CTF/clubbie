import { Millis } from './millis.ts';

/**
 * Wall-clock arithmetic in a named IANA zone, with no dependency.
 *
 * It exists because a repeating event is a wall clock, not an interval: a Tuesday meeting at 19:00
 * is at 19:00 in October and in November, and the two are 168 hours apart in one direction and 169
 * in the other. Adding 604800000 milliseconds gets that wrong twice a year, and the club finds out
 * by turning up an hour early.
 *
 * The runtime already carries the zone database, through `Intl`. What is missing from `Intl` is the
 * other direction: it turns an instant into wall-clock parts, and nothing turns parts back into an
 * instant. That is `instant`, and it is two passes because the offset it needs is the offset at the
 * answer rather than the offset at the guess.
 *
 * A zone of `null` means the runtime's own, which is what every caller gets until a club sets one.
 */
export namespace Zone {
  /** A wall clock reading. `month` is 1-12, like a person writes it and unlike `Date`. */
  export interface Parts {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    /**
     * Carried rather than formatted: `Intl` will not report milliseconds, and every zone offset
     * is a whole number of minutes, so the instant's own are the zone's too. They are here so a
     * round trip through this namespace gives back exactly what it was given: an occurrence that
     * lost its milliseconds would be a *different* row under the unique index on
     * `(scheduleId, startsAt)`, and a schedule stamped before and after would grow two of every
     * night.
     */
    readonly millis?: number;
  }

  /** Formatters are not cheap to build and a schedule builds one per occurrence without this. */
  const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

  /**
   * Get-or-build, over a caller's own map. It is exported because building an `Intl` formatter is
   * expensive wherever it happens: a broadcast built one per member, and every place that noticed
   * had written the same eight lines.
   */
  export function memo<T>(cache: Map<string, T>, key: string, make: () => T): T {
    const known = cache.get(key);
    if (known !== undefined) return known;

    const made = make();
    cache.set(key, made);
    return made;
  }

  const OPTIONS: Intl.DateTimeFormatOptions = {
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  };

  const SECOND = Millis.SECOND;

  function formatter(zone: string): Intl.DateTimeFormat {
    return memo(FORMATTERS, zone, () => new Intl.DateTimeFormat('en-US', { ...OPTIONS, timeZone: zone }));
  }

  /** Whether the runtime knows a zone, which is the only authority on the question worth asking. */
  export function valid(zone: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }

  /** What a clock in `zone` reads at an instant. */
  export function parts(at: Date, zone: string | null): Parts {
    if (zone === null) {
      return {
        year: at.getFullYear(),
        month: at.getMonth() + 1,
        day: at.getDate(),
        hour: at.getHours(),
        minute: at.getMinutes(),
        second: at.getSeconds(),
        millis: at.getMilliseconds(),
      };
    }

    const fields = new Map<string, number>();
    for (const part of formatter(zone).formatToParts(at)) {
      if (part.type !== 'literal') fields.set(part.type, Number(part.value));
    }

    return {
      year: fields.get('year') ?? 0,
      month: fields.get('month') ?? 1,
      day: fields.get('day') ?? 1,
      /** `h23` still writes midnight as `24` in some ICU versions, which is the same day's zero. */
      hour: (fields.get('hour') ?? 0) % 24,
      minute: fields.get('minute') ?? 0,
      second: fields.get('second') ?? 0,
      millis: at.getMilliseconds(),
    };
  }

  /**
   * The instant a clock in `zone` reads `at`. Out-of-range fields are normalised the way `Date`
   * normalises them, so `{ day: 35 }` is the fourth of the next month and callers can do calendar
   * arithmetic by addition.
   *
   * Two ambiguities have no right answer and both are resolved rather than thrown. An hour that
   * happens twice (the clocks go back) answers with the second of the two, the one on standard
   * time. An hour that never happens (the clocks go forward) comes out one gap later on the clock:
   * 02:30 reads back as 03:30. A club meeting is never scheduled inside either, and a defined
   * answer beats a refusal.
   */
  export function instant(at: Parts, zone: string | null): Date {
    const millis = at.millis ?? 0;
    if (zone === null) {
      return new Date(at.year, at.month - 1, at.day, at.hour, at.minute, at.second, millis);
    }

    const wall = Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute, at.second, millis);
    const guessed = wall - offset(new Date(wall), zone);
    /** The offset that matters is the one in force at the answer, which the first pass finds. */
    return new Date(wall - offset(new Date(guessed), zone));
  }

  /** How far ahead of UTC a zone is at an instant, in milliseconds. Negative west of Greenwich. */
  export function offset(at: Date, zone: string): number {
    const read = parts(at, zone);
    const wall = Date.UTC(read.year, read.month - 1, read.day, read.hour, read.minute, read.second);
    /** Both sides are compared at whole seconds: `Intl` reports no finer, and no zone differs by. */
    return wall - Math.floor(at.getTime() / SECOND) * SECOND;
  }

  /** The last day of a month, which is where a monthly rule anchored on the 31st lands in February. */
  export function last(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }
}
