import { Brand } from './brand.ts';
import { Design } from './design.ts';
import type { Language } from './locale.ts';
import { Member, type Status } from './member.ts';

/**
 * What happens to somebody who has just signed in for the first time.
 *
 * `review` is the careful default: they wait, and an organiser lets them in. `open` is for a club
 * whose door is already guarded by something else, which is usually `organisations`: if only
 * members of one university can sign in at all, making each of them wait for a click is ceremony
 * rather than a decision.
 */
export const ADMISSIONS = ['review', 'open'] as const;
export type Admission = (typeof ADMISSIONS)[number];

/**
 * Why a sign-in was turned away, which is what the message a stranger reads is written from.
 *
 * A table rather than a hand-written union, so the one caller can branch over it exhaustively: it
 * used to compare bare literals with a fall-through, and a fourth reason would have been rendered
 * as "wrong organisation" with nothing failing to compile.
 *
 * It is `Denial` rather than `Refusal` because the API's `Refusal` is a different thing entirely,
 * and the two were one word apart in a codebase that has both.
 */
export const DENIALS = ['blocked', 'provider', 'organisation'] as const;
export type Denial = (typeof DENIALS)[number];

export interface ClubFields {
  readonly name: string;
  readonly tagline: string | null;
  readonly logo: string | null;
  /** How the site looks. Everything in it is the committee's to change, from the settings page. */
  readonly design: Design;
  /** Whether the next few published events are readable without signing in. */
  readonly listed: boolean;
  /** The language every page and every notice is written in. Null is English, by `Locale`. */
  readonly locale: Language | null;
  /** The IANA zone a repeating event keeps its wall clock in. Null is the runtime's own. */
  readonly timezone: string | null;
  /**
   * Which organisations may sign in, each qualified by the provider that names it: `eduid:ethz.ch`
   * is a university and `github:acme` is a GitHub organisation. Empty is everybody, which is what a
   * club that has not thought about it wants; a list is what a university society needs to stop the
   * whole federation joining.
   */
  readonly organisations: readonly string[];
  /**
   * Email domains that may join, whatever provider the address came from. `organisations` asks
   * the identity provider which institution somebody belongs to, which only eduID answers; this
   * asks the address itself, which every provider has. Either list satisfies the door.
   */
  readonly domains: readonly string[];
  /** Addresses that are always let in, whatever the lists above say. An invitation, in effect. */
  readonly allowed: readonly string[];
  /** Addresses that are never let in, whatever anything else says. Checked first. */
  readonly blocked: readonly string[];
  /**
   * Which sign-in providers this club accepts. Empty is every provider the deployment configured,
   * which is what a club that has not thought about it wants; naming one is how a university
   * society says "eduID or nothing" without the operator having to unconfigure GitHub.
   */
  readonly providers: readonly string[];
  /** Whether a new arrival waits for an organiser, or is a member the moment they sign in. */
  readonly admission: Admission;
  /** How many hours before an event answers close, when the event does not say for itself. */
  readonly deadline: number;
  /** How many hours before an event its reminder goes out. */
  readonly remind: number;
  /** Whether an organiser may put somebody who is not a member on the list at all. */
  readonly guests: boolean;
  /** Whether a full event keeps a queue, or simply refuses. */
  readonly waitlist: boolean;
  readonly updatedAt: Date;
}

/** The fields are declared once, in `ClubFields`; the class carries them by declaration merging. */
export interface Club extends ClubFields {}

/**
 * The club a deployment is for. One row, because one deployment is one club: a second club is a
 * second copy of the binary and the file, which is the whole reason this app fits on a laptop.
 *
 * It is stored rather than configured because a committee changes its name and its colour without
 * having a shell.
 */
