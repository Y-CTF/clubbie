import { Setup } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import { Check } from '../check.ts';
import { Codes } from '../codes.ts';
import type { Env } from '../context.ts';
import { Fail, Refusal } from '../fail.ts';
import { Feed } from '../feed.ts';
import { Guard } from '../guard.ts';
import { Input } from '../input.ts';
import { Wire } from '../wire.ts';
import { Calendar } from './calendar.ts';

/**
 * The caller's own row. `GET /me` answers for a signed-out caller too (with `null`), because the
 * SPA asks it on every load and a 401 there is not an error, it is the answer.
 */
export const me = new Hono<Env>()
  .get('/', async (c) => {
    const member = c.get('member');
    if (!member) return c.json(null);

    /**
     * Two more reads on the one request every page load already makes, rather than a page nobody
     * visits: this is what puts the club's year in the shell and the renewal in front of the member
     * who has not done it. A club with no season pays for one of them and gets null.
     */
    const season = await c.get('store').seasons.current();
    const renewed = season !== null && (await c.get('store').seasons.holds(member.id, season.id));

    const ability = c.get('ability');
    const store = c.get('store');

    /** Not worked out for somebody who dismissed it: the answer is empty and the reads are saved. */
    const setup = member.welcomed
      ? []
      : Setup.list((action) => ability.can(action), {
          club: (await store.club.read()).setup,
          events: ability.can('club:manage') ? (await store.events.list({ limit: 1 })).length : 0,
          named: member.named,
          chat: (await store.links.chat(member.id)) !== null,
          season: season && (renewed || season.renewable()) ? renewed : null,
        });

    return c.json(Wire.viewer(member, ability, { season, renewed }, setup));
  })

  .patch('/', Guard.needs('profile:write'), vValidator('json', Input.profile, Check.body), async (c) => {
    const member = Guard.member(c);
    const updated = await c.get('store').members.update(member.id, c.req.valid('json'));
    return c.json(Wire.member(updated ?? member));
  })

  /**
   * A one-off invitation into the club's chat group.
   *
   * Minted per member rather than handed out as one link everybody shares, because a shared link
   * is a group anybody who ever saw it can walk into. It is not stored: it is worth one seat for
   * an hour, and the member is looking at it.
   */
  .post('/group', Guard.needs('profile:write'), async (c) => {
    const { group } = await c.get('store').club.read();
    const invite = c.get('options').invite;

    if (!group || !invite) {
      throw Fail.because(
        Refusal.Closed,
        Diag.error(Codes.club.group, 'this club has no chat group to join')
          .note('an organiser names one in the settings, and the bot has to be in it')
          .help('ask an organiser'),
      );
    }

    const link = await invite(group).catch((error: unknown) => {
      c.get('log').error('could not mint a group invitation', error);
      throw Fail.because(
        Refusal.Unavailable,
        Diag.error(Codes.club.group, 'the invitation could not be made')
          .note('the bot has to be in the group and allowed to invite people')
          .help('ask an organiser to check the bot’s permissions'),
      );
    });

    c.get('log').info('group invitation minted', { member: Guard.member(c).id });
    return c.json({ url: link });
  })

  /** Stop showing the checklist. Idempotent, so the button may be pressed twice. */
  .post('/welcome', Guard.needs('profile:write'), async (c) => {
    await c.get('store').members.welcomed(Guard.member(c).id);
    return c.json({ ok: true });
  })

  .get('/rsvps', Guard.needs('profile:read'), async (c) => {
    const history = await c.get('store').rsvps.timeline(Guard.member(c).id);
    return c.json(history.map(Wire.moment));
  })

  .get('/notifications', Guard.needs('profile:read'), async (c) => {
    const prefs = await c.get('store').prefs.read(Guard.member(c).id);
    return c.json(Wire.prefs(prefs));
  })

  .patch(
    '/notifications',
    Guard.needs('profile:write'),
    vValidator('json', Input.prefs, Check.body),
    async (c) => {
      const prefs = await c.get('store').prefs.update(Guard.member(c).id, c.req.valid('json'));
      return c.json(Wire.prefs(prefs));
    },
  )

  /**
   * The member's own calendar url. It is answered rather than stored: it is a signature over
   * their id, so it can always be recomputed, and rotating the session secret retires every one.
   */
  .get('/calendar', Guard.needs('profile:read'), async (c) => {
    const options = c.get('options');
    const token = await Feed.sign(Guard.member(c).id, options.secret);
    return c.json({ url: Calendar.url(options.baseUrl, token) });
  })

  /** Issues a code to send to the bot. The chat is linked when the bot redeems it, not here. */
  .post('/link', Guard.needs('profile:write'), async (c) => {
    const issued = await c.get('store').links.issue(Guard.member(c).id);
    return c.json({ token: issued.token, expiresAt: issued.expiresAt.toISOString() });
  })

  .get('/link', Guard.needs('profile:read'), async (c) => {
    const chat = await c.get('store').links.chat(Guard.member(c).id);
    return c.json(chat ? { username: chat.username, linkedAt: chat.linkedAt.toISOString() } : null);
  })

  .delete('/link', Guard.needs('profile:write'), async (c) => {
    await c.get('store').links.unlink(Guard.member(c).id);
    return c.json({ ok: true });
  });
