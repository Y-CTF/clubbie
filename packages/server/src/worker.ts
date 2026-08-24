import { App, type Wired } from './app.ts';
import { Config } from './config.ts';
import { Scheduler } from './scheduler.ts';

/**
 * The Workers entry point. Three things differ from a long-lived process and all are structural:
 *
 * - the environment arrives per request rather than from `process.env`, so the config is read
 *   from what the platform hands in;
 * - there is no filesystem, so the SPA is served by the platform's own asset binding and the
 *   assets middleware is left out;
 * - there is no process to hold a timer, so the queue is drained by the platform's cron trigger
 *   calling `scheduled` rather than by `Scheduler.start`. Without that trigger a Workers
 *   deployment would answer requests and quietly never send an announcement.
 *
 * Everything else is `App.wire`, unchanged. The wiring is built once per isolate and reused, and
 * what is cached is the *promise*: caching the resolved value would let two concurrent first
 * requests each open their own store. A SQLite url cannot work here: point `DATABASE_URL` at
 * Postgres, or add a D1 dialect beside the two in `store`.
 */
export interface Bindings {
  readonly [key: string]: string | undefined;
}

let cached: Promise<Wired> | null = null;

function wired(env: Bindings): Promise<Wired> {
  cached ??= App.wire(Config.read(env as Config.Source), { assets: false });
  return cached;
}

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const { app } = await wired(env);
    return app.fetch(request);
  },

  /** One pass of the queue per trigger, which is what `clubbie work` is on a long-lived host. */
  async scheduled(_event: unknown, env: Bindings): Promise<void> {
    const config = Config.read(env as Config.Source);
    const { store, log } = await wired(env);
    const notify = App.channels(config, store, log, App.bot(config, store, log));
    const scheduler = new Scheduler({ store, notify, log, baseUrl: config.baseUrl });

    await scheduler.plan();
    await scheduler.tick();
  },
};
