import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwind from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * The SPA is built into `dist/` and served by the API process in production (see `Assets`), so
 * there is one origin and no CORS anywhere. In development, Vite proxies `/api` to the server for
 * the same reason: the session cookie must look same-site to the browser either way.
 */
export const PORT = 5173;
export const API = 'http://localhost:3000';

const ROOT = resolve(import.meta.dirname, '../..');

/**
 * The workspace packages, as aliases, read from the one place that already names them.
 *
 * They are needed because nothing links `@clubbie/*` into `node_modules`: the packages resolve
 * through the tsconfig's `paths`, which the type checker and Bun both honour and Vite does not.
 * Without this the dev server cannot find `@clubbie/core` at all, and the production build only
 * survives because Rollup resolves it another way, which is exactly the kind of difference between
 * `dev` and `build` that is worth deleting rather than living with.
 *
 * Reading `tsconfig.json` keeps it one list. If a package is added there and nowhere else, the SPA
 * can import it the same day.
 */
function workspace(): Record<string, string> {
  const config = JSON.parse(readFileSync(resolve(ROOT, 'tsconfig.json'), 'utf8')) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };

  const aliases: Record<string, string> = {};
  for (const [name, [target]] of Object.entries(config.compilerOptions?.paths ?? {})) {
    if (target) aliases[name] = resolve(ROOT, target);
  }
  return aliases;
}

export default defineConfig({
  root: import.meta.dirname,
  plugins: [svelte(), tailwind()],
  resolve: { alias: workspace() },
  /**
   * Two processes share this terminal, and the other one is the API. Clearing the screen throws
   * away whatever the server just said, including the diagnostic that explains why it refused to
   * boot, and takes the scrollback with it.
   */
  clearScreen: false,
  server: {
    port: PORT,
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
