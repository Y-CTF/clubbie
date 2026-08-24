import { Site } from '@clubbie/core';

/**
 * What a job's payload points at, in the app.
 *
 * A payload is ids and nothing else, which is what makes this one table rather than a branch per
 * kind: a job that names an event is a link to that event whether it was announcing it, reminding
 * people about it, or moving somebody's seat. A kind of job added later that names one of these
 * is linked without a line here.
 */
export namespace Work {
  /** Which page each id in a payload belongs to. The paths themselves are `Site`'s. */
  export const PAGES = {
    eventId: 'event',
    memberId: 'member',
    scheduleId: 'repeat',
    seasonId: 'seasons',
  } as const satisfies Record<string, Site.Name>;

  export type Key = keyof typeof PAGES;

  export function is(key: string): key is Key {
    return key in PAGES;
  }

  /** Where a payload entry leads, or null for one that is not an id this app has a page for. */
  export function link(key: string, value: unknown): string | null {
    if (!is(key) || typeof value !== 'string') return null;
    return Site.path(PAGES[key], { id: value });
  }
}
