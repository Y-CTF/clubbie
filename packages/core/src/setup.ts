import type { Action } from './ability.ts';

export const STEPS = ['club', 'event', 'name', 'chat', 'season'] as const;
export type Step = (typeof STEPS)[number];

/** What is true of the club and of one member, which is all a step is decided from. */
export interface Facts {
  /** Whether anybody has named and set up the club. */
  readonly club: boolean;
  /** How many events the club has, of any state. Only read for somebody who may build the club. */
  readonly events: number;
  /** Whether they have said what to call them, as opposed to being known by their address. */
  readonly named: boolean;
  /** Whether a chat is linked to their account. */
  readonly chat: boolean;
  /** Null when the club has no season they could join; otherwise whether they are on it. */
  readonly season: boolean | null;
}

export interface Item {
  readonly step: Step;
  readonly done: boolean;
}

/**
 * What a member is asked to do before the club is theirs: a checklist that is worked out, never
 * stored.
 *
 * Whether a step is done is a fact about the club and the member, so it is read from them each
 * time. The previous design kept a second answer, "the first run is over", that only a button
 * could change, and the two never met: a member who had done everything was still told to skip.
 * What *is* stored is the one thing that is not derivable, that somebody said "not now".
 *
 * Who is asked for what is `NEEDS`, an `Action`, and not a role. A second admin joining a club
 * that is already named is asked for nothing about the club because it is already done, and no
 * code anywhere had to know there was a "founder".
 */
export namespace Setup {
  export const ALL = STEPS;

  const NEEDS: Record<Step, Action> = {
    club: 'club:manage',
    event: 'club:manage',
    name: 'profile:write',
    chat: 'profile:write',
    season: 'season:read',
  };

  /** Null is a step that does not apply to this club, which is not the same as one that is done. */
  const DONE: Record<Step, (facts: Facts) => boolean | null> = {
    club: (facts) => facts.club,
    event: (facts) => facts.events > 0,
    name: (facts) => facts.named,
    chat: (facts) => facts.chat,
    season: (facts) => facts.season,
  };

  /** The steps this caller is asked for, in the order a person would do them, each with its state. */
  export function list(can: (action: Action) => boolean, facts: Facts): Item[] {
    return STEPS.filter((step) => can(NEEDS[step])).flatMap((step) => {
      const done = DONE[step](facts);
      return done === null ? [] : [{ step, done }];
    });
  }

  export function left(items: readonly Item[]): number {
    return items.filter((item) => !item.done).length;
  }
}
