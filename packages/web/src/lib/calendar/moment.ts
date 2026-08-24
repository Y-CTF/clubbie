import { Event } from '@clubbie/core';
import type { InferResponseType } from 'hono/client';
import type { api } from '../api.ts';
import { Hues } from '../hues.ts';
import { Grid } from './grid.ts';

/** One event as the listing sends it. The API's own shape, never a second declaration of it. */
export type Listed = InferResponseType<typeof api.events.$get>[number];

/**
 * What a moment actually needs of an event: when it is, what it is called, and what it is.
 *
 * It is narrower than a listing row on purpose. The event page holds a fuller answer than the
 * listing does, and it wants the same two parsed instants and the same "add this to my calendar"
 * links, without either of them being written a second time.
 */
export type Dated = Pick<
  Listed,
  'id' | 'title' | 'description' | 'kind' | 'state' | 'location' | 'startsAt' | 'endsAt'
>;

/**
 * One event as a calendar has to think about it: two instants rather than one, and the days it
 * touches.
 *
 * The wire carries strings and a nullable end, which is right for a listing and useless for a
 * grid: every component would parse the same two dates again, and each would decide for itself
 * how long an event with no end lasts. It is decided here, once.
 */
export class Moment<T extends Dated = Listed> {
  /** How long an event that never said when it finishes occupies a column. */
  static readonly DEFAULT = Grid.HOUR;

  readonly event: T;
  readonly startsAt: Date;
  readonly endsAt: Date;

  constructor(event: T) {
    this.event = event;
    this.startsAt = new Date(event.startsAt);

    /**
     * An event with no end is an hour long, and never longer than the day it starts on: a meeting
     * typed in for half past eleven at night would otherwise be drawn as a two-day band across the
     * grid, which is not what anybody meant by leaving the field empty.
     */
    const ends = event.endsAt ? new Date(event.endsAt) : new Date(this.startsAt.getTime() + Moment.DEFAULT);
    const midnight = Grid.day(this.startsAt, 1);
    this.endsAt = event.endsAt ? ends : new Date(Math.min(ends.getTime(), midnight.getTime()));
  }

  get id(): string {
    return this.event.id;
  }

  get title(): string {
    return this.event.title;
  }

  get description(): string | null {
    return this.event.description;
  }

  get location(): string | null {
    return this.event.location;
  }

  get cancelled(): boolean {
    return this.event.state === Event.CANCELLED;
  }

  get draft(): boolean {
    return this.event.state === Event.INITIAL;
  }

  /** The first day it appears on. */
  get first(): Date {
    return Grid.day(this.startsAt);
  }

  /**
   * The last day it appears on. An event finishing exactly at midnight belongs to the day it was
   * held on, not to the one that had just begun, which is why this steps back a millisecond.
   */
  get last(): Date {
    return Grid.day(new Date(Math.max(this.startsAt.getTime(), this.endsAt.getTime() - 1)));
  }

  /** Whether it crosses a midnight, which is what makes it a band rather than a block. */
  get spanning(): boolean {
    return this.last.getTime() > this.first.getTime();
  }

  covers(day: Date): boolean {
    const at = Grid.day(day).getTime();
    return at >= this.first.getTime() && at <= this.last.getTime();
  }

  /** Whether it has finished, against a clock the page is holding. */
  over(now: Date): boolean {
    return this.endsAt.getTime() < now.getTime();
  }

  /** Whether it is happening as the page is being looked at. */
  live(now: Date): boolean {
    return this.startsAt <= now && now < this.endsAt;
  }

  /** The colour it is drawn in, which is its kind's. */
  get tint(): string {
    return Hues.of(this.event.kind);
  }

  /** Earliest first, and the longer of two that start together above the shorter. */
  static order(a: Moment<Dated>, b: Moment<Dated>): number {
    return a.startsAt.getTime() - b.startsAt.getTime() || b.endsAt.getTime() - a.endsAt.getTime();
  }
}
