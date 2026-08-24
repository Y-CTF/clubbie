/**
 * How an instant is written for a person, on a terminal or in a chat message. Both renderings are
 * slices of the same ISO string, and both used to be written at their call sites with a magic
 * offset; there is one owner now, and the offsets are named.
 *
 * A browser formats dates in the reader's own locale instead (`Format` in the web package): these
 * two are for output that is read as a log or a listing, where a stable, sortable shape wins.
 */
export namespace When {
  /** `2026-08-24T21:14:07.031Z`, sliced. */
  export const DATE = { start: 0, end: 10 } as const;
  export const CLOCK = { start: 11, end: 19 } as const;
  export const STAMP = { start: 0, end: 16 } as const;
  export const SEP = ' ';

  export function clock(date: Date): string {
    return date.toISOString().slice(CLOCK.start, CLOCK.end);
  }

  export function date(instant: Date): string {
    return instant.toISOString().slice(DATE.start, DATE.end);
  }

  /**
   * The basic ISO 8601 form, in UTC and with every separator dropped: `20260301T120000Z`. It is
   * what a calendar file and a filename want, and slicing an ISO string at a call site to get it
   * is exactly what this module exists to stop.
   */
  export function basic(instant: Date): string {
    return `${instant.toISOString().replaceAll('-', '').replaceAll(':', '').split('.')[0]}Z`;
  }

  /**
   * `2026-08-24 21:14`: a date and a time, with the `T` traded for a space.
   *
   * It is UTC, because this module has no zone database and no business acquiring one. Anything
   * written to a person who is somewhere in particular formats the parts itself and passes them
   * in: see `Notices`, which reads the club's own zone.
   */
  export function stamp(instant: Date): string {
    return instant.toISOString().slice(STAMP.start, STAMP.end).replace('T', SEP);
  }

  /** The same shape, from wall-clock parts somebody else has already worked out. */
  export function wall(parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  }): string {
    const pad = (value: number, width = 2) => String(value).padStart(width, '0');
    const date = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
    return `${date}${SEP}${pad(parts.hour)}:${pad(parts.minute)}`;
  }
}
