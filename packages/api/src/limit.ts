import { Millis } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { Codes } from './codes.ts';
import type { Env } from './context.ts';
import { Fail, Refusal } from './fail.ts';

/**
 * A fixed-window throttle, in memory.
 *
 * It guards the two doors worth guarding before this is on the internet: starting a sign-in, and
 * redeeming a linking code. Both are cheap to ask for and expensive to be wrong about, and a
 * linking code is short enough that unlimited guesses would eventually find one.
 *
 * In memory is the honest scope: one process is the deployment this app is for, and a counter in
 * the database would add a write to every sign-in to defend against an attacker who can already
 * afford to run the request. A second process is a second window, which is a weaker limit rather
 * than a broken one.
 *
 * **A caller is identified by the connection, not by a header.** `x-forwarded-for` is written by
 * whoever sent the request unless something trusted rewrites it, so keying on it by default would
 * hand an attacker an unlimited budget by varying one header. It is read only when the deployment
 * says it sits behind a proxy.
 */
export class Limit {
  /** What the client is told to wait, and how long a window lasts. */
  static readonly WINDOW = Millis.MINUTE;
  static readonly TRIES = 10;
  static readonly HEADER = 'retry-after';
  static readonly SECOND = Millis.SECOND;
  /**
   * The one header a trusted proxy is believed through.
   *
   * It used to be three, `cf-connecting-ip` first. Only Cloudflare writes that one, and every
   * other proxy passes an unknown header through untouched, so a deployment behind nginx let any
   * caller name themselves and take a fresh bucket per request. A header only one vendor sets is
   * not evidence anywhere else, and `x-forwarded-for` is the one every proxy appends to.
   */
  static readonly FORWARDED = 'x-forwarded-for';
  /**
   * How many proxies sit in front of this process, so the caller is that many entries from the
   * right. Reading the leftmost entry is reading whatever the caller sent: nginx's own
   * `$proxy_add_x_forwarded_for` appends the peer it saw to the header it was given, so the chain
   * is `<what the client claimed>, <who the client actually is>`. Only the right-hand end was
   * written by something trusted.
   */
  static readonly HOPS = 1;
  /** The bucket callers share when the runtime cannot name them: still bounded, just coarser. */
  static readonly SHARED = 'unknown';
  /** How many callers are remembered, so a flood of addresses cannot grow the map forever. */
  static readonly KEYS = 10_000;

  private readonly seen = new Map<string, { count: number; until: number }>();

  constructor(
    readonly tries: number = Limit.TRIES,
    readonly window: number = Limit.WINDOW,
  ) {}

  /** Records one attempt and says whether it is allowed. */
  take(key: string, now: number = Date.now()): boolean {
    const found = this.seen.get(key);
    if (!found || found.until <= now) {
      this.evict(now);
      this.seen.set(key, { count: 1, until: now + this.window });
      return true;
    }

    found.count += 1;
    return found.count <= this.tries;
  }

  /** How long the caller has to wait, in whole seconds, which is what `retry-after` takes. */
  wait(key: string, now: number = Date.now()): number {
    const found = this.seen.get(key);
    return found ? Math.max(1, Math.ceil((found.until - now) / Limit.SECOND)) : 0;
  }

  /**
   * Drops the windows that have closed, and only then the oldest of what is left. Clearing the map
   * wholesale would make a flood of fresh keys a way to reset everybody else's counter.
   */
  private evict(now: number): void {
    if (this.seen.size < Limit.KEYS) return;

    for (const [key, window] of this.seen) {
      if (window.until <= now) this.seen.delete(key);
    }

    /** Still full of live windows: the oldest go, since a Map iterates in insertion order. */
    for (const key of this.seen.keys()) {
      if (this.seen.size < Limit.KEYS) break;
      this.seen.delete(key);
    }
  }

  /**
   * The caller, as well as the runtime can say. Bun hands the server object to the app and Node's
   * adapter hands the socket, which is why both shapes are read here rather than importing a
   * runtime adapter into the API.
   */
  static who(c: Context<Env>): string {
    const peer = Limit.peer(c);
    if (!c.get('options').trustProxy) return peer ?? Limit.SHARED;

    const chain =
      c.req
        .header(Limit.FORWARDED)
        ?.split(',')
        .map((one) => one.trim())
        .filter((one) => one !== '') ?? [];

    return chain[chain.length - Limit.HOPS] ?? peer ?? Limit.SHARED;
  }

  private static peer(c: Context<Env>): string | null {
    const env = c.env as {
      requestIP?: (request: Request) => { address: string } | null;
      incoming?: { socket?: { remoteAddress?: string } };
    } | null;

    return env?.requestIP?.(c.req.raw)?.address ?? env?.incoming?.socket?.remoteAddress ?? null;
  }

  /** Middleware guarding one route, keyed by caller and by the route's own name. */
  middleware(name: string) {
    return createMiddleware<Env>(async (c, next) => {
      const key = `${name}:${Limit.who(c)}`;
      if (this.take(key)) return next();

      const seconds = this.wait(key);
      c.header(Limit.HEADER, String(seconds));
      c.get('log')?.warn('throttled', { route: name, seconds });
      throw Fail.because(
        Refusal.Throttled,
        Diag.error(Codes.api.throttled, 'too many attempts')
          .note(
            markup`this endpoint takes ${this.tries} requests every ${this.window / Limit.SECOND} seconds`,
          )
          .help(markup`wait ${seconds} seconds and try again`),
      );
    });
  }
}
