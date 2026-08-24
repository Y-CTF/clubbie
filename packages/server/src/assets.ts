import { Cache, Site } from '@clubbie/core';
import type { Logger } from '@clubbie/log';
import type { MiddlewareHandler } from 'hono';

/**
 * Serves the built SPA beside the API, so a deployment is one process and one origin: no CORS, no
 * second server, and a cookie that is not cross-site.
 *
 * Anything that is not a file falls back to `index.html`, because the SPA owns its routes and a
 * reload of `/events/abc` must not 404. Hashed assets are cached for a year and `index.html`
 * never is, which is what makes a deploy visible without breaking a page mid-session.
 *
 * On Workers there is no filesystem: the platform serves assets and this middleware is not
 * mounted (see `worker.ts`).
 */
export namespace Assets {
  export const INDEX = 'index.html';
  /** A hashed filename, which is what Vite emits and the only thing safe to cache forever. */
  export const HASHED = /-[A-Za-z0-9_]{8,}\.[a-z0-9]+$/;

  export const TYPES: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    webp: 'image/webp',
    ico: 'image/x-icon',
    woff2: 'font/woff2',
    txt: 'text/plain; charset=utf-8',
  };

  export function type(path: string): string {
    return TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
  }

  export function middleware(root: string, log: Logger): MiddlewareHandler {
    const read = reader();

    return async (c, next) => {
      if (c.req.path.startsWith(`${Site.API}/`)) return next();

      const requested = c.req.path === '/' ? INDEX : c.req.path.replace(/^\//, '');
      /** `..` never leaves the asset root: a path that escapes it is served the SPA instead. */
      const safe = requested.split('/').filter((part) => part !== '..' && part !== '');
      const path = safe.join('/');
      const file = await read(`${root}/${path}`);

      if (file) {
        return c.body(file, 200, {
          /**
           * The type comes from the file that was read rather than from the path that was asked
           * for, and is never guessed past: without `nosniff` a browser is free to decide an
           * `application/octet-stream` body is a document and render it as one.
           */
          'content-type': type(path),
          'cache-control': HASHED.test(requested) ? Cache.IMMUTABLE : Cache.FRESH,
          ...Cache.SNIFF,
        });
      }

      const index = await read(`${root}/${INDEX}`);
      if (!index) {
        log.warn('no built assets', { root });
        return c.text('the web app has not been built: run `bun run build`', 404);
      }
      return c.body(index, 200, {
        'content-type': type(INDEX),
        'cache-control': Cache.FRESH,
        ...Cache.SNIFF,
      });
    };
  }

  /** One file reader for both runtimes: `node:fs` is what Bun and Node agree on. */
  function reader(): (path: string) => Promise<ArrayBuffer | null> {
    return async (path) => {
      const { readFile } = await import('node:fs/promises');
      const file = await readFile(path).catch(() => null);
      /** A fresh `ArrayBuffer`, since a pooled Node buffer's view is not a standalone body. */
      return file
        ? (file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer)
        : null;
    };
  }
}
