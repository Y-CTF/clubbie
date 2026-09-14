import { Millis } from './millis.ts';

/**
 * What this app assumes when it talks to another system over HTTP. No I/O, only the decisions
 * four call sites were each making separately, none of which had a timeout at all.
 */
export namespace Net {
  export const TYPE = 'application/json';
  export const FORM = 'application/x-www-form-urlencoded';
  /** How much of another system's refusal is worth putting in a diagnostic. */
  export const EXCERPT = 200;
  /**
   * `fetch` has no default on any runtime, so a hung connection lasts forever. Survivable in a
   * request; in the scheduler it leaves the drain pending, and every later tick sees one in
   * flight and returns. Stays under `Job.LEASE`, so a timed-out job is retried rather than
   * reclaimed from under itself.
   */
  export const TIMEOUT = 15 * Millis.SECOND;

  /** One-shot, so each call gets its own. */
  export function patience(): AbortSignal {
    return AbortSignal.timeout(TIMEOUT);
  }
}
