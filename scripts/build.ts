import { Logger } from '@clubbie/log';

/**
 * The release build, in two steps: the SPA into `packages/web/dist`, then the server bundled into
 * a single executable that serves it.
 *
 * The binary still reads its assets from disk rather than embedding them, because a club that
 * rebrands the web app should not have to rebuild the server. `ASSETS` points at the directory.
 */
const log = Logger.create('clubbie').child('build');

const OUT = 'dist/clubbie';
const ENTRY = 'packages/server/src/main.ts';

const STEPS = [
  { name: 'web', argv: ['bunx', 'vite', 'build', '--config', 'packages/web/vite.config.ts'] },
  {
    name: 'server',
    argv: ['bun', 'build', ENTRY, '--compile', '--minify', '--sourcemap=none', '--outfile', OUT],
  },
] as const;

for (const { name, argv } of STEPS) {
  log.info('building', { step: name });
  const result = Bun.spawnSync([...argv], { stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) {
    log.error('build failed', new Error(`${name} exited with ${result.exitCode}`));
    process.exit(result.exitCode);
  }
}

log.info('built', { binary: OUT, assets: 'packages/web/dist' });
