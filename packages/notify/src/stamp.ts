import { type Club, type Language, Locale } from '@clubbie/core';

/**
 * How a notice writes an instant: on the club's clock, in the club's language.
 *
 * `When` in `term` writes the stable, sortable shape a log line and a calendar file want, and that
 * is what every notice used to arrive as. `2026-08-27 10:34` is a field in a table, not a sentence
 * somebody reads on a phone, and it does not say which day of the week that is.
 *
 * The zone is the club's for the same reason the words are: a message is read by somebody standing
 * in one place, and a Zurich club whose reminder said 17:00 for a 19:00 meeting is wrong twice
 * over. `Zone` turns an instant into parts for arithmetic; this turns one into prose, which is the
 * one thing `Intl` is actually good at.
 */
export namespace Stamp {
  /**
   * `Thursday, 27 August, 18:00`. One shape, because a range is the same shape formatted twice:
   * `formatRange` drops what both ends share, so an evening reads `18:00 - 20:00` and an event
   * that runs past midnight writes the second day out in full.
   */
  export const SHAPE: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };

  /** What separates a formatter from the language and the zone it was built for. */
  export const KEY = '|';

  /** Building an `Intl.DateTimeFormat` is expensive, and a broadcast would build one per member. */
  const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

  function shaped(club: Club): Intl.DateTimeFormat {
    const tag: Language = club.locale ?? Locale.DEFAULT;
    const zone = club.timezone;
    const key = [tag, zone ?? ''].join(KEY);

    const known = FORMATTERS.get(key);
    if (known) return known;

    const made = new Intl.DateTimeFormat(tag, {
      ...SHAPE,
      ...(zone === null ? {} : { timeZone: zone }),
    });
    FORMATTERS.set(key, made);
    return made;
  }

  /** One instant, written out. */
  export function at(instant: Date, club: Club): string {
    return shaped(club).format(instant);
  }

  /** When something happens, and until when if it says so. */
  export function when(from: Date, to: Date | null, club: Club): string {
    const format = shaped(club);
    return to === null ? format.format(from) : format.formatRange(from, to);
  }
}
