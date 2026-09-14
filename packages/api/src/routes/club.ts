import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
import { Booking } from '../booking.ts';
import { Check } from '../check.ts';
import type { Env } from '../context.ts';
import { Guard } from '../guard.ts';
import { Input } from '../input.ts';
import { Trail } from '../trail.ts';
import { Wire } from '../wire.ts';

/**
 * The club's own name, colour and logo. `GET` answers a signed-out caller too, because the
 * sign-in page has to render them and a club's own name is not a secret. Its settings are only
 * filled in for somebody who may change them.
 */
export const club = new Hono<Env>()
  .get('/', async (c) => {
    const club = await c.get('store').club.read();
    return c.json(Wire.club(club, c.get('ability').can('club:manage')));
  })

  .patch('/', Guard.needs('club:manage'), vValidator('json', Input.club, Check.body), async (c) => {
    const patch = c.req.valid('json');

    /** Turning the queue off is an answering rule, so `Booking` says whether it can be done. */
    if (patch.waitlist === false) await new Booking(c.get('store'), c.get('log')).closable();

    const store = c.get('store');
    const updated = await store.club.update(patch);
    c.get('log').info('club changed', { fields: Object.keys(patch) });
    /** Saving the settings is what setting a club up means, so the first save is the wizard done. */
    await store.club.establish();
    await Trail.record(c, 'club.update', null, patch);
    return c.json(Wire.club({ ...updated, setup: true } as typeof updated, true));
  });
