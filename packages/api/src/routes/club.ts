import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
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
    const updated = await c.get('store').club.update(patch);
    c.get('log').info('club changed', { fields: Object.keys(patch) });
    await Trail.record(c, 'club.update', null, patch);
    return c.json(Wire.club(updated, true));
  });
