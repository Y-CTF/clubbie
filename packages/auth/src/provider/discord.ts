import { Club } from '@clubbie/core';
import type { Profile } from '@clubbie/store';
import { Discord as Arctic } from 'arctic';
import { type Credentials, type Pending, Provider } from '../provider.ts';
import { Rest } from './rest.ts';

interface User {
  id: string;
  username: string;
  global_name: string | null;
  email: string | null;
  verified?: boolean;
  avatar: string | null;
}

interface Guild {
  id: string;
  name: string;
}

/**
 * Discord, which is OAuth2 without OIDC, so the profile is a call to its API like GitHub's.
 *
 * The guilds are the point of it for a club: a club that already lives in a Discord server names
 * that server in `Club.organisations` and the door means something, the same way a university
 * society names an eduID institution. A guild is listed by its id rather than its name, because a
 * name is retyped on a whim and two servers may share one, while an id is the thing Discord
 * actually promises is that server. It is also what `Club.ORGANISATION` accepts: a guild called
 * "Y-CTF Members" is not a valid entry and its id is.
 */
export class Discord implements Provider {
  static readonly API = 'https://discord.com/api/v10';
  /**
   * `identify` and `email` are the account; `guilds` is which servers it is in. A deployment that
   * does not want the last one still asks for it, because the club that turns the door on later
   * would otherwise have to re-authorise every member to make it work.
   */
  static readonly SCOPES = ['identify', 'email', 'guilds'];
  static readonly CDN = 'https://cdn.discordapp.com';

  readonly name = 'discord';
  private client: Arctic;

  constructor(credentials: Credentials, redirect: string) {
    this.client = new Arctic(credentials.clientId, Provider.secret('discord', credentials), redirect);
  }

  /** Discord takes PKCE, and arctic takes the verifier it was handed rather than making one. */
  begin(state: string, verifier: string): Pending {
    return { url: this.client.createAuthorizationURL(state, verifier, Discord.SCOPES), state, verifier };
  }

  async finish(code: string, verifier: string): Promise<Profile> {
    const tokens = await this.client.validateAuthorizationCode(code, verifier).catch((error: unknown) => {
      throw Rest.exchange(this.name, error);
    });
    const token = tokens.accessToken();

    const user = await this.get<User>('/users/@me', token);
    const guilds = await this.guilds(token);
    /**
     * An account may exist with no address at all, and an unverified one cannot identify anybody:
     * `enroll` merges two identities that carry the same address into one member.
     */
    if (!user.email || user.verified === false) throw Rest.unverified(this.name, user.username);

    return {
      provider: this.name,
      subject: user.id,
      email: user.email.toLowerCase(),
      name: user.global_name ?? user.username,
      avatar: Discord.avatar(user),
      /** The row keeps a name somebody recognises, and the door is given the ids. */
      organisation: guilds[0]?.name ?? null,
      organisations: guilds.map((guild) => Club.organisation(this.name, guild.id)),
    };
  }

  /**
   * The servers an account is in.
   *
   * Failing to read them is not a failed sign-in, for the reason GitHub's list is not either: a
   * club that names no server never notices, and one that does would rather refuse at its own
   * door than have Discord's bad minute refuse a sign-in outright.
   */
  private async guilds(token: string): Promise<Guild[]> {
    const listing = await this.get<Guild[]>('/users/@me/guilds', token).catch(() => []);
    return Array.isArray(listing) ? listing : [];
  }

  /** An avatar is a hash, and the url around it is Discord's to spell. */
  private static avatar(user: User): string | null {
    return user.avatar ? `${Discord.CDN}/avatars/${user.id}/${user.avatar}.png` : null;
  }

  private get<T>(path: string, token: string): Promise<T> {
    return Rest.get<T>(this.name, Discord.API, path, token);
  }
}
