import type { KindId } from '@clubbie/core';
import { api, unwrap } from '../api.ts';
import { Format } from '../format.ts';
import { Query } from '../query.svelte.ts';
import { Router } from '../router.svelte.ts';
import { Typed } from '../typed.svelte.ts';
import { Grid, type Span, View } from './grid.ts';
import { type Listed, Moment } from './moment.ts';

/** One window's answer, as it is remembered: when it arrived, and what it was. */
interface Answer {
  readonly at: number;
  readonly listing: Listed[];
  /** The answer serialised, so an identical refresh can be recognised and thrown away. */
  readonly shape: string;
}

/**
 * What this browser has already been told about a window, for as long as the tab is open.
 *
 * It is a module and not a field, because what the server said about March is true for the tab and
 * not for one visit to the calendar page. Held on the instance, it was thrown away every time the
 * member walked to the members page and back, and every one of those visits asked again for a month
 * it had already been given.
 */
const WINDOWS = new Map<string, Answer>();

/** What the address bar carries, so a member can send somebody the week they are talking about. */
export const Param = {
  View: 'view',
  At: 'at',
  Kind: 'kind',
  Find: 'q',
} as const;

/**
 * The calendar page, as state.
 *
 * Everything the grid draws is derived from four things: which view, which day it is centred on,
 * what is being filtered, and what has arrived from the server for that window. Keeping them here
 * rather than in the component is what lets the month, the week, the day and the list be four
 * renderings of one thing instead of four pages that each fetch for themselves.
 *
 * The window is the unit of loading. A month asks for its own six weeks, a week for its seven
 * days, and stepping to the next one asks again: a calendar that loaded "the next fifty events"
 * would draw an empty March for a club that meets twice a week.
 */
