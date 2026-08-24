import { Logger } from '@clubbie/log';
import { API, PORT } from '../packages/web/vite.config.ts';

/**
 * Development runs two processes: the API (watched by Bun) and Vite in front of it. Vite proxies
 * `/api` through, so the browser sees one origin and the session cookie behaves exactly as it
 * will in production.
 *
 * Either process exiting takes the other with it: a half-running dev environment where the API
 * died twenty minutes ago is worse than one that stopped.
 *
 * It says which of the two addresses is the app, because both answer and only one of them is the
 * code being edited: the API serves the last `bun run build`, so a developer who opened it instead
 * of Vite is debugging whatever the bundle held the last time somebody built it, and every change
 * they make appears to do nothing.
 */
const log = Logger.create('clubbie').child('dev');

const PROCESSES = [
  { name: 'server', argv: ['bun', '--watch', 'packages/server/src/main.ts', 'serve'] },
  { name: 'web', argv: ['bunx', 'vite', '--config', 'packages/web/vite.config.ts'] },
] as const;

log.info('the app is at vite; the api serves the last build', {
  app: `http://localhost:${PORT}`,
  /** Where Vite proxies to, which is the one place this pair of addresses is written down. */
  built: API,
});

const running = PROCESSES.map(({ name, argv }) => {
  log.info('starting', { process: name });
  return {
    name,
    child: Bun.spawn([...argv], { stdout: 'inherit', stderr: 'inherit', env: process.env }),
  };
});

const stop = (): void => {
  for (const { child } of running) child.kill();
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, stop);

const first = await Promise.race(
  running.map(async ({ name, child }) => ({ name, code: await child.exited })),
);
log.warn('a process exited, stopping the rest', first);
stop();
process.exit(first.code);
