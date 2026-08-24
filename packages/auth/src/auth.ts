import { Brand, Club, type Member, Site } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { Profile, Session, Store } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { generateCodeVerifier, generateState } from 'arctic';
import { Codes } from './codes.ts';
import { type Credentials, type Pending, Provider } from './provider.ts';
import { type Named, Providers } from './registry.ts';
import { type Minted, Token } from './session.ts';

/** A live session, and whether resolving it pushed its expiry out (so the cookie needs the news). */
export interface Resolved extends Session {
  readonly renewed: boolean;
}

export interface Config {
  readonly baseUrl: string;
  /** What each provider was configured with, keyed by the registry's own names. */
  readonly providers: Partial<Record<Named, Partial<Credentials>>>;
}

/**
 * Sign-in, from the redirect out to the session it produces. Everything here is transport
 * neutral: it hands back a url, a token and an expiry, and the HTTP layer decides what a cookie
 * looks like. That is what lets the bot and the API share one notion of a session.
 */
export class Auth {
  /** Where a provider sends someone back. The API mounts exactly this path. */
  static callback(base: string, provider: string): string {
    return new URL(`${Site.API}/auth/${provider}/callback`, base).toString();
  }

  private constructor(
    private readonly store: Store,
    private readonly providers: Map<string, Provider>,
  ) {}

  /** Builds every provider the config supplied credentials for, and no others. */
  static create(store: Store, config: Config): Auth {
    const providers = new Map<string, Provider>();

    for (const name of Providers.NAMES) {
      const credentials = config.providers[name] ?? {};
      if (!Provider.configured(credentials)) continue;
      providers.set(name, Providers.spec(name).make(credentials, Auth.callback(config.baseUrl, name)));
    }

    return new Auth(store, providers);
  }

  /** The providers a deployment actually offers, which is what the sign-in page renders. */
  get names(): string[] {
    return [...this.providers.keys()];
  }

  get empty(): boolean {
    return this.providers.size === 0;
  }

  /**
   * Starts a flow. The state and verifier travel back with the caller and must be kept somewhere
   * the browser cannot forge; the API puts them in a signed, short-lived cookie.
   */
  async begin(name: string): Promise<Pending> {
    return this.provider(name).begin(generateState(), generateCodeVerifier());
  }

  /**
   * Finishes a flow: the profile becomes a member (created on first sign-in), and the member gets
   * a session. The caller has already checked that the returned state matches the one it stored.
   */
  async complete(name: string, code: string, verifier: string): Promise<{ member: Member } & Minted> {
    const profile = await this.provider(name).finish(code, verifier);
    const club = await this.store.club.read();
    this.admissible(profile, club);

    /** A club with an open door has no waiting room: a first sign-in is a member straight away. */
    const member = await this.store.members.enroll(profile, new Date(), Club.admits(club.admission));
    const minted = await Token.mint();
    await this.store.sessions.open(minted.digest, member.id, minted.expiresAt);
    return { member, ...minted };
  }

  /**
   * Whether a club that has said something about who may join will have this identity.
   *
   * The check is here rather than at the route because this is the one place a sign-in becomes a
   * member: a second entry point that forgot it would create the row the club said it did not
   * want. What the door actually is belongs to `Club`, which is where an admin edits it; this
   * turns the verdict into the sentence a stranger reads.
   *
   * A provider that releases no organisation cannot satisfy a list of them, and is refused rather
   * than waved past: a club that named its organisations said something about who may join, and
   * "we could not tell" is not a yes. The address's own domain is a second way to say yes, for the
   * provider that has no opinion about organisations at all.
   */
  private admissible(profile: Profile, club: Club): void {
    const refusal = club.refuses({ ...profile, organisation: profile.organisation ?? null });
    if (refusal === null) return;

    const home = profile.organisation?.toLowerCase() ?? null;
    /** Named rather than qualified: `ethz.ch` is what a member calls it, `eduid:ethz.ch` is not. */
    const doors = [...club.organisations.map(Club.named), ...club.domains].join(', ');

    if (refusal === 'blocked') {
      throw Diag.error(Codes.organisation, markup`${profile.email} may not sign in here`)
        .note('this address is on the club\u2019s own list of addresses it does not admit')
        .help('ask an organiser if you think that is a mistake');
    }

    if (refusal === 'provider') {
      throw Diag.error(Codes.provider, markup`this club does not sign in with *${profile.provider}*`)
        .note(markup`it accepts ${club.providers.join(', ')}`)
        .help('go back and pick the other way in');
    }

    throw Diag.error(Codes.organisation, markup`this club is for members of ${doors}`)
      .note(
        home
          ? markup`${profile.email} signed in from ${home}`
          : markup`${profile.email} signed in with a provider that does not say which institution it is`,
      )
      .help('sign in with an account that belongs to one of them, or ask an organiser to admit you');
  }

  /**
   * Who a token belongs to, renewing it when it is more than halfway through its life.
   *
   * The window slides rather than the session simply expiring: a member who uses the club app
   * every week is never signed out by the clock, and one who disappears for a month still is. The
   * halfway rule is what keeps that from being a write on every single request.
   */
  async resolve(token: string, now: Date = new Date()): Promise<Resolved | null> {
    const digest = await Token.digest(token);
    const session = await this.store.sessions.resolve(digest, now);
    if (!session) return null;

    if (!Token.stale(session.expiresAt, now)) return { ...session, renewed: false };

    const expiresAt = new Date(now.getTime() + Token.TTL);
    await this.store.sessions.renew(digest, expiresAt);
    return { ...session, expiresAt, renewed: true };
  }

  async signOut(token: string): Promise<void> {
    await this.store.sessions.close(await Token.digest(token));
  }

  private provider(name: string): Provider {
    const provider = this.providers.get(name);
    if (provider) return provider;

    throw Diag.error(Codes.provider, markup`\`${name}\` is not a sign-in provider here`)
      .note(markup`configured: ${this.names.join(', ') || 'none'}`)
      .help(markup`set its credentials in the environment, then restart \`${Brand.cli}\``);
  }
}
