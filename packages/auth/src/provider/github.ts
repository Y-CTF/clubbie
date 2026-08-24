import { Brand, Club } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { Profile } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { GitHub as Arctic } from 'arctic';
import { Codes } from '../codes.ts';
import type { Credentials, Pending, Provider } from '../provider.ts';

interface User {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

interface Email {
  email: string;
  primary: boolean;
  verified: boolean;
}

interface Organisation {
  login: string;
}

/**
 * GitHub is OAuth2 without OIDC, so the profile comes from the API rather than an id token, and
 * the email needs a second call: the user object carries whatever the account made public, which
 * may be nothing or may be unverified. Only a verified primary address identifies a person here,
 * because `enroll` merges accounts on email.
 *
 * The organisations come from a third call, and they are what lets a club whose members are a
 * GitHub organisation put its own name in `Club.organisations` and have the door mean something.
 * eduID answers the same question with one academic domain; GitHub answers it with a list, because
 * an account belongs to as many organisations as it likes.
 */
export class GitHub implements Provider {
  static readonly API = 'https://api.github.com';
  /**
   * `read:org` is what makes a private membership visible. Without it the answer is only the
   * organisations the account has made public, and a member of a private organisation would be
   * refused at a door they are actually behind.
   */
  static readonly SCOPES = ['read:user', 'user:email', 'read:org'];
  static readonly VERSION = '2022-11-28';

  readonly name = 'github';
  private client: Arctic;

  constructor(credentials: Credentials, redirect: string) {
    this.client = new Arctic(credentials.clientId, credentials.clientSecret, redirect);
  }

  begin(state: string, verifier: string): Pending {
    return { url: this.client.createAuthorizationURL(state, GitHub.SCOPES), state, verifier };
  }

  async finish(code: string): Promise<Profile> {
    const tokens = await this.client.validateAuthorizationCode(code).catch((error: unknown) => {
      throw Diag.error(Codes.exchange, markup`*github* would not exchange the sign-in code`)
        .note(markup`it said: ${error instanceof Error ? error.message : String(error)}`)
        .help('start again from the sign-in page; a code is only good once and only for minutes');
    });
    const token = tokens.accessToken();

    const user = await GitHub.get<User>('/user', token);
    const emails = await GitHub.get<Email[]>('/user/emails', token);
    const organisations = await GitHub.organisations(token);
    /** An answer that is not a list is a broken provider, not an account without an email. */
    const primary = Array.isArray(emails)
      ? emails.find((entry) => entry.primary && entry.verified)
      : undefined;
    if (!primary) {
      throw Diag.error(Codes.unverified, markup`*github* has no verified primary email for ${user.login}`)
        .note('an unverified address cannot identify a member: it would merge two people into one')
        .help('verify your primary address on github, then sign in again');
    }

    return {
      provider: this.name,
      subject: String(user.id),
      email: primary.email.toLowerCase(),
      name: user.name ?? user.login,
      avatar: user.avatar_url,
      /** The row keeps one plain name, and the door is given all of them, qualified. */
      organisation: organisations[0] ?? null,
      organisations: organisations.map((login) => Club.organisation(this.name, login)),
    };
  }

  /**
   * The organisations an account belongs to, lowercased.
   *
   * A failure here is not a failed sign-in. An account that granted the scope and then left the
   * one organisation the club named is refused by the door, which is correct; an account whose
   * organisation list could not be read is a member of nothing as far as this app can tell, and
   * saying so is better than refusing somebody a sign-in because GitHub had a bad minute. A club
   * that names no organisation never notices either way.
   */
  private static async organisations(token: string): Promise<string[]> {
    const listing = await GitHub.get<Organisation[]>('/user/orgs', token).catch(() => []);
    return Array.isArray(listing) ? listing.map((one) => one.login.toLowerCase()) : [];
  }

  private static async get<T>(path: string, token: string): Promise<T> {
    const response = await fetch(GitHub.API + path, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': GitHub.VERSION,
        'user-agent': Brand.agent,
      },
    });
    if (response.ok) return (await response.json()) as T;

    throw Diag.error(Codes.profile, markup`*github* refused to describe the account`)
      .note(markup`${path} answered ${response.status}`)
      .help("sign in again; if it keeps happening the app's github credentials may be revoked");
  }
}