export class Club {
  /** The primary key of the only row, so no query ever needs a where clause it could get wrong. */
  static readonly ROW = 'club';
  /** How many events the public page shows, which is a shop window and not an archive. */
  static readonly WINDOW = 5;
  static readonly ADMISSIONS = ADMISSIONS;
  /**
   * What an entry in `domains` looks like: a domain, lowercased, no scheme and no path.
   *
   * It lives here rather than in the API's schemas because the settings page checks it too, and a
   * browser that accepts what the server refuses is a form that fails on save for a reason the
   * member cannot see from the field they typed into.
   */
  static readonly DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
  /**
   * What separates the provider that names an organisation from the organisation's own name.
   *
   * An entry is `eduid:ethz.ch` or `github:acme`, and never a bare name. Bare names were the
   * hole this closes: two providers name organisations in namespaces of their own, a club listing
   * one of them meant "anybody whose provider says this", and somebody who could create an
   * organisation in the *other* namespace with the same name walked through a door that was
   * written for a university. Qualifying it makes each entry say whose organisation it is.
   */
  static readonly QUALIFIER = ':';
  /** What an entry in `organisations` looks like: a provider, the qualifier, and a name. */
  static readonly ORGANISATION =
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?:[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

  /** One organisation, as a club lists it and as a provider hands it over. */
  static organisation(provider: string, name: string): string {
    return `${provider}${Club.QUALIFIER}${name}`.toLowerCase();
  }

  /** The name inside a qualified entry, for a sentence a stranger reads rather than a comparison. */
  static named(entry: string): string {
    return entry.slice(entry.indexOf(Club.QUALIFIER) + 1);
  }
  /** What a club that has not thought about it does: nobody joins without being let in. */
  static readonly ADMISSION: Admission = 'review';
  /** Answers close when the event starts, unless a club says how long before. */
  static readonly DEADLINE = 0;
  /** The evening before, for a club evening. */
  static readonly REMIND = 24;
  /** Both on: a club that wants neither turns them off, and knows it did. */
  static readonly GUESTS = true;
  static readonly WAITLIST = true;
  /** The bounds of the two hour counts, which the settings page offers as sliders. */
  static readonly HOURS = { min: 0, max: 336, step: 1, value: Club.REMIND };

  /** What status a first sign-in is written with, which is the whole of what `admission` means. */
  static admits(admission: Admission): Status {
    return admission === 'open' ? Member.ACTIVE : Member.INITIAL;
  }

  /**
   * Whether this identity may sign in, and why not when it may not.
   *
   * One place decides, because "who may join" is now four lists and a provider name, and a second
   * implementation of that in a route is how a club that thought it had closed its door finds out
   * it had not. The order is the interesting part: a blocked address is refused before anything
   * else can allow it, and an allowed address is admitted before anything else can refuse it.
   */
  refuses(profile: {
    email: string;
    /**
     * Every organisation the provider named, qualified by it: `eduid:ethz.ch`, `github:acme`. It is
     * the only thing `organisations` is compared against, so a provider that hands over bare names
     * satisfies no list at all, which is the safe way for this to be wrong.
     */
    organisations?: readonly string[] | undefined;
    provider: string;
  }): Denial | null {
    const email = profile.email.trim().toLowerCase();
    const domain = email.split('@')[1] ?? '';

    if (this.blocked.includes(email)) return 'blocked';
    if (this.allowed.includes(email)) return null;

    if (this.providers.length > 0 && !this.providers.includes(profile.provider)) return 'provider';

    /** Either list satisfies the door; a club with neither has no door. */
    if (this.organisations.length === 0 && this.domains.length === 0) return null;

    /**
     * Any organisation the identity belongs to opens the door. A GitHub account is in several and
     * a club names one of them; asking only about the first would refuse a member for the order
     * GitHub happened to answer in.
     */
    const homes = (profile.organisations ?? []).map((one) => one.trim().toLowerCase()).filter(Boolean);

    if (homes.some((home) => this.organisations.includes(home))) return null;
    if (this.domains.includes(domain)) return null;

    return 'organisation';
  }

  /** A stored value that is not one of ours reads as the careful default rather than throwing. */
  static admission(value: string): Admission {
    return (ADMISSIONS as readonly string[]).includes(value) ? (value as Admission) : Club.ADMISSION;
  }

  constructor(fields: ClubFields) {
    Object.assign(this, fields);
  }

  /** What a club is before anybody has edited it, so the first page load is never empty. */
  static default(now: Date = new Date()): Club {
    return new Club({
      name: Brand.STEM,
      tagline: null,
      logo: null,
      design: Design.default(),
      listed: false,
      locale: null,
      timezone: null,
      organisations: [],
      domains: [],
      allowed: [],
      blocked: [],
      providers: [],
      admission: Club.ADMISSION,
      deadline: Club.DEADLINE,
      remind: Club.REMIND,
      guests: Club.GUESTS,
      waitlist: Club.WAITLIST,
      updatedAt: now,
    });
  }
}
