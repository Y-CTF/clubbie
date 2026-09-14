import type {
  Act,
  Admission,
  Answer,
  Font,
  Frequency,
  JobKind,
  JobState,
  Palette,
  Role,
  State,
  Status,
  Width,
} from '@clubbie/core';
import type { View } from '../calendar/grid.ts';
import type { Name } from '../router.svelte.ts';

/**
 * Every word the app puts on screen, as one shape.
 *
 * It is an interface rather than a bag of keys because that is what makes a second language
 * possible to finish: a catalogue that is missing a line does not compile, and one that keeps a
 * line nothing renders any more does not either. A string that took an argument in English cannot
 * quietly lose it in German.
 *
 * The domain's own vocabulary is in here too, keyed by the domain's own unions, so a new event
 * kind or a new answer is a compile error in every language until somebody has words for it.
 * Nothing renders an enum value raw: `going` is a value in a column and a word on a page, and only
 * one of the two is translated.
 *
 * Punctuation that separates values (the middle dots between a kind and a room) belongs to the
 * layout and stays in the components. What is here is prose.
 */
export interface Catalogue {
  readonly common: {
    readonly save: string;
    readonly create: string;
    readonly cancel: string;
    readonly add: string;
    readonly new: string;
    readonly edit: string;
    readonly remove: string;
    /** The label of a remove button that has no room for a word: an `×` on a chip. */
    readonly removeOne: (what: string) => string;
    readonly loading: string;
    readonly optional: string;
    /** The second press of a two-press delete, which is the only confirmation the app has. */
    readonly sure: string;
    readonly search: string;
    readonly csv: string;
    readonly copy: string;
    readonly copied: string;
    /** Revealing something that is kept out of sight: a calendar url is a credential. */
    readonly show: string;
    readonly hide: string;
    readonly upload: string;
    readonly clear: string;
    /** Paging through a report that is longer than a screen. */
    readonly back: string;
    readonly forward: string;
    readonly page: (page: number, pages: number) => string;
    /** Between two dates, as in "1 September to 30 June". A word, not punctuation. */
    readonly between: string;
    /** Between two ways of doing the same thing: point at an image, or upload one. */
    readonly or: string;
    /** What a value the club never set reads as, in a report that has a column for it anyway. */
    readonly nothing: string;
    /** Between what something was and what it became, in one line of the trail. */
    readonly became: string;
    /** What goes in a box that wants a web address. */
    readonly url: string;
  };

  /** What a club calls its events is data, so these are the words *around* that list. */
  readonly vocabulary: {
    readonly heading: string;
    readonly hint: string;
    readonly label: string;
    readonly add: string;
    readonly used: (count: number) => string;
    readonly unused: string;
  };

  /** The name of each page, in the nav bar and in the browser's title. */
  readonly pages: Record<Name, string>;

  /** The two refusals the browser writes itself, when the server never got to write one. */
  readonly refused: {
    readonly unreachable: string;
    readonly unknown: (reason: string) => string;
  };

  /**
   * Every question the app asks before it does something that cannot be taken back. They live
   * together rather than beside each act, because a committee that wants to know what this app
   * will double-check reads one section instead of ten.
   *
   * Each is a question and a `Why` saying what is actually lost. The buttons carry verbs, which is
   * what somebody who reads only the buttons needs.
   */
  readonly asks: {
    readonly removeEvent: string;
    readonly removeEventWhy: string;
    readonly removeSchedule: string;
    readonly removeScheduleWhy: string;
    readonly removeKind: (label: string) => string;
    readonly removeKindWhy: string;
    readonly removeGuest: (name: string) => string;
    readonly discardJob: string;
    readonly discardJobWhy: string;
    readonly announce: string;
    readonly announceWhy: string;
    readonly promote: (name: string) => string;
    readonly promoteWhy: string;
    readonly carryOver: (name: string) => string;
    readonly carryOverWhy: string;
    readonly removeSeason: (name: string) => string;
    readonly removeSeasonWhy: string;
    readonly unlink: string;
    readonly unlinkWhy: string;
    readonly role: (name: string) => string;
    readonly roleWhy: string;
    readonly status: (name: string, status: string) => string;
    /** The same two questions, asked about a batch rather than about one person. */
    readonly statusMany: (total: number, status: string) => string;
    readonly roleMany: (total: number, role: string) => string;
  };

