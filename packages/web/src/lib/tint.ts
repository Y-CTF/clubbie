import type { Answer, JobState } from '@clubbie/core';

/**
 * Everything a badge can report: an answer, the two standings that are not answers a member gives,
 * and where a job is in its life. They share a table because they share a vocabulary of meaning,
 * which is what a colour on a badge actually says: this went well, this is waiting, this did not.
 */
export type Tinted = Answer | 'attended' | 'guest' | JobState;

/**
 * The one place a state gets a colour.
 *
 * It is a custom property rather than a class, because two different controls wear it: the badge
 * that reports an answer and the button that gives one. Both want the same green for `going`, and
 * a club that restyles the palette moves both in one edit.
 */
export const Tint: Record<Tinted, string> = {
  going: '--tint: var(--color-going)',
  waitlist: '--tint: var(--color-maybe)',
  maybe: '--tint: var(--color-maybe)',
  declined: '--tint: var(--color-declined)',
  attended: '--tint: var(--color-going)',
  guest: '--tint: var(--color-muted)',
  pending: '--tint: var(--color-muted)',
  running: '--tint: var(--color-maybe)',
  done: '--tint: var(--color-going)',
  failed: '--tint: var(--color-declined)',
};
