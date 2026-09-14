import { Brand, Net } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import { Codes } from '../codes.ts';

/**
 * What every OAuth2 provider that is not OIDC has to do: ask its own API who just signed in.
 *
 * It is here rather than in each provider because the three things they share (send the token,
 * insist on JSON, turn a bad status into a diagnostic naming the provider) are exactly the three
 * that must not drift, and the only difference between them is which path they ask for. The two
 * refusals below are shared for the same reason: a member reads the same sentence whichever
 * provider let them down.
 */
export namespace Rest {
  export async function get<T>(
    provider: string,
    base: string,
    path: string,
    token: string,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const response = await fetch(base + path, {
      signal: Net.patience(),
      headers: {
        authorization: `Bearer ${token}`,
        accept: Net.TYPE,
        'user-agent': Brand.agent,
        ...headers,
      },
    });
    if (response.ok) return (await response.json()) as T;

    throw Diag.error(Codes.profile, markup`*${provider}* refused to describe the account`)
      .note(markup`${path} answered ${response.status}`)
      .help(markup`sign in again; if it keeps happening the app's ${provider} credentials may be revoked`);
  }

  export function exchange(provider: string, error: unknown): Diag {
    return Diag.error(Codes.exchange, markup`*${provider}* would not exchange the sign-in code`)
      .note(markup`it said: ${error instanceof Error ? error.message : String(error)}`)
      .help('start again from the sign-in page; a code is only good once and only for minutes');
  }

  export function unverified(provider: string, who: string): Diag {
    return Diag.error(Codes.unverified, markup`*${provider}* has no verified email for ${who}`)
      .note('an unverified address cannot identify a member: it would merge two people into one')
      .help(markup`verify your address with ${provider}, then sign in again`);
  }
}