export class Calendar {
  /** How often the red line and the "now" highlight move. A minute is as fine as anybody reads. */
  static readonly TICK = 60_000;
  /** Which key shows which view, the way every calendar on the web binds them. */
  static readonly KEYS: Readonly<Record<string, View>> = {
    m: View.Month,
    w: View.Week,
    d: View.Day,
    a: View.Agenda,
  };
  /** The keys that step, and which way. Both spellings, because both are muscle memory. */
  static readonly STEPS: Readonly<Record<string, number>> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    k: -1,
    j: 1,
    p: -1,
    n: 1,
  };
  static readonly TODAY = 't';
  static readonly FIND = '/';
  static readonly CREATE = 'c';
  static readonly CLOSE = 'Escape';
  /** Where the keyboard belongs to whatever is being typed in rather than to the calendar. */
  static readonly TYPING = ['INPUT', 'TEXTAREA', 'SELECT'];
  /** Where a day column is scrolled to when it opens: early enough to see the morning. */
  static readonly WAKING = 7;

  view = $state<View>(View.Month);
  cursor = $state<Date>(Grid.day(new Date()));
  kind = $state<KindId | ''>('');
  /** The clock the current-time line and the "happening now" mark are drawn from. */
  now = $state<Date>(new Date());

  readonly typed = new Typed();
  readonly query = new Query<Listed[]>(() => this.read());

  /** The event a member has opened, and the control they opened it from, for the popover. */
  peeked = $state<Moment | null>(null);
  anchor = $state<DOMRect | null>(null);

  constructor(query: Readonly<Record<string, string>> = {}) {
    this.follow(query);
  }

  /** Picks up a view and a day from the address, for a link somebody was sent. */
  follow(query: Readonly<Record<string, string>>): void {
    const view = query[Param.View];
    if (view && Calendar.is(view)) this.view = view;

    const at = query[Param.At];
    const day = at ? Format.unstamp(at) : null;
    if (day) this.cursor = day;

    const kind = query[Param.Kind];
    if (kind) this.kind = kind as KindId;

    const find = query[Param.Find];
    if (find) this.typed.set(find);
  }

  /**
   * What is being looked at, as the address writes it down. The page hands it to the router without
   * an entry in the history: the back button belongs to the pages a member visited, not to the six
   * months they stepped through on one of them.
   */
  get address(): Record<string, string> {
    return {
      [Param.View]: this.view,
      [Param.At]: Format.stamp(this.cursor),
      ...(this.kind && { [Param.Kind]: this.kind }),
      ...(this.typed.settled && { [Param.Find]: this.typed.settled }),
    };
  }

  /** The key that shows a view, for the hint on the button that also shows it. */
  static shortcut(view: View): string {
    return Object.keys(Calendar.KEYS).find((key) => Calendar.KEYS[key] === view) ?? '';
  }

  static is(value: string): value is View {
    return Object.values(View).some((view) => view === value);
  }

  /** A search reaches past the window on purpose: what somebody types a word to find has usually
   * already happened, and a grid of one month is the wrong place to answer it from. */
  get searching(): boolean {
    return this.typed.settled !== '';
  }

  get span(): Span {
    return Grid.span(this.view, this.cursor);
  }

  get days(): Date[] {
    return Grid.days(this.span);
  }

  get title(): string {
    return Grid.title(this.view, this.cursor);
  }

  /**
   * Every event the window answered with, parsed once, earliest first.
   *
   * A `$derived` rather than a getter, and that is not a detail: a month grid asks what is on each
   * of forty two days, and as a getter every one of those questions parsed and sorted the whole
   * month again. Forty two sorts per render, on a render that ticks once a minute.
   */
  readonly moments: Moment[] = $derived(
    (this.query.data ?? []).map((event) => new Moment(event)).sort(Moment.order),
  );

  /**
   * What is on each day, by the day it is on, built once when the answer changes.
   *
   * A moment goes into every day it covers, which is what makes a weekend away appear on both of
   * them. Keyed by the instant of local midnight, because that is a number and a `Date` is not.
   */
  private readonly agenda: Map<number, Moment[]> = $derived.by(() => {
    const out = new Map<number, Moment[]>();
    for (const moment of this.moments) {
      for (let day = moment.first; day <= moment.last; day = Grid.day(day, 1)) {
        const on = out.get(day.getTime());
        if (on) on.push(moment);
        else out.set(day.getTime(), [moment]);
      }
    }
    return out;
  });

  /** What is on one day, bands included, which is what a cell and a list column both want. */
  on(day: Date): Moment[] {
    return this.agenda.get(Grid.day(day).getTime()) ?? [];
  }

  /** The days of the list view that have anything on them. An empty Tuesday is not a heading. */
  get listed(): Date[] {
    return this.days.filter((day) => this.agenda.has(day.getTime()));
  }

  /** Whether today is one of the days on screen, which is what greys out the "today" button. */
  get current(): boolean {
    return this.days.some((day) => Grid.same(day, this.now));
  }

  /** Everything the answer depends on, as one string, for the effect that reloads it. */
  get key(): string {
    const { from, to } = this.span;
    return [this.searching ? this.typed.settled : '', from.getTime(), to.getTime(), this.kind].join('/');
  }

  /**
   * Loads the window, from memory when this one has been seen recently enough and from the server
   * otherwise.
   *
   * Stepping through a term is the thing a member does most on this page, and the naive version of
   * this asked the server on every press. Answering from memory and refreshing behind it was not
   * enough: going back and forth still meant a request per press and, worse, a second render per
   * press when the identical answer came back as a new array and every event on the grid was
   * rebuilt from it. So a window seen within `FRESH` is simply reused, and an answer equal to the
   * one already held is handed back as the same array, which is a change to nothing and redraws
   * nothing.
   *
   * The key is passed in rather than read here, and that is not decoration. This is called from an
   * effect, and reading `query.data` inside one makes the effect depend on the answer it is about
   * to write: the load finished, the data changed, the effect ran again, and the page asked the
   * server for the same window until somebody closed the tab.
   */
  async load(key: string, now: number = Date.now()): Promise<void> {
    const cached = WINDOWS.get(key);

    if (cached) {
      /** `put` rather than `patch`: there may be nothing on screen yet to patch, after a reload. */
      this.query.put(cached.listing);
      /** Recent enough to trust. A club's month does not change while somebody pages past it. */
      if (now - cached.at < Calendar.FRESH) return;
    }

    /**
     * One question is asked once, however many times the page asks it. Everything above already
     * makes that true for a window that has been answered; this makes it true for the one that is
     * still on its way, so a page that re-renders while a request is in flight waits for it rather
     * than starting a second.
     */
    if (this.asking === key) return;
    this.asking = key;

    try {
      await this.query.load();
    } finally {
      if (this.asking === key) this.asking = null;
    }
  }

  /** The window a request is out for, or null when none is. */
  private asking: string | null = null;

  /** How many windows are worth keeping. A term of weeks, or two years of months. */
  static readonly MEMORY = 24;
  /**
   * How long an answer is taken at its word. Half a minute is longer than a member spends stepping
   * through a term and shorter than anybody's patience for a stale seat count.
   */
  static readonly FRESH = 30_000;

  /**
   * Keeps the newest answers and forgets the oldest, which is the order a `Map` already holds, and
   * answers with the array to actually use.
   *
   * An answer identical to the one already held keeps the array it already had. That is the whole
   * point: assigning an equal-but-new array is a state change to Svelte, and a state change here
   * re-parses every event on the grid and redraws every cell for no difference at all.
   */
  private keep(key: string, listing: Listed[], now: number): Listed[] {
    const shape = JSON.stringify(listing);
    const held = WINDOWS.get(key);
    const kept = held?.shape === shape ? held.listing : listing;

    WINDOWS.delete(key);
    WINDOWS.set(key, { at: now, listing: kept, shape });

    for (const stale of [...WINDOWS.keys()].slice(0, WINDOWS.size - Calendar.MEMORY)) {
      WINDOWS.delete(stale);
    }
    return kept;
  }

  private async read(): Promise<Listed[]> {
    const { from, to } = this.span;
    const key = this.key;

    const listing = await unwrap(
      await api.events.$get({
        query: {
          ...(this.kind && { kind: this.kind }),
          ...(this.searching
            ? { scope: 'all' as const, q: this.typed.settled }
            : { from: from.toISOString(), to: to.toISOString() }),
        },
      }),
    );

    return this.keep(key, listing, Date.now());
  }

  show(view: View): void {
    this.view = view;
    this.close();
  }

  step(by: number): void {
    this.cursor = Grid.step(this.view, this.cursor, by);
    this.close();
  }

  /** Back to today, in whichever view is open. */
  today(): void {
    this.cursor = Grid.day(new Date());
    this.close();
  }

  /**
   * The keyboard, declared once and dispatched here rather than in the markup.
   *
   * The two shortcuts that leave the calendar are handed in: focusing the search box and opening
   * the compose form are the page's business, and this class holds no references to either. A
   * member already typing keeps every letter, which is why the first thing it does is get out of
   * the way of a field.
   */
  press(event: KeyboardEvent, find: () => void, create: () => void): void {
    const target = event.target as HTMLElement | null;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (target && (Calendar.TYPING.includes(target.tagName) || target.isContentEditable)) {
      if (event.key === Calendar.CLOSE) target.blur();
      return;
    }

    const view = Calendar.KEYS[event.key];
    const step = Calendar.STEPS[event.key];

    if (view) this.show(view);
    else if (step) this.step(step);
    else if (event.key === Calendar.TODAY) this.today();
    else if (event.key === Calendar.CLOSE) this.close();
    else if (event.key === Calendar.FIND) find();
    else if (event.key === Calendar.CREATE) create();
    else return;

    event.preventDefault();
  }

  /** Opening a day from the month grid, which is what clicking its number does. */
  open(day: Date, view: View = View.Day): void {
    this.cursor = Grid.day(day);
    this.show(view);
  }

  peek(moment: Moment, anchor: DOMRect): void {
    this.peeked = moment;
    this.anchor = anchor;
  }

  close(): void {
    this.peeked = null;
    this.anchor = null;
  }

  /** The instant a click on an empty part of the grid means, for the form it opens. */
  static slot(day: Date, hour: number): Date {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
  }

  /** Where "new event" goes, with the slot filled in when the click named one. */
  static compose(at: Date | null = null): string {
    return Router.to('Compose', {}, at ? { [Param.At]: Format.field(at.toISOString()) } : {});
  }
}
