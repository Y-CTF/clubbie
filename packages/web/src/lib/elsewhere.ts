import { Site } from '@clubbie/core';
import type { Dated, Moment } from './calendar/moment.ts';

/**
 * The calendars a member already lives in.
 *
 * This app is not going to be anybody's calendar. It is the club's calendar, and the win is that
 * the club's nights turn up in the one a member already looks at every morning. There are exactly
 * two ways that happens, and both are here: subscribing to the feed once, so it stays in step for
 * ever, and saving one event, for somebody who wants tonight and not the whole year.
 *
 * Every entry is a url template and nothing else. No integration, no tokens, no api of anybody
 * else's: a calendar that can be linked to is a calendar this app supports.
 */
export const Elsewhere = {
  Google: 'google',
  Outlook: 'outlook',
  /** Every calendar that speaks `webcal:` and every one that opens an `.ics`, which is the rest. */
  Apple: 'apple',
} as const;

export type Elsewhere = (typeof Elsewhere)[keyof typeof Elsewhere];

export const ELSEWHERE = Object.values(Elsewhere) as readonly Elsewhere[];

export namespace Calendars {
  /**
   * What each is called. Names, not prose, so they are not translated, for the same reason a
   * sign-in provider's name is not.
   */
  export const NAMES: Record<Elsewhere, string> = {
    google: 'Google Calendar',
    outlook: 'Outlook',
    apple: 'Apple Calendar',
  };

  /** The scheme that hands a url to whatever the machine has registered as its calendar. */
  export const WEBCAL = 'webcal:';
  export const HTTP = /^https?:/;

  /** The feed, addressed to a calendar app rather than to a browser. */
  export function webcal(feed: string): string {
    return feed.replace(HTTP, WEBCAL);
  }

  /**
   * Where to send somebody to subscribe to the club's feed. Google and Outlook take the url as a
   * parameter of a page of their own; everything else takes it as a scheme the machine resolves.
   */
  export const SUBSCRIBE: Record<Elsewhere, (feed: string, club: string) => string> = {
    google: (feed) => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal(feed))}`,
    outlook: (feed, club) =>
      `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=${encodeURIComponent(club)}`,
    apple: (feed) => webcal(feed),
  };

  /** Where to send somebody to put one event in their own calendar. */
  export const ADD: Record<Elsewhere, (moment: Moment<Dated>) => string> = {
    google: (moment) => {
      const query = new URLSearchParams({
        action: 'TEMPLATE',
        text: moment.title,
        dates: `${basic(moment.startsAt)}/${basic(moment.endsAt)}`,
        ...(moment.description && { details: moment.description }),
        ...(moment.location && { location: moment.location }),
      });
      return `https://calendar.google.com/calendar/render?${query}`;
    },
    outlook: (moment) => {
      const query = new URLSearchParams({
        path: '/calendar/action/compose',
        rru: 'addevent',
        subject: moment.title,
        startdt: moment.startsAt.toISOString(),
        enddt: moment.endsAt.toISOString(),
        ...(moment.description && { body: moment.description }),
        ...(moment.location && { location: moment.location }),
      });
      return `https://outlook.live.com/calendar/0/deeplink/compose?${query}`;
    },
    /** An `.ics` is how an event reaches a calendar on a machine rather than in a tab. */
    apple: (moment) => file(moment.id),
  };

  /** The one event as a file, which the API writes so the browser never composes iCalendar. */
  export function file(id: string): string {
    return Site.Api.event(id);
  }

  /** An instant as the calendar deep links spell it: UTC, basic format, no separators. */
  export function basic(at: Date): string {
    return at.toISOString().replaceAll(/[-:]|\.\d{3}/g, '');
  }
}
