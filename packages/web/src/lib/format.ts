import { Millis } from '@clubbie/core';
import { words } from './words/index.svelte.ts';

/**
 * How an instant is written on screen, in one place. The API sends ISO 8601 and the browser owns
 * the timezone, so a member always reads a date in their own, and no component builds one itself.
 *
 * The locale is the app's, not the browser's: a club that writes in German writes its dates in
 * German too, and a page with English dates under German prose is the tell that a translation was
 * done by halves. Reading it here is also what makes every date on screen re-render when the
 * language changes, because `words.language` is the reactive state behind it.
 *
 * Every formatter is built once and kept. `toLocaleDateString(tag, options)` looks harmless and
 * constructs an `Intl.DateTimeFormat` on each call, which is one of the more expensive things a
 * browser does; a month grid asks for well over a hundred dates on every render, and the current
 * time ticks that render once a minute. They are cached against the options object itself, which is
 * a module constant, and against the language, so choosing a new one starts a fresh set.
 */
export namespace Format {
  /**
   * What a trail detail's value reads as. The column holds whatever the act recorded, which is a
   * string, a number, a flag, or the before-and-after of a membership; none of those is worth its
   * JSON, and none of them is a sentence the catalogue could hold on its own.
   */
  export function detail(value: unknown): string {
    const t = words.t.common;
    if (value === null || value === undefined) return t.nothing;
    if (typeof value === 'object') return Object.values(value).join(` ${t.became} `);
    return String(value);
  }

  const DAY: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const FULL: Intl.DateTimeFormatOptions = { ...DAY, ...TIME, year: 'numeric' };
  /** The calendar's own labels: a column head, a grid title, a gutter, a day's heading. */
  const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'short' };
  const WEEKDAY_FULL: Intl.DateTimeFormatOptions = { weekday: 'long' };
  const MONTH: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
  const SPAN: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const HOUR: Intl.DateTimeFormatOptions = { hour: 'numeric' };
  const NUMBER: Intl.DateTimeFormatOptions = { day: 'numeric' };
  const DATE: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };

  /** One formatter per shape per language, kept for as long as the options object is. */
  const CACHE = new WeakMap<Intl.DateTimeFormatOptions, Map<string, Intl.DateTimeFormat>>();

  function shaped(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const tag = words.tag ?? '';
    const byTag = CACHE.get(options) ?? new Map<string, Intl.DateTimeFormat>();
    CACHE.set(options, byTag);

    const known = byTag.get(tag);
    if (known) return known;

    const made = new Intl.DateTimeFormat(words.tag, options);
    byTag.set(tag, made);
    return made;
  }

  export function day(iso: string): string {
    return shaped(DAY).format(new Date(iso));
  }

  export function time(iso: string): string {
    return shaped(TIME).format(new Date(iso));
  }

  export function full(iso: string): string {
    return shaped(FULL).format(new Date(iso));
  }

  /** The head of a column in the week grid: `Mon`, or the whole word where there is room for it. */
  export function weekday(at: Date, whole = false): string {
    return shaped(whole ? WEEKDAY_FULL : WEEKDAY).format(at);
  }

  /** What the grid is showing, over the arrows: `August 2026`. */
  export function month(at: Date): string {
    return shaped(MONTH).format(at);
  }

  /** The same for a stretch of days, in the reader's own word order: `24 Aug - 30 Aug 2026`. */
  export function between(from: Date, to: Date): string {
    return shaped(SPAN).formatRange(from, to);
  }

  /** The day of the month on its own, for a grid cell and for the spine of the list. */
  export function dayOfMonth(at: Date): string {
    return shaped(NUMBER).format(at);
  }

  /** One day, as the heading of a column or of a list: `Monday, 24 August`. */
  export function date(at: Date): string {
    return shaped(DATE).format(at);
  }

  /** A label in the hour gutter. `numeric` rather than `2-digit`, so a clock reads as a clock. */
  export function hour(at: Date): string {
    return shaped(HOUR).format(at);
  }

  /** The clock on an event: the instant as a `Date` rather than as the wire's string. */
  export function at(instant: Date): string {
    return shaped(TIME).format(instant);
  }

  /** How long something runs, as one phrase: `18:00 - 20:00`. */
  export function slot(from: Date, to: Date): string {
    return shaped(TIME).formatRange(from, to);
  }

  /** `YYYY-MM-DDTHH:MM`, which is exactly what a `datetime-local` input reads and writes. */
  const LOCAL = 16;

  /**
   * An instant as a form field holds it: the reader's own wall clock, with no zone on the end. The
   * conversion is here rather than in a component because both forms that write a date need it and
   * getting it wrong moves an event by an hour twice a year.
   */
  export function field(iso: string): string {
    const at = new Date(iso);
    return new Date(at.getTime() - at.getTimezoneOffset() * Millis.MINUTE).toISOString().slice(0, LOCAL);
  }

  /** How many characters a `YYYY-MM-DD` day is, which is what a url carries a date as. */
  const STAMP = 10;

  /**
   * A day as a url writes it, and reads it back: the reader's own wall clock, no zone, no time.
   *
   * It is here for the same reason `field` is. A calendar puts the day it is showing in its
   * address so a member can send somebody a link to it, and building that out of `toISOString`
   * hands somebody east of Greenwich a link to the day before.
   */
  export function stamp(at: Date): string {
    return field(at.toISOString()).slice(0, STAMP);
  }

  /** The day a stamp names, at midnight, local. Null for anything that is not one. */
  export function unstamp(value: string): Date | null {
    const at = new Date(`${value}T00:00`);
    return value.length === STAMP && !Number.isNaN(at.getTime()) ? at : null;
  }

  /** `in 3 days`, `2 hours ago`. What a deadline is worth reading as. */
  export function since(iso: string, now: Date = new Date()): string {
    const seconds = (new Date(iso).getTime() - now.getTime()) / 1000;
    const relative = relatively();

    for (const [unit, size] of UNITS) {
      if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
    }
    /** Under a minute is seconds. Rounding it up to "this minute" is how a code about to expire
     * told a member it expires this minute, which is both alarming and wrong. */
    return relative.format(Math.round(seconds), 'second');
  }

  /** The same again for the one relative formatter, which every deadline on a page asks for. */
  const RELATIVE: Intl.RelativeTimeFormatOptions = { numeric: 'auto' };
  const RELATIVES = new Map<string, Intl.RelativeTimeFormat>();

  function relatively(): Intl.RelativeTimeFormat {
    const tag = words.tag ?? '';
    const known = RELATIVES.get(tag);
    if (known) return known;

    const made = new Intl.RelativeTimeFormat(words.tag, RELATIVE);
    RELATIVES.set(tag, made);
    return made;
  }

  const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
}
