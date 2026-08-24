import { createMiddleware } from 'hono/factory';
import type { Env, Options } from './context.ts';

/**
 * One line per request, and the context every other line inherits.
 *
 * The id comes from the caller's `x-request-id` when there is one, so a trace survives a proxy in
 * front, and goes back out on the response: a member reporting an error can quote the id that
 * names their request in the log.
 *
 * A slow request is logged at `warn` even when it succeeded, because the interesting failure in a
 * club app is usually a page that took four seconds, not one that threw.
 */
export namespace Trace {
  export const HEADER = 'x-request-id';
  export const SLOW = 1000;
  /** As long as a uuid, and no longer: an id is for finding a request, not for carrying data. */
  export const LONGEST = 36;
  /** What an id may be made of. Anything else is a caller writing into the log through us. */
  export const SHAPE = /^[A-Za-z0-9._-]+$/;

  /**
   * The caller's id when it is one, and a fresh one otherwise.
   *
   * A header is whatever was sent. Taken as it stands it goes into every log line for the request
   * and back out on the response, so an unchecked one is a way to forge log lines, to make the
   * log unsearchable by pinning every request to one id, and to hand four kilobytes to whatever
   * reads the log next. What survives that is short, and is letters, digits and separators.
   */
  export function id(given: string | undefined): string {
    if (given === undefined) return crypto.randomUUID();
    return given.length <= LONGEST && SHAPE.test(given) ? given : crypto.randomUUID();
  }

  export function middleware(options: Options) {
    return createMiddleware<Env>(async (c, next) => {
      const id = Trace.id(c.req.header(HEADER));
      const log = options.log.child('http', { requestId: id });

      c.set('requestId', id);
      c.set('log', log);
      c.header(HEADER, id);

      const started = performance.now();
      await next();
      const took = performance.now() - started;

      const fields = {
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        took: Math.round(took),
        ...(c.get('member') && { member: c.get('member')?.id }),
      };

      if (c.res.status >= 500) log.warn('request failed', fields);
      else if (took >= SLOW) log.warn('slow request', fields);
      else log.info('request', fields);
    });
  }
}
