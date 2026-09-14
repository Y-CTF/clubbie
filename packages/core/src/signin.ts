import { Bytes } from './bytes.ts';
import type { Id } from './id.ts';
import { Millis } from './millis.ts';

export type SigninId = Id<'signin'>;

/**
 * Signing in with an address and nothing else, for somebody who belongs to no university and holds
 * no GitHub account. A password is the obvious answer and the one thing this app will not store: a
 * club with no sysadmin has no business holding everybody's secret.
 *
 * One mail carries two ways to spend the same request: a link to click, and a code to type back
 * for a mail client that rewrites links. What makes six digits safe is `TRIES`, not their length.
 */
export namespace Signin {
  export const PROVIDER = 'email';
  export const TTL = 15 * Millis.MINUTE;
  /** The link's token is worth a session, so it is as wide as one. */
  export const BYTES = 32;
  export const DIGITS = 6;
  export const TRIES = 3;
  /** Nobody reads six digits in one run, so a mail prints them in groups of this. */
  export const GROUP = 3;
  export const SPACE = ' ';

  export function token(): string {
    return Bytes.token(BYTES);
  }

  /** Leading zeros kept: `042719` is a code. */
  export function code(): string {
    const drawn = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    return String(drawn % 10 ** DIGITS).padStart(DIGITS, '0');
  }

  export function grouped(code: string): string {
    return (code.match(new RegExp(`.{1,${GROUP}}`, 'g')) ?? [code]).join(SPACE);
  }

  /** A typed code, with whatever spacing the reader copied along with it taken back off. */
  export function typed(given: string): string {
    return given.replaceAll(/\D/g, '');
  }
}
