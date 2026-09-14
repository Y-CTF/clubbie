import { Diag, type Issue, Issues } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import type { Context } from 'hono';
import { Codes } from './codes.ts';
import type { Env } from './context.ts';
import { Fail } from './fail.ts';

/**
 * What a valibot validator hands its hook. The issue shape is `diag`'s own: it was written out a
 * second time here, so the two definitions of one thing could drift with nothing noticing.
 */
interface Result {
  readonly success: boolean;
  readonly issues?: readonly Issue[] | undefined;
}

/**
 * The one hook every validator uses, so a bad body is reported the same way whichever route took
 * it. It turns valibot's issues into a diagnostic that points into the request as it arrived:
 * the JSON body re-printed, or the query string as sent.
 *
 * The body comes from hono's own parse cache rather than being read again, because the validator
 * has already consumed the stream and a second read would hand back nothing.
 */
export namespace Check {
  export const BODY = 'body.json';
  export const QUERY = 'query';
  export const PATH = 'path';
  export const UNREADABLE = '(unreadable body)';
  export const INDENT = 2;
  /** What a body has to be sent as. Hono's own test for it, which decides whether it reads one. */
  export const JSON_TYPE = /^application\/([a-z\-.]+\+)?json(;\s*[a-zA-Z0-9-]+=([^;]+))*$/i;

  /**
   * Every JSON body, whether it validated or not.
   *
   * The content type is checked here rather than trusted, because hono reads a body only when one
   * is declared and hands the validator `{}` when it is not. An all-optional patch schema accepts
   * that empty object happily, so a request sent as `text/plain` used to answer 200, record an
   * edit in the audit trail, and change nothing: a trail entry describing an edit that never
   * happened is worse than a refusal. This is the one place every JSON route passes through, so
   * it is the one place that can say so.
   */
  export async function body(result: Result, c: Context<Env>): Promise<void> {
    const type = c.req.header('content-type');
    if (!type || !JSON_TYPE.test(type)) {
      throw Fail.invalid(
        Diag.error(Codes.api.body, markup`this request has to carry a JSON body`)
          .note(type ? markup`it was sent as \`${type}\`` : 'it named no content type at all')
          .help('send it with `content-type: application/json`'),
      );
    }
    if (result.success) return;
    throw Fail.invalid(Issues.diag(result.issues ?? [], { name: BODY, text: await source(c) }));
  }

  /** A path parameter that is not a well-formed id is a 422 naming it, never a lookup that misses. */
  export function param(result: Result, c: Context<Env>): void {
    if (result.success) return;
    throw Fail.invalid(Issues.diag(result.issues ?? [], { name: PATH, text: new URL(c.req.url).pathname }));
  }

  export function query(result: Result, c: Context<Env>): void {
    if (result.success) return;
    const text = new URL(c.req.url).search || '(no query string)';
    throw Fail.invalid(Issues.diag(result.issues ?? [], { name: QUERY, text }));
  }

  /**
   * The body as it arrived, re-printed. Hono caches the parse, so asking for it again costs
   * nothing and does not re-read a stream the validator has already consumed. What is cached is
   * the *promise*, which is why this is awaited rather than stringified directly.
   */
  async function source(c: Context<Env>): Promise<string> {
    try {
      return JSON.stringify(await c.req.json(), null, INDENT);
    } catch {
      return UNREADABLE;
    }
  }
}
