import type { Body, Routes } from '@clubbie/api';
import { Site } from '@clubbie/core';
import { type ClientResponse, hc } from 'hono/client';
import { Codes } from './codes.ts';
import { words } from './words/index.svelte.ts';

/**
 * The typed client. `Routes` is the API's own route type, so a handler that changes its response
 * changes what this file returns in the same edit, and a path that does not exist does not
 * compile.
 */
export const api = hc<Routes>(Site.API);

/**
 * A refusal from the API, with the diagnostic it carried. The UI shows the message, and the help
 * and notes under it, which is the same report a terminal would draw with carets.
 */
export class Refused extends Error {
  constructor(
    readonly refusal: Body['error']['refusal'],
    readonly diag: Body['error']['diag'],
    readonly status: number,
  ) {
    super(diag.message);
    this.name = 'Refused';
  }

  get help(): string | null {
    return this.diag.help ?? null;
  }

  get notes(): readonly string[] {
    return this.diag.notes ?? [];
  }

  /** A refusal a signed-out caller caused, which the app answers by showing the sign-in page. */
  get anonymous(): boolean {
    return this.status === Status.Unauthorised;
  }
}

export const Status = {
  Unauthorised: 401,
  Forbidden: 403,
} as const;

/**
 * What to do when the server says nobody is signed in. `Session` sets it on startup; `unwrap`
 * calls it from wherever the refusal happened, so an expired cookie takes a member back to the
 * sign-in page instead of leaving a stale name in the nav and a refusal on every panel.
 *
 * It is a hook rather than an import because `Session` reads through `unwrap` itself, and the two
 * importing each other is a cycle.
 */
export const Expiry = {
  onAnonymous: null as (() => void) | null,
};

/**
 * Unwraps a response: the parsed body, or a `Refused` carrying the diagnostic. Every call in the
 * app goes through it, so no component parses an error shape of its own.
 */
export async function unwrap<T>(response: ClientResponse<T>): Promise<T> {
  /** `json()` is typed against every status the route can answer with; `ok` narrows it to this one. */
  if (response.ok) return (await response.json()) as T;

  if (response.status === Status.Unauthorised) Expiry.onAnonymous?.();

  const body = (await response.json().catch(() => null)) as Body | null;
  if (body?.error) throw new Refused(body.error.refusal, body.error.diag, response.status);

  throw new Refused(
    'unavailable',
    { code: Codes.unreachable, severity: 'error', message: words.t.refused.unreachable, labels: [] },
    response.status,
  );
}

/**
 * Whatever went wrong before the server got a chance to say so: a dropped connection, a proxy that
 * answered with html. The browser's own words are kept, because "Failed to fetch" is the only fact
 * anybody has, wrapped in a sentence the reader's language has.
 *
 * It lives here rather than beside `Query` and `Action` because it was written out twice there,
 * identically, which is one definition too many for a sentence a member reads.
 */
export function refused(error: unknown): Refused {
  if (error instanceof Refused) return error;

  const message = error instanceof Error ? error.message : String(error);
  return new Refused(
    'unavailable',
    { code: Codes.unknown, severity: 'error', message: words.t.refused.unknown(message), labels: [] },
    0,
  );
}