  readonly shell: {
    readonly signOut: string;
    readonly waiting: string;
    readonly waitingWhy: string;
    readonly adminOnly: string;
  };

  readonly signIn: {
    readonly tagline: string;
    readonly continueWith: (provider: string) => string;
    /** For somebody who is already signed in: the way on, rather than the way in. */
    readonly enter: string;
    readonly noProvider: string;
    readonly noProviderHelp: string;
    readonly signedInAs: (name: string) => string;
    readonly upcoming: string;
    /** Signing in with an address alone: the form, the code box, and what it says back. */
    readonly email: {
      readonly label: string;
      readonly hint: string;
      readonly send: string;
      readonly sending: string;
      readonly sent: (email: string) => string;
      readonly code: string;
      readonly codeHint: string;
      readonly verify: string;
      readonly again: string;
      readonly other: string;
    };
  };

  readonly events: {
    readonly going: (count: number) => string;
    readonly waiting: (count: number) => string;
    readonly places: (taken: number, capacity: number) => string;
    readonly closed: string;
    readonly empty: string;
    readonly emptyOrganiser: string;
    readonly noMatch: (term: string) => string;
    readonly find: string;
  };

  /** The grid itself: how it is moved, what its parts are called, and where an event goes next. */
  readonly calendar: {
    readonly views: Record<View, string>;
    readonly today: string;
    readonly previous: string;
    readonly next: string;
    /** The tail of a day cell that could not hold everything on it. */
    readonly more: (count: number) => string;
    /** The row above the grid, where anything crossing a midnight is drawn. */
    readonly spanning: string;
    /** What an empty stretch of a day offers, said for a screen reader rather than on screen. */
    readonly add: (when: string) => string;
    readonly details: string;
    /** The way from one night to the rule that produced it. */
    readonly series: string;
    readonly repeats: string;
    readonly subscribe: string;
    readonly everyKind: string;
    readonly addTo: string;
    /** The hint on a control that also has a key: `week (w)`. */
    readonly shortcut: (name: string, key: string) => string;
  };

  readonly event: {
    readonly attendance: string;
    readonly closes: (when: string) => string;
    readonly closed: string;
    readonly taken: (taken: number, capacity: number) => string;
    readonly waiting: (count: number) => string;
    readonly withdraw: string;
    readonly announce: string;
    readonly answers: string;
    readonly counts: (going: number, maybe: number, waiting: number, attended: number) => string;
    readonly attended: string;
    readonly guest: string;
  };

  readonly compose: {
    readonly heading: (editing: boolean) => string;
    /** The same form over a rule rather than over one night. */
    readonly repeatHeading: (editing: boolean) => string;
    /** What an occurrence says about where it came from, and the way to it. */
    readonly partOf: string;
    readonly editSeries: string;
    readonly first: string;
    readonly title: string;
    readonly description: string;
    readonly descriptionHint: string;
    readonly kind: string;
    readonly state: string;
    readonly stateHint: string;
    readonly starts: string;
    readonly ends: string;
    readonly closes: string;
    readonly closesHint: string;
    readonly capacity: string;
    readonly capacityHint: string;
    readonly location: string;
    readonly listed: string;
  };

  readonly sheet: {
    readonly heading: string;
    readonly counts: (attended: number, going: number, guests: number) => string;
    readonly filter: string;
    readonly filterHint: string;
    readonly present: string;
    readonly markPresent: string;
    readonly addGuest: string;
    readonly guestName: string;
    readonly guestHint: string;
  };

