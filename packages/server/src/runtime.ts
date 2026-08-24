import type { Logger } from '@clubbie/log';
import type { Hono } from 'hono';

export type Stop = () => Promise<void>;

/**
 * The one place a runtime is named. The app itself is `fetch(Request) => Response`, which every
 * target already speaks, so porting to another one is a case here and nothing else.
 *
 * Workers is not a case: there is nothing to start, since the platform calls the exported
 * handler. `worker.ts` is that export.
 */
export namespace Runtime {
  export type Name = 'bun' | 'deno' | 'node';

  export function detect(): Name {
    if (typeof Bun !== 'undefined') return 'bun';
    if ('Deno' in globalThis) return 'deno';
    return 'node';
  }

  export async function listen(app: Hono, port: number, log: Logger): Promise<Stop> {
    const runtime = detect();
    log.debug('starting listener', { runtime, port });

    if (runtime === 'bun') {
      const server = Bun.serve({ port, fetch: app.fetch });
      return async () => {
        await server.stop(true);
      };
    }

    const { serve } = await import('@hono/node-server');
    const server = serve({ fetch: app.fetch, port });
    return () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
  }

  /** Runs `stop` on the first termination signal, and reports what is closing while it closes. */
  export function onShutdown(stop: () => Promise<void>, log: Logger): void {
    const signals = ['SIGINT', 'SIGTERM'] as const;
    let closing = false;

    for (const signal of signals) {
      globalThis.process?.on(signal, () => {
        if (closing) return;
        closing = true;
        log.info('shutting down', { signal });
        stop()
          .then(() => globalThis.process?.exit(0))
          .catch((error: unknown) => {
            log.error('shutdown failed', error);
            globalThis.process?.exit(1);
          });
      });
    }
  }
}
