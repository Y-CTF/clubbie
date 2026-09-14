import { Event, type EventId, Millis, type Season } from '@clubbie/core';
import type { Store } from '@clubbie/store';

/**
 * What publishing an event owes people, expressed as jobs rather than as sends.
 *
 * Two are owed: an announcement now, and a reminder the day before it starts. Both are queued, so
 * the request that published the event returns immediately and a provider that is down costs a
 * retry rather than the publish.
 *
 * Nothing is queued twice: a job about an event is cancelled before new ones are queued, which is
 * what an event edited three times in a minute needs.
 */
export namespace Announce {
  /** An hour, since the club states its lead time in them. */
  export const HOUR = Millis.HOUR;

  /**
   * What a published event owes: the reminder always, the club-wide announcement only when the
   * member publishing it may speak to the club.
   *
   * The two are separated because they cost different things. A reminder reaches the people who
   * said they were coming to this event. An announcement writes to every active member on the
   * channel they chose, and cannot be unsent: `POST /events/:id/announce` is admin-only for that
   * reason, and publishing must not be a way around it. An ordinary member's event is published,
   * listed and answerable; what it does not do is put a message in everybody's chat.
   */
  export async function published(
    store: Store,
    event: Event,
    broadcast: boolean,
    now: Date = new Date(),
  ): Promise<void> {
    await withdrawn(store, event.id);
    if (!owed(event, now)) return;

    if (broadcast) await store.jobs.schedule('event.announce', { eventId: event.id }, now, now);
    await rescheduled(store, event, now);
  }

  /**
   * Re-arms the reminder alone, for an event whose date moved. A reminder still pointing at last
   * week's date is worse than none: it arrives at the wrong time and teaches members to ignore
   * the next one. Announcing again is a separate act, because the event itself is not new.
   */
  export async function rescheduled(store: Store, event: Event, now: Date = new Date()): Promise<void> {
    await store.jobs.cancel('event.remind', { eventId: event.id });
    if (!owed(event, now)) return;

    /** How long before is the club's, so a club that meets weekly can remind people on the day. */
    const remind = (await store.club.read()).reminds(event.startsAt);
    if (remind.getTime() > now.getTime()) {
      await store.jobs.schedule('event.remind', { eventId: event.id }, remind, now);
    }
  }

  /** How long before a renewal deadline the club asks. A week is time to act and not yet nagging. */
  export const NOTICE = 7 * 24 * HOUR;

  /**
   * What an open season owes the people who have not renewed into it: one message, before the day
   * they stop being able to do it themselves.
   *
   * It is queued rather than swept for, exactly like a reminder, and re-queued whenever the season
   * changes, so a committee that moves the deadline moves the message with it. A season with no
   * deadline owes nothing: it takes renewals for as long as it runs, and there is no moment worth
   * warning anybody about.
   */
  export async function renewals(store: Store, season: Season, now: Date = new Date()): Promise<void> {
    await store.jobs.cancel('season.renewal', { seasonId: season.id });
    if (!season.current || season.renewalAt === null) return;

    /**
     * A deadline already behind the club owes nothing: `Season.renewable` is `now <= renewalAt`,
     * so the message would name a door the member can no longer walk through. One that is closer
     * than the notice still owes it, and it goes out at once rather than at a moment in the past.
     */
    if (now.getTime() > season.renewalAt.getTime()) return;

    const warn = new Date(season.renewalAt.getTime() - NOTICE);

    await store.jobs.schedule('season.renewal', { seasonId: season.id }, warn > now ? warn : now, now);
  }

  /** Whether an event still owes anybody anything: a published one that has not happened yet. */
  function owed(event: Event, now: Date): boolean {
    return event.state === Event.LIVE && !event.past(now);
  }

  /**
   * Drops the announcement and the reminder an event still owed. Only those two: a promotion
   * notice a member is already owed for the same event is not this event's announcement, and
   * cancelling it would leave somebody holding a seat nobody ever told them about.
   */
  export async function withdrawn(store: Store, eventId: EventId): Promise<number> {
    const dropped = await Promise.all([
      store.jobs.cancel('event.announce', { eventId }),
      store.jobs.cancel('event.remind', { eventId }),
    ]);
    return dropped.reduce((total, count) => total + count, 0);
  }
}