  readonly members: {
    readonly filterAll: string;
    readonly count: (total: number) => string;
    /** How many have signed in and are waiting for somebody to let them in. */
    readonly waiting: (total: number) => string;
    readonly you: string;
    /** The bulk bar: how many are picked, and the labels of the two ways to pick. */
    readonly picked: (total: number) => string;
    readonly pickAll: string;
    readonly pick: (name: string) => string;
    /** Labels for the two menus on a row, which have no visible label of their own. */
    readonly status: (name: string) => string;
    readonly role: (name: string) => string;
    readonly empty: string;
    readonly find: string;
  };

  readonly member: {
    readonly since: (when: string) => string;
    readonly history: string;
    readonly ratio: (attended: number, answered: number) => string;
    readonly empty: string;
  };

  readonly seasons: {
    /** The strip that asks a member to renew, which is the only place most of them meet a season. */
    readonly renew: (season: string) => string;
    readonly renewBy: (when: string) => string;
    readonly renewNow: string;
    /** What a roster says about the member reading it, and how many people are on it. */
    readonly mine: string;
    readonly count: (total: number) => string;
    readonly name: string;
    readonly nameHint: string;
    readonly starts: string;
    readonly ends: string;
    readonly renewals: string;
    readonly createCurrent: string;
    readonly current: string;
    readonly join: string;
    readonly makeCurrent: string;
    readonly carryOver: string;
    readonly empty: string;
  };

  /** What is left of a repeat once the form that writes one is the form that writes an event. */
  readonly schedules: {
    readonly repeats: string;
    /** The answer to "does this happen again" that means no. */
    readonly once: string;
    readonly interval: string;
    readonly intervalHint: string;
    readonly count: string;
    readonly countHint: string;
    /**
     * The whole rule as one phrase, in one language's own word order. It takes the frequency
     * rather than a translated word because "every 2 weeks" is not "every" plus "weekly" in any
     * language but English: German needs a plural noun after `alle`, and so does French.
     */
    readonly rule: (interval: number, freq: Frequency, count: number | null) => string;
    readonly next: (dates: string) => string;
    readonly nothingNext: string;
    readonly fill: string;
    readonly empty: string;
    /** What editing the rule of a schedule costs, said before it is done and after. */
    readonly retimes: string;
    readonly cost: (updated: number, dropped: number, created: number) => string;
  };

  /** The design page: what a committee may change about how its own site looks. */
  readonly design: {
    readonly heading: string;
    readonly hint: string;
    readonly accent: string;
    readonly accentHint: string;
    readonly paper: string;
    readonly paperHint: string;
    readonly paperAuto: string;
    readonly palette: string;
    readonly font: string;
    readonly display: string;
    readonly displayHint: string;
    readonly width: string;
    readonly scale: string;
    readonly scaleHint: string;
    readonly corner: string;
    readonly cornerHint: string;
    readonly space: string;
    readonly spaceHint: string;
    readonly hue: string;
    readonly hueHint: string;
    readonly tint: string;
    readonly tintHint: string;
    readonly motion: string;
    readonly footer: string;
    readonly footerHint: string;
    readonly links: string;
    readonly linksHint: string;
    readonly linkLabel: string;
    readonly linkUrl: string;
    readonly logo: string;
    readonly logoHint: string;
    readonly banner: string;
    readonly bannerHint: string;
    readonly blurb: string;
    readonly blurbHint: string;
    readonly image: string;
    readonly imageHint: (limit: string) => string;
    readonly uploading: string;
    readonly preview: string;
  };

  /** What each design choice is called. Names, because the values are names. */
  readonly palettes: Record<Palette, string>;
  readonly fonts: Record<Font, string>;
  readonly widths: Record<Width, string>;

  /** Who may sign in at all, which for a university society is a real question. */
  readonly access: {
    readonly heading: string;
    readonly hint: string;
    readonly organisations: string;
    readonly organisationsHint: string;
    readonly everybody: string;
    readonly add: string;
    /** What to type: a domain for the domains, and a qualified organisation for the organisations. */
    readonly example: string;
    readonly exampleOrganisation: string;
    readonly admission: string;
    readonly admissionHint: string;
    readonly domains: string;
    readonly domainsHint: string;
    readonly allowed: string;
    readonly allowedHint: string;
    readonly blocked: string;
    readonly blockedHint: string;
    readonly providers: string;
    readonly providersHint: string;
    readonly anyProvider: string;
    readonly address: string;
  };

