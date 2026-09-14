import { type Club, Event, type EventId, Recur, Schedule } from '@clubbie/core';
import type { Logger } from '@clubbie/log';
import type { Store } from '@clubbie/store';
import { Announce } from './announce.ts';

/**
 * Turns a schedule into events.
 *
 * Occurrences are materialised rather than computed on the fly, because an answer belongs to one
 * night rather than to a rule, and because cancelling next Tuesday must not touch the Tuesday
 * after it. A schedule is topped up ahead of time and never retroactively: an occurrence that has
 * already happened is history and is left exactly as it was recorded.
 *
 * The window is found by walking forward from now rather than by enumerating from the first
 * occurrence, so a weekly meeting in its ninth year keeps producing nights: enumerating would run
 * into `Recur.LIMIT` and stop, silently, with no log line to say a club had stopped meeting.
 *
 * The wall clock the rule steps in is the club's own zone, read here because this is the one place
 * a schedule turns into dates. A club with no zone set steps in the runtime's, which is what a
 * deployment that sets `TZ` has always got.
 */
export namespace Expand {
  export interface Result {
    readonly created: EventId[];
    readonly skipped: number;
  }

  export interface Reconciled extends Result {
    /** Nights the rule no longer asks for, which are the only ones an edit is allowed to destroy. */
    readonly dropped: number;
  }

  /**
   * Makes the nights on the calendar agree with the rule, and answers what that cost.
   *
   * The difference between this and `run` is the whole of editing a schedule safely. `run` only
   * ever adds; this also drops the nights the rule has stopped asking for, and it drops *only*
   * those. A rule that gained a fortnight on the end, or whose occurrences got half an hour
   * longer, produces exactly the dates it produced before, so every answer on them survives.
   * Deleting the term and stamping it again would have been correct for none of those edits.
   */
  export async function reconcile(
    store: Store,
    schedule: Schedule,
    log: Logger,
    club: Club,
    now: Date = new Date(),
    ahead: number = Schedule.AHEAD,
  ): Promise<Reconciled> {
    const wanted = Expand.window(schedule, now, ahead, club.timezone);

    const gone = await store.events.reconcile(schedule.id, now, wanted);
    if (gone.length > 0) log.warn('occurrences dropped', { schedule: schedule.id, dropped: gone.length });

    /**
     * The work owed about a night goes with the night. Nothing breaks if it does not (every
     * handler no-ops on an event that has been deleted), but a club that reshapes a schedule twice
     * a term would otherwise carry a growing pile of jobs about evenings that never happened.
     */
    for (const eventId of gone) await Announce.withdrawn(store, eventId);

    return { ...(await Expand.run(store, schedule, log, club, now, ahead)), dropped: gone.length };
  }

  /**
   * The club is passed in rather than read here. A request that creates or edits a schedule used
   * to read the one singleton row up to four times, and could in principle have stretched a term
   * against one zone and reconciled it against another.
   *
   * It is the whole club rather than only its zone because a stamped night owes the club's
   * answering deadline too. It never asked for one, so a club that closed answers a day ahead had
   * that apply to events somebody typed and not to its weekly training.
   */
  export async function run(
    store: Store,
    schedule: Schedule,
    log: Logger,
    club: Club,
    now: Date = new Date(),
    ahead: number = Schedule.AHEAD,
  ): Promise<Result> {
    const wanted = Expand.window(schedule, now, ahead, club.timezone);

    const created: EventId[] = [];
    let skipped = 0;

    for (const startsAt of wanted) {
      const event = await store.events.stamp(
        {
          title: schedule.title,
          description: schedule.description,
          kind: schedule.kind,
          state: Event.LIVE,
          startsAt,
          endsAt: schedule.ends(startsAt),
          closesAt: club.closes(startsAt),
          location: schedule.location,
          capacity: schedule.capacity,
          seasonId: schedule.seasonId,
          scheduleId: schedule.id,
          listed: schedule.listed,
        },
        schedule.createdBy,
        now,
      );

      /** The night already existed, which is what a top-up run twice is supposed to find. */
      if (!event) {
        skipped++;
        continue;
      }
      created.push(event.id);

      /**
       * A reminder, but no announcement: a weekly meeting was announced once, when the schedule
       * was made, and forty "the weekly meeting is on" messages is how a club loses its audience.
       */
      await Announce.rescheduled(store, event, now);
    }

    if (created.length > 0) {
      log.info('schedule expanded', { schedule: schedule.id, created: created.length, skipped });
    }
    return { created, skipped };
  }

  /**
   * The next `ahead` occurrences from now, walked forward one at a time rather than enumerated.
   * The first occurrence needs no special case: it is itself the first one after any instant
   * before it.
   */
  export function window(schedule: Schedule, now: Date, ahead: number, zone: string | null = null): Date[] {
    const out: Date[] = [];
    let at = new Date(now.getTime() - Recur.EVERY);

    for (let step = 0; step < ahead; step++) {
      const next: Date | null = schedule.recur.after(schedule.startsAt, at, zone);
      if (!next) break;
      out.push(next);
      at = next;
    }
    return out;
  }
}
