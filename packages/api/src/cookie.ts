import { Brand } from '@clubbie/core';
import type { Context } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import * as v from 'valibot';
import type { Env } from './context.ts';
import { Input } from './input.ts';

/** An OAuth flow in progress, parked in a signed cookie between the redirect and the callback. */
export type Flow = v.InferOutput<typeof Input.flow>;
/** A Telegram identity waiting for the address that will make it a member. */
export type Chatter = v.InferOutput<typeof Input.chatter>;

/**
 * The two cookies the app sets. Both are host-only, http-only and `lax`: the session must survive
 * a top-level redirect back from a provider, which `strict` would drop, and neither is ever read
 * by client script.
 */
export namespace Cookie {
  export const SESSION = Brand.cookie('session');
  export const FLOW = Brand.cookie('flow');
  export const CHAT = Brand.cookie('chat');
  /** What a TLS-terminating proxy calls the scheme the member actually used. */
  export const FORWARDED = 'x-forwarded-proto';
  /** A flow that has not completed in ten minutes is abandoned, not resumed. */
  export const FLOW_TTL = 10 * 60;

  export function session(c: Context<Env>, token: string, expiresAt: Date): void {
    setCookie(c, SESSION, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: secure(c),
      expires: expiresAt,
    });
  }

  export function read(c: Context<Env>): string | undefined {
    return getCookie(c, SESSION);
  }

  export function clear(c: Context<Env>): void {
    deleteCookie(c, SESSION, { path: '/' });
  }

  export async function park(c: Context<Env>, secret: string, flow: Flow): Promise<void> {
    await setSignedCookie(c, FLOW, JSON.stringify(flow), secret, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: secure(c),
      maxAge: FLOW_TTL,
    });
  }

  /** Reads a parked flow and consumes it, so a code can only ever be exchanged once. */
  export async function take(c: Context<Env>, secret: string): Promise<Flow | null> {
    const raw = await getSignedCookie(c, secret, FLOW);
    deleteCookie(c, FLOW, { path: '/' });
    if (!raw) return null;
    try {
      /** A signed cookie is still input: what was parked is checked on the way back out. */
      const parsed = v.safeParse(Input.flow, JSON.parse(raw));
      return parsed.success ? parsed.output : null;
    } catch {
      return null;
    }
  }

  /** The chat waiting on an address. Parked like a flow, and consumed the same way. */
  export async function hold(c: Context<Env>, secret: string, chatter: Chatter): Promise<void> {
    await setSignedCookie(c, CHAT, JSON.stringify(chatter), secret, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: secure(c),
      maxAge: FLOW_TTL,
    });
  }

  export async function held(c: Context<Env>, secret: string): Promise<Chatter | null> {
    const raw = await getSignedCookie(c, secret, CHAT);
    deleteCookie(c, CHAT, { path: '/' });
    if (!raw) return null;
    try {
      const parsed = v.safeParse(Input.chatter, JSON.parse(raw));
      return parsed.success ? parsed.output : null;
    } catch {
      return null;
    }
  }

  /**
   * Whether the cookie may only travel over TLS.
   *
   * The direct case is the easy one. The deployment this app is written for is the other one: a
   * proxy terminates TLS and forwards plain HTTP to localhost, so the request the app sees says
   * `http:` for a member who is on `https:`, and reading the url alone drops `Secure` from the
   * session cookie of every real deployment. The forwarded header answers that, and is believed
   * only when the operator said there is a proxy in front, because otherwise it is a header any
   * caller can write.
   */
  function secure(c: Context<Env>): boolean {
    if (new URL(c.req.url).protocol === 'https:') return true;
    if (!c.get('options').trustProxy) return false;

    return c.req.header(FORWARDED)?.split(',')[0]?.trim().toLowerCase() === 'https';
  }
}
