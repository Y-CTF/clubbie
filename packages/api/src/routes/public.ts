import { Club, Event } from '@clubbie/core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../context.ts';
import { Wire } from '../wire.ts';

/** What the shop window is: who may read it, and how. */
export namespace Billboard {
  /**
   * Anybody, from anywhere. It is the one route in the app that answers a caller with no session,
   * carries nothing a passer-by could not read on the public page, and takes no cookie, so a club
   * that wants its next few evenings on its own static site can read them from a browser rather
   * than standing a proxy up in front of them. Every other route stays same-origin.
   */
  export const ORIGIN = '*';
  export const METHODS = ['GET'];
}

/**
 * The shop window: the next few events, without signing in.
 *
 * It is off unless the club turns it on, and an event is on it only if it was marked listed, so
 * being public is two deliberate acts rather than a default nobody noticed. A closed club answers
 * with an empty list rather than a refusal: there is nothing secret about having nothing to show.
 */
export const open = new Hono<Env>()
  .use('*', cors({ origin: Billboard.ORIGIN, allowMethods: [...Billboard.METHODS] }))
  .get('/events', async (c) => {
    const store = c.get('store');
    const club = await store.club.read();
    if (!club.listed) return c.json({ club: Wire.club(club), events: [] });

    const listing = await store.events.list({
      state: Event.LIVE,
      listed: true,
      upcoming: new Date(),
      limit: Club.WINDOW,
    });

    const vocabulary = new Map((await store.kinds.list()).map((kind) => [kind.id, kind.label]));

    return c.json({
      club: Wire.club(club),
      events: listing.map((tally) =>
        Wire.billboard(tally.event, vocabulary.get(tally.event.kind) ?? tally.event.kind),
      ),
    });
  });
