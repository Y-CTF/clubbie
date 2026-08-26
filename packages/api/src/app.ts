import { Diag } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import { Hono } from 'hono';
import { Codes } from './codes.ts';
import type { Env, Options } from './context.ts';
import { Fail, Refusal } from './fail.ts';
import { Guard } from './guard.ts';
import { Limit } from './limit.ts';
import { assets } from './routes/assets.ts';
import { auth } from './routes/auth.ts';
import { calendar } from './routes/calendar.ts';
import { club } from './routes/club.ts';
import { events } from './routes/events.ts';
import { jobs } from './routes/jobs.ts';
import { kinds } from './routes/kinds.ts';
import { me } from './routes/me.ts';
import { members } from './routes/members.ts';
import { open } from './routes/public.ts';
import { schedules } from './routes/schedules.ts';
import { seasons } from './routes/seasons.ts';
import { trail } from './routes/trail.ts';
import { Trace } from './trace.ts';

/**
 * The whole HTTP surface, mounted under `/api`. Routes are chained rather than registered in a
 * loop so their types survive into `Routes`, which is what the SPA's client is built from: a
 * handler that changes its response changes the browser's types in the same edit.
 *
 * Three routes answer a caller who is not signed in, and each is deliberate: `/me` reports that
 * nobody is, `/club` and `/public` are the shop window, and `/calendar` carries its own signed
 * token because a calendar client has no cookie.
 */
export namespace Api {
  export function create(options: Options) {
    const limit = new Limit();

    return (
      new Hono<Env>()
        .use('*', async (c, next) => {
          c.set('store', options.store);
          c.set('auth', options.auth);
          c.set('options', options);
          await next();
        })
        .use('*', Trace.middleware(options))
        .use('*', Guard.session)
        /**
         * Refusals are expected and are logged at `debug` with their diagnostic; anything else is a
         * bug, is logged at `error`, and answers with a code and nothing more. What went wrong
         * internally belongs in the log, never in a response body.
         *
         * Every refusal is rendered through the context rather than from the response the `Fail`
         * carries. A response built beside the context takes none of the headers already prepared
         * on it, which silently cost every refusal its request id, cost a throttled caller the
         * `Retry-After` telling them when to come back, and cost a dead session the `Set-Cookie`
         * that clears it: the one request where clearing it matters is the one that refuses.
         */
        .onError((error, c) => {
          const log = c.get('log') ?? options.log;
          const fail =
            error instanceof Fail
              ? error
              : new Fail(
                  Refusal.Unavailable,
                  Diag.error(Codes.api.unhandled, 'something went wrong on our side')
                    .note(markup`request id: \`${c.get('requestId') ?? 'unknown'}\``)
                    .help('try again, and quote the request id if it keeps happening'),
                );

          if (error instanceof Fail) log.debug('refused', { refusal: fail.refusal, code: fail.diag.code });
          else
            log.error('unhandled error', Diag.of(error, Codes.api.unhandled), {
              path: new URL(c.req.url).pathname,
            });

          return c.json(fail.body, fail.status);
        })
        /** Every door an anonymous caller may knock on repeatedly is throttled. */
        .use('/auth/*', limit.middleware('auth'))
        .use('/me/link', limit.middleware('link'))
        /** The calendar token is the one credential in the app that can be guessed at. */
        .use('/calendar/*', limit.middleware('calendar'))
        .use('/public/*', limit.middleware('public'))
        .route('/auth', auth)
        .route('/me', me)
        .route('/members', members)
        .route('/events', events)
        .route('/schedules', schedules)
        .route('/seasons', seasons)
        .route('/club', club)
        .route('/audit', trail)
        .route('/jobs', jobs)
        .route('/assets', assets)
        .route('/kinds', kinds)
        .route('/public', open)
        .route('/calendar', calendar)
        /** Liveness, and nothing else: the schema version is the deployment's business. */
        .get('/health', async (c) => {
          await c.get('store').ping();
          return c.json({ ok: true });
        })
    );
  }
}

/** The type the SPA's `hc<Routes>` is instantiated with. */
export type Routes = ReturnType<typeof Api.create>;