  /** How an evening runs, before any one event says otherwise. */
  readonly rules: {
    readonly heading: string;
    readonly hint: string;
    readonly deadline: string;
    readonly deadlineHint: string;
    readonly remind: string;
    readonly remindHint: string;
    readonly guests: string;
    readonly waitlist: string;
  };

  /** What each way of admitting somebody is called. */
  readonly admissions: Record<Admission, string>;

  readonly settings: {
    readonly name: string;
    readonly tagline: string;
    readonly taglineHint: string;
    readonly colour: string;
    readonly colourHint: string;
    readonly logo: string;
    readonly logoHint: string;
    readonly language: string;
    readonly languageHint: string;
    readonly languageAuto: string;
    readonly timezone: string;
    readonly timezoneHint: string;
    /** A zone spelled the way IANA spells one, in the box that wants one. */
    readonly timezoneExample: string;
    readonly listed: string;
    readonly trail: string;
    readonly trailEmpty: string;
    /** The report at the foot of the settings page: what an organiser changed, and when. */
    readonly trailHint: string;
    readonly filterAct: string;
    readonly everyAct: string;
    readonly entries: (total: number) => string;
    /** Who an entry names when nobody did it: a reminder the scheduler sent on its own. */
    readonly byTheApp: string;
  };

  /**
   * The queue: what the app owes itself, and what an admin may do about it. It is its own section
   * rather than part of the settings because it is its own page, and because none of it is a
   * setting: it is a report that moves.
   */
  readonly queue: {
    readonly hint: string;
    /** Where a job is in its life. Its own list: an event's states are a different vocabulary. */
    readonly states: Record<JobState, string>;
    readonly empty: string;
    /** The filter, which is the tally: how much work is in each state, and one chip for all of it. */
    readonly every: string;
    readonly everyKind: string;
    readonly filterKind: string;
    readonly counted: (total: number) => string;
    /** Whether the page is watching the queue or holding still while somebody reads it. */
    readonly live: string;
    readonly paused: string;
    readonly refresh: string;
    readonly attempts: (count: number) => string;
    /** When a job is due, has been claimed, or was made. Relative: the page is read as it happens. */
    readonly due: (when: string) => string;
    readonly overdue: (when: string) => string;
    readonly held: (when: string) => string;
    readonly queued: (when: string) => string;
    /** Putting a job back: the same act, worded for the state it is in. */
    readonly retry: string;
    readonly now: string;
    readonly discard: string;
    /** Why nothing can be done to a job a drainer is holding. */
    readonly busy: string;
  };

  readonly profile: {
    readonly name: string;
    readonly email: string;
    readonly role: string;
    readonly since: string;
    readonly hide: string;
    readonly show: string;
    readonly notices: string;
    readonly always: string;
    readonly announcements: string;
    readonly reminders: string;
    readonly reachTelegram: string;
    readonly reachEmail: string;
    readonly calendar: string;
    readonly calendarWhat: string;
    readonly calendarWarning: string;
    readonly telegramHeading: string;
    readonly linked: (username: string | null, when: string) => string;
    readonly unlink: string;
    readonly linkStep: (expires: string) => string;
    readonly linkSend: string;
    readonly getCode: string;
  };

  /**
   * The domain's vocabulary, keyed by its unions, so a new value is a compile error here first.
   *
   * What an event *is* is deliberately not in here. That list belongs to the club, is edited on
   * the settings page, and is read from `kinds.svelte.ts`: this app does not get to decide that a
   * choir holds workshops.
   */
  readonly states: Record<State, string>;
  readonly answers: Record<Answer, string>;
  readonly statuses: Record<Status, string>;
  readonly roles: Record<Role, string>;
  readonly frequencies: Record<Frequency, string>;
  readonly acts: Record<Act, string>;
  readonly jobs: Record<JobKind, string>;
}
