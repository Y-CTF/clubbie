import { Ability, type Action, type Member } from '@clubbie/core';
import { createMiddleware } from 'hono/factory';
import type { Env } from './context.ts';
import { Cookie } from './cookie.ts';
import { Fail } from './fail.ts';

/**
 * Authentication and authorisation as two middlewares. `session` runs everywhere and only reports
 * who is calling; `needs` refuses. Keeping them apart is what lets a public route know the caller
 * without also demanding one.
 */
export namespace Guard {
  export const session = createMiddleware<Env>(async (c, next) => {
    const token = Cookie.read(c);
    const resolved = token ? await c.get('auth').resolve(token) : null;
    if (token && !resolved) Cookie.clear(c);
    /** A renewed session is worth nothing if the browser drops the cookie first, so it is re-sent. */
    if (token && resolved?.renewed) Cookie.session(c, token, resolved.expiresAt);

    c.set('member', resolved?.member ?? null);
    c.set('ability', Ability.of(resolved?.member ?? null));
    await next();
  });

  /** Refuses anyone who may not take this action. The reason distinguishes the two refusals. */
  export function needs(action: Action) {
    return createMiddleware<Env>(async (c, next) => {
      const member = c.get('member');
      if (!member) throw Fail.unauthenticated();
      if (!c.get('ability').can(action)) throw Fail.forbidden(`${action} needs a different role`);
      await next();
    });
  }

  /** The signed-in member, for handlers that already ran behind `needs`. */
  export function member(c: { get(key: 'member'): Member | null }): Member {
    const member = c.get('member');
    if (!member) throw Fail.unauthenticated();
    return member;
  }
}
