import { Expand } from '@clubbie/api';
import {
  Event,
  type EventId,
  type KindId,
  Member,
  type MemberId,
  Recur,
  Rsvp,
  Schedule,
  type Season,
} from '@clubbie/core';
import type { Logger } from '@clubbie/log';
import type { EventDraft, Store } from '@clubbie/store';

/**
 * Development data: a season, a handful of members, a few events with answers. It exists so the
 * SPA has something to render before a single OAuth provider is configured, and it refuses to run
 * against a database that already holds members, so it can never overwrite a real club.
 */
export namespace Seed {
  export const NAMES = ['Ada', 'Alan', 'Grace', 'Edsger', 'Barbara', 'Ken'];
  export const HOUR = 60 * 60 * 1000;
  export const DAY = 24 * HOUR;

  /** The first four are admitted; the rest stay pending, so the roster page shows both. */
  export const ADMITTED = 4;
  /** Every third member skips an event, and every second one only says maybe. */
  export const SKIP = 3;
  export const MAYBE = 2;
  export const LENGTH = 2 * HOUR;
  export const WEEK = 7 * DAY;
  /** How many training nights the seeded schedule runs for: a term, roughly. */
  export const WEEKS = 10;
  /** Where the seeded season sits around today: a month behind, a school year ahead. */
  export const OPENED = 30;
  export const CLOSES = 300;
  export const RENEWS = 60;
  export const PROVIDER = 'seed';
  export const PLACE = 'Room A09';

  /** A club with a name, so the seeded app does not introduce itself as the software. */
  export const CLUB = {
    name: 'Polytech CTF',
    tagline: 'we break things on wednesdays',
    listed: true,
  } as const;

  /** Days either side of today, so a seeded listing has both a past and a future. */
  const EVENTS: readonly (Omit<EventDraft, 'startsAt'> & { days: number })[] = [
    { title: 'Weekly meeting', kind: 'meeting' as KindId, days: 2, capacity: null },
    { title: 'Intro to binary exploitation', kind: 'workshop' as KindId, days: 7, capacity: 12 },
    { title: 'Insomni’hack teaser', kind: 'competition' as KindId, days: 21, capacity: null },
    { title: 'Pizza and CTF writeups', kind: 'social' as KindId, days: -5, capacity: null },
  ];

  export async function run(store: Store, log: Logger, now: Date = new Date()): Promise<void> {
    await store.club.update(CLUB, now);
    const season = await term(store, now);
    const members = await roster(store, season, now);
    await calendar(store, season, members, now);
    const repeating = await weekly(store, season, members, now, log);

    log.info('seeded', {
      members: members.length,
      events: EVENTS.length,
      schedule: repeating,
      season: season.name,
    });
  }

  /** A weekly meeting, so the seeded database shows what a schedule does rather than describing it. */
  async function weekly(
    store: Store,
    season: Season,
    members: readonly MemberId[],
    now: Date,
    log: Logger,
  ): Promise<number> {
    const organiser = members[0];
    if (!organiser) return 0;

    const schedule = await store.schedules.create(
      {
        title: 'Training night',
        kind: 'meeting' as KindId,
        location: PLACE,
        seasonId: season.id,
        startsAt: new Date(now.getTime() + WEEK),
        minutes: LENGTH / Schedule.MINUTE,
        freq: 'weekly',
        interval: Recur.EVERY,
        count: WEEKS,
        listed: true,
      },
      organiser,
      now,
    );

    const { created } = await Expand.run(store, schedule, log, now);
    return created.length;
  }

  /** The current season, running from a month ago to the end of the academic year. */
  async function term(store: Store, now: Date): Promise<Season> {
    return store.seasons.create(
      {
        name: `${now.getFullYear()}/${(now.getFullYear() + 1) % 100}`,
        startsAt: new Date(now.getTime() - OPENED * DAY),
        endsAt: new Date(now.getTime() + CLOSES * DAY),
        renewalAt: new Date(now.getTime() + RENEWS * DAY),
        current: true,
      },
      now,
    );
  }

  async function roster(store: Store, season: Season, now: Date): Promise<MemberId[]> {
    const members: MemberId[] = [];

    for (const [index, name] of NAMES.entries()) {
      const member = await store.members.enroll(
        {
          provider: PROVIDER,
          subject: `${PROVIDER}-${index}`,
          email: `${name.toLowerCase()}@example.org`,
          name,
          avatar: null,
        },
        now,
      );

      await store.members.update(member.id, {
        status: index < ADMITTED ? Member.ACTIVE : Member.INITIAL,
      });
      await store.seasons.join(member.id, season.id, now);
      members.push(member.id);
    }

    return members;
  }

  async function calendar(
    store: Store,
    season: Season,
    members: readonly MemberId[],
    now: Date,
  ): Promise<void> {
    const organiser = members[0];
    if (!organiser) return;

    for (const draft of EVENTS) {
      const startsAt = new Date(now.getTime() + draft.days * DAY);
      const event = await store.events.create(
        {
          ...draft,
          state: Event.LIVE,
          /** Listed, because the seeded club is listed and an empty shop window shows nothing. */
          listed: true,
          startsAt,
          endsAt: new Date(startsAt.getTime() + LENGTH),
          seasonId: season.id,
          location: PLACE,
        },
        organiser,
        now,
      );

      await answers(store, event.id, members, draft.days < 0, now);
      /** One guest, on the workshop, so a sheet shows somebody who has no account. */
      if (draft.capacity) {
        await store.guests.add(event.id, { name: 'Visitor from EPFL' }, organiser, event.capacity, now);
      }
    }
  }

  /** Answers for one event, and attendance for one that has already happened. */
  async function answers(
    store: Store,
    eventId: EventId,
    members: readonly MemberId[],
    past: boolean,
    now: Date,
  ): Promise<void> {
    for (const [index, member] of members.entries()) {
      if (index % SKIP === SKIP - 1) continue;

      const answer = index % MAYBE === 0 ? Rsvp.IMPLIED : Rsvp.MAYBE;
      await store.rsvps.answer(eventId, member, answer, now);
      if (past && Rsvp.SEATED.includes(answer)) await store.rsvps.attend(eventId, member, true, now);
    }
  }
}
