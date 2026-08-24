import { Bytes, type MemberId } from '@clubbie/core';

/**
 * The token in a calendar url. A calendar client cannot hold a cookie and will not sign in, so the
 * url itself has to be the credential: it names a member and carries an HMAC of that name under
 * the session secret.
 *
 * It grants exactly one thing: reading the club's published calendar as that member, which the
 * route checks against the same `Ability` as every other read. It is not a session and cannot
 * answer an event, change a profile, or be exchanged for one. Rotating `SESSION_SECRET` retires
 * every feed at once, which is also how a member who leaked their url gets a new one.
 */
export namespace Feed {
  export const SEP = '.';
  export const ALGORITHM = 'HMAC';
  export const HASH = 'SHA-256';
  /** How much of the digest goes in the url. 128 bits is far past guessable and stays short. */
  export const BYTES = 16;

  export async function sign(memberId: MemberId, secret: string): Promise<string> {
    const key = await import_(secret);
    const mac = await crypto.subtle.sign(ALGORITHM, key, new TextEncoder().encode(memberId));
    return memberId + SEP + Bytes.base64url(new Uint8Array(mac).slice(0, BYTES));
  }

  /** The member a token names, or null if it was not minted here. */
  export async function open(token: string, secret: string): Promise<MemberId | null> {
    const cut = token.lastIndexOf(SEP);
    if (cut <= 0) return null;

    const memberId = token.slice(0, cut) as MemberId;
    const expected = await sign(memberId, secret);
    return timingSafe(token, expected) ? memberId : null;
  }

  /** Compares in constant time, so a token cannot be discovered a character at a time. */
  function timingSafe(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  async function import_(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: ALGORITHM, hash: HASH },
      false,
      ['sign'],
    );
  }
}
