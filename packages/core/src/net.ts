import { Millis } from './millis.ts';

/**
 * What this app assumes when it talks to another system over HTTP.
 *
 * No I/O happens here, only the four decisions every such call makes and had been making
 * separately: a sign-in exchanging a code, a provider's userinfo, a discovery document, and a mail
 * provider's send endpoint each declared their own media types and their own excerpt length, with
 * near-identical docstrings, and none of them declared a timeout at all.
 */
export namespace Net {
  export const TYPE = 'application/json';
  export const FORM = 'application/x-www-form-urlencoded';
  /** How much of another system's refusal is worth putting in a diagnostic somebody reads. */
  export const EXCERPT = 200;
  /**
   * How long to wait for another system before giving up on it.
   *
   * There is no default anywhere in `fetch`, on any runtime, which is a hung TCP connection
   * lasting forever. That is survivable in a request and is not in the scheduler: a send that
   * never settles leaves the drain promise pending, so every later tick sees one already in
   * flight and returns, and the queue stops for good with nothing in the log to say so. The lease
   * is the ceiling this has to stay under, so a job that times out is retried rather than
   * reclaimed from underneath itself.
   */
  export const TIMEOUT = 15 * Millis.SECOND;

  /** A fresh deadline for one call. `AbortSignal.timeout` is a one-shot, so it cannot be shared. */
  export function patience(): AbortSignal {
    return AbortSignal.timeout(TIMEOUT);
  }
}
