import { Millis } from '@clubbie/core';
import { Format } from '../format.ts';
import { words } from '../words/index.svelte.ts';

/**
 * The four ways of looking at a calendar. Each is a value in a url and a key in the catalogue, so
 * a view is chosen by name in one place and translated in another.
 */
export const View = {
  Month: 'month',
  Week: 'week',
  Day: 'day',
  /** The list. What a phone shows, and what a search answers with. */
  Agenda: 'agenda',
} as const;

export type View = (typeof View)[keyof typeof View];

export const VIEWS = Object.values(View) as readonly View[];

/** A stretch of days, half open: `from` is the first instant in it, `to` the first one after. */
export interface Span {
  readonly from: Date;
  readonly to: Date;
}

/**
 * Where the days of a calendar are, in the reader's own wall clock.
 *
 * Every step is calendar arithmetic rather than milliseconds, and that is the whole reason this
 * file exists: the Sunday a clock goes forward is 23 hours long, so "a week later" built out of
 * `7 * 86400000` lands an hour off and the grid draws Monday's evening in Sunday's column. Adding
 * to `setDate` asks the platform's own calendar instead, which knows.
 */
export namespace Grid {
  export const WEEK = 7;
  export const HOURS = 24;
  export const MINUTES = 60;
  export const MINUTE = Millis.MINUTE;
  export const HOUR = Millis.HOUR;
  /** Monday, in `Date.getDay` numbering, and what a locale that will not say falls back to. */
  export const MONDAY = 1;
  /** How many weeks a month grid may need: a 31-day month starting on the last day of a week. */
  export const ROWS = 6;
  /** How far the list reaches when it is the view rather than the answer to a search. */
  export const AGENDA = 60;

  /** Midnight on a day, optionally some days from it. The one way a day is stepped. */
  export function day(at: Date, by = 0): Date {
    const start = new Date(at);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + by);
    return start;
  }

  /** Whether two instants fall on the same day, which is what a grid asks about constantly. */
  export function same(a: Date, b: Date): boolean {
    return day(a).getTime() === day(b).getTime();
  }

  export function startOfWeek(at: Date, first: number = weekStart()): Date {
    const shift = (at.getDay() - first + WEEK) % WEEK;
    return day(at, -shift);
  }

  export function startOfMonth(at: Date): Date {
    return new Date(at.getFullYear(), at.getMonth(), 1);
  }

  /**
   * Which day a week begins on, as the reader's locale has it: Monday across most of Europe,
   * Sunday in North America, Saturday in much of the Arab world. `getWeekInfo` is the standard
   * spelling and `weekInfo` the one two engines shipped first, so both are asked; a runtime with
   * neither gets Monday, which is what this app's clubs run on.
   */
  export function weekStart(): number {
    const tag = words.tag;
    if (tag === undefined) return MONDAY;

    const known = FIRST.get(tag);
    if (known !== undefined) return known;

    const locale = new Intl.Locale(tag) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = locale.getWeekInfo?.() ?? locale.weekInfo;
    /** A locale counts Monday as 1 and Sunday as 7; `Date` counts Sunday as 0. */
    const first = info ? info.firstDay % WEEK : MONDAY;

    FIRST.set(tag, first);
    return first;
  }

  /**
   * Kept, because this is asked constantly: every span, every title and every column head goes
   * through it, and building an `Intl.Locale` to ask a fixed fact about a language is one of the
   * more expensive things on the page.
   */
  const FIRST = new Map<string, number>();

  /** The days a view draws, which for a month is the whole grid, leading and trailing days too. */
  export function span(view: View, cursor: Date): Span {
    switch (view) {
      case View.Month: {
        const from = startOfWeek(startOfMonth(cursor));
        return { from, to: day(from, rows(cursor) * WEEK) };
      }
      case View.Week: {
        const from = startOfWeek(cursor);
        return { from, to: day(from, WEEK) };
      }
      case View.Day: {
        const from = day(cursor);
        return { from, to: day(from, 1) };
      }
      case View.Agenda: {
        const from = day(cursor);
        return { from, to: day(from, AGENDA) };
      }
    }
  }

  /** How many weeks the month around a day needs. Five for most, six when it spills. */
  export function rows(cursor: Date): number {
    const first = startOfMonth(cursor);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const lead = (first.getDay() - weekStart() + WEEK) % WEEK;
    return Math.min(ROWS, Math.ceil((lead + last.getDate()) / WEEK));
  }

  /** Every day in a span, in order. What a grid iterates and what a list groups by. */
  export function days({ from, to }: Span): Date[] {
    const out: Date[] = [];
    for (let at = day(from); at < to; at = day(at, 1)) out.push(at);
    return out;
  }

  /** The next thing to look at: the next month, the next week, tomorrow, the next stretch. */
  export function step(view: View, cursor: Date, by: number): Date {
    switch (view) {
      /** By month rather than by 30 days, from the first, so stepping past a short month returns. */
      case View.Month:
        return new Date(cursor.getFullYear(), cursor.getMonth() + by, 1);
      case View.Week:
        return day(cursor, WEEK * by);
      case View.Day:
        return day(cursor, by);
      case View.Agenda:
        return day(cursor, AGENDA * by);
    }
  }

  /** What the reader is looking at, said in one phrase over the arrows. */
  export function title(view: View, cursor: Date): string {
    const { from, to } = span(view, cursor);
    switch (view) {
      case View.Month:
        return Format.month(cursor);
      case View.Day:
        return Format.date(cursor);
      case View.Week:
      case View.Agenda:
        return Format.between(from, day(to, -1));
    }
  }

  /**
   * How far down a day's column an instant sits, as a fraction, clamped to the day it is measured
   * against so an evening running past midnight stops at the bottom rather than below it.
   *
   * It reads the wall clock rather than elapsed milliseconds on purpose. Twice a year a day is 23
   * or 25 hours long, and a column measured in elapsed time puts 18:00 a row away from the line
   * labelled 18:00. Every calendar draws that day as 24 equal rows, and so does this.
   */
  export function fraction(at: Date, on: Date): number {
    const start = day(on);
    if (at <= start) return 0;
    if (at >= day(start, 1)) return 1;
    return (at.getHours() * MINUTES + at.getMinutes()) / (HOURS * MINUTES);
  }

  /** Every hour of a day, for the gutter and the lines it draws. Built as wall clock, like the rest. */
  export function hours(on: Date): Date[] {
    const start = day(on);
    return Array.from(
      { length: HOURS },
      (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate(), index),
    );
  }
}
