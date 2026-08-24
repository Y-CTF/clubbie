import { Bytes } from '@clubbie/core';

/**
 * A session bearer token and its stored form. The token is handed to the browser once; only its
 * digest is written down, so a stolen database yields nothing anyone can present.
 */
export interface Minted {
  readonly token: string;
  readonly digest: string;
  readonly expiresAt: Date;
}

export namespace Token {
  export const BYTES = 32;
  export const ALG = 'SHA-256';
  /** How long a session lasts without being renewed. */
  export const TTL = 30 * 24 * 60 * 60 * 1000;
  /** A session is renewed once it is this fraction of the way through its life. */
  export const RENEW = 2;

  export async function mint(ttl: number = TTL, now: Date = new Date()): Promise<Minted> {
    const token = Bytes.token(BYTES);
    return { token, digest: await digest(token), expiresAt: new Date(now.getTime() + ttl) };
  }

  /** Whether a session is far enough through its life to be worth writing a new expiry for. */
  export function stale(expiresAt: Date, now: Date = new Date()): boolean {
    return expiresAt.getTime() - now.getTime() < TTL / RENEW;
  }

  export async function digest(token: string): Promise<string> {
    return Bytes.hex(await crypto.subtle.digest(ALG, new TextEncoder().encode(token)));
  }
}
