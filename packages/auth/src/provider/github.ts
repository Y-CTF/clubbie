import { Club } from '@clubbie/core';
import type { Profile } from '@clubbie/store';
import { GitHub as Arctic } from 'arctic';
import { type Credentials, type Pending, Provider } from '../provider.ts';
import { Rest } from './rest.ts';

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
  /**
   * The api version every call is pinned to. Unpinned requests default to the oldest supported
   * one, so this is the only place the app decides which GitHub it is talking to.
   */
  static readonly VERSION = '2026-03-10';
  /** GitHub wants its own media type and a pinned api version on every call. */
  static readonly HEADERS = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': GitHub.VERSION,
  };

  readonly name = 'github';
  private client: Arctic;

  constructor(credentials: Credentials, redirect: string) {
    this.client = new Arctic(credentials.clientId, Provider.secret('github', credentials), redirect);
  }

  begin(state: string, verifier: string): Pending {
    return { url: this.client.createAuthorizationURL(state, GitHub.SCOPES), state, verifier };
  }

  async finish(code: string): Promise<Profile> {
    const tokens = await this.client.validateAuthorizationCode(code).catch((error: unknown) => {
      throw Rest.exchange(this.name, error);
    });
    const token = tokens.accessToken();

    const user = await this.get<User>('/user', token);
    const emails = await this.get<Email[]>('/user/emails', token);
    const organisations = await this.organisations(token);
    /** An answer that is not a list is a broken provider, not an account without an email. */
    const primary = Array.isArray(emails)
      ? emails.find((entry) => entry.primary && entry.verified)
      : undefined;
    if (!primary) throw Rest.unverified(this.name, user.login);

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
  private async organisations(token: string): Promise<string[]> {
    const listing = await this.get<Organisation[]>('/user/orgs', token).catch(() => []);
    return Array.isArray(listing) ? listing.map((one) => one.login.toLowerCase()) : [];
  }

  private get<T>(path: string, token: string): Promise<T> {
    return Rest.get<T>(this.name, GitHub.API, path, token, GitHub.HEADERS);
  }
}
