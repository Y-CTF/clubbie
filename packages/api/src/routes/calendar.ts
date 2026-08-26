import { Ability, Brand, Event, Site } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import { Check } from '../check.ts';
import { Codes } from '../codes.ts';
import type { Env } from '../context.ts';
import { Fail, Refusal } from '../fail.ts';
import { Feed } from '../feed.ts';
import { Ical } from '../ical.ts';
import { Input } from '../input.ts';

/** What the feed route is, in one place: its suffix, its filename and how much it carries. */
export namespace Calendar {
  export const SUFFIX = /\.ics$/;
  export const FILE = `${Brand.STEM}.ics`;
  /** How many events a feed carries. */
  export const WINDOW = 200;
  /** How far back it reaches: enough that last month is still in a calendar, and no further. */
  export const BACK = 90 * 24 * 60 * 60 * 1000;

  /** The url a member subscribes to. The prefix and the extension are stated once, here. */
  export function url(baseUrl: string, token: string): string {
    return new URL(Site.Api.calendar(token), baseUrl).toString();
  }
}

/**
 * A member's calendar feed. It is the one route that authenticates on the url rather than on a
 * cookie, because a calendar client has no cookie jar and will never sign in: `Feed` explains what
 * that token is worth.
 *
 * A feed is deliberately generous with the past and the future both, because a calendar app decides
 * for itself what to show and refetching is the client's business, not the server's.
 */
export const calendar = new Hono<Env>().get(
  '/:token{.+\\.ics}',
  vValidator('param', Input.params.feed, Check.param),
  async (c) => {
    const store = c.get('store');
    const options = c.get('options');
    const token = c.req.valid('param').token.replace(Calendar.SUFFIX, '');

    const memberId = await Feed.open(token, options.secret);
    const member = memberId ? await store.members.byId(memberId) : null;
    /** The same permission table as every other read: a member who was retired reads nothing. */
    if (!member || !Ability.of(member).can('event:read')) {
      throw Fail.because(
        Refusal.Forbidden,
        Diag.error(Codes.feed.token, 'this calendar link is not valid')
          .note('it was minted for another deployment, or the session secret has been rotated')
          .help(markup`open your profile in ${Brand.STEM} and subscribe to the link it shows now`),
      );
    }

    const listing = await store.events.list({
      state: Event.LIVE,
      upcoming: new Date(Date.now() - Calendar.BACK),
      limit: Calendar.WINDOW,
    });
    const club = await store.club.read();
    const body = Ical.calendar(
      listing.map((tally) => tally.event),
      club,
    );

    c.get('log').debug('calendar served', { member: member.id, events: listing.length });
    return c.body(body, 200, Ical.headers(Calendar.FILE));
  },
);
