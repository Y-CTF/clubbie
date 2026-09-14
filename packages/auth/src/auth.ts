import { Brand, Club, type Member, Site } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { Profile, Session, Store } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { generateCodeVerifier, generateState } from 'arctic';
import { Codes } from './codes.ts';
import { Address } from './provider/address.ts';
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
  /** Whether mail can be sent, since an address nothing can write to is not a way in. */
  readonly email?: boolean | undefined;
}

/**
 * Sign-in, from the redirect out to the session it produces. Everything here is transport
 * neutral: it hands back a url, a token and an expiry, and the HTTP layer decides what a cookie
 * looks like. That is what lets the bot and the API share one notion of a session.
 */
export class Auth {
  /** Where a provider sends someone back. The API mounts exactly this path. */
  static callback(base: string, provider: string): string {
    return new URL(Site.Api.callback(provider), base).toString();
  }

  private constructor(
    private readonly store: Store,
    private readonly providers: Map<string, Provider>,
    /** Signing in by address, when the deployment can send mail. */
    readonly address: Address | null,
  ) {}

  /** Builds every provider the config supplied credentials for, and no others. */
  static create(store: Store, config: Config): Auth {
    const providers = new Map<string, Provider>();

    for (const name of Providers.NAMES) {
      const credentials = config.providers[name] ?? {};
      if (!Provider.configured(credentials)) continue;
      providers.set(name, Providers.spec(name).make(credentials, Auth.callback(config.baseUrl, name)));
    }

    return new Auth(store, providers, config.email ? new Address(store) : null);
  }

  /** The providers a deployment actually offers, which is what the sign-in page renders. */
  get names(): string[] {
    return [...this.providers.keys(), ...(this.address ? [this.address.name] : [])];
  }

  get empty(): boolean {
    return this.names.length === 0;
  }

  /** Signing in by address, or a refusal saying this deployment cannot. */
  get mail(): Address {
    if (this.address) return this.address;

    throw Diag.error(Codes.provider, 'this club cannot sign anybody in by email')
      .note('no mail transport is configured, so it has no way to prove an address')
      .help(markup`set the email variables, then restart \`${Brand.cli}\``);
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
    return this.admit(await this.provider(name).finish(code, verifier));
  }

  /**
   * An identity, whoever proved it, as a member with a session.
   *
   * Every way in ends here: the redirect providers, and the address that proves itself. The door
   * and the enrolment are checked once, in one place, because a second entry point that forgot
   * either would create exactly the member a club said it did not want.
   */
  async admit(profile: Profile, now: Date = new Date()): Promise<{ member: Member } & Minted> {
    const club = await this.store.club.read();
    this.admissible(profile, club);

    /** A club with an open door has no waiting room: a first sign-in is a member straight away. */
    const member = await this.store.members.enroll(profile, now, Club.admits(club.admission));
    const minted = await Token.mint(now);
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
    const denial = club.refuses(profile);
    if (denial === null) return;

    const home = profile.organisation?.toLowerCase() ?? null;
    /** Named rather than qualified: `ethz.ch` is what a member calls it, `eduid:ethz.ch` is not. */
    const doors = [...club.organisations.map(Club.named), ...club.domains].join(', ');

    /** No default: a reason added to `DENIALS` and not answered here fails to compile. */
    switch (denial) {
      case 'blocked':
        throw Diag.error(Codes.organisation, markup`${profile.email} may not sign in here`)
          .note('this address is on the club\u2019s own list of addresses it does not admit')
          .help('ask an organiser if you think that is a mistake');

      case 'provider':
        throw Diag.error(Codes.provider, markup`this club does not sign in with *${profile.provider}*`)
          .note(markup`it accepts ${club.providers.join(', ')}`)
          .help('go back and pick the other way in');

      case 'organisation':
        throw Diag.error(Codes.organisation, markup`this club is for members of ${doors}`)
          .note(
            home
              ? markup`${profile.email} signed in from ${home}`
              : markup`${profile.email} signed in with a provider that does not name an institution`,
          )
          .help('sign in with an account that belongs to one of them, or ask an organiser to admit you');
    }
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
