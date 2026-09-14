/**
 * How bytes become text, in one place. Session tokens, linking codes and digests all need the
 * same two encodings, and a second hand-rolled `btoa` chain is how two of them end up subtly
 * different.
 */
export namespace Bytes {
  export const HEX = 16;
  export const PAD = 2;
  /** A kilobyte, as everything that measures a payload means it. */
  export const KILO = 1024;
  /** What a size reads as in a sentence to a person, which is the only place a size is shown. */
  export const UNIT = 'kB';

  export function kilobytes(bytes: number): string {
    return `${Math.round(bytes / KILO)} ${UNIT}`;
  }

  export function random(count: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(count));
  }

  /** URL-safe base64 with no padding: it goes in a cookie, a url and a chat message unescaped. */
  export function base64url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
  }

  export function hex(bytes: Uint8Array | ArrayBuffer): string {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return [...view].map((byte) => byte.toString(HEX).padStart(PAD, '0')).join('');
  }

  /** A token of `count` random bytes, which is what every secret in the app is. */
  export function token(count: number): string {
    return base64url(random(count));
  }

  export const ALG = 'SHA-256';

  /**
   * The stored form of a secret. Session tokens, linking codes and sign-in requests are all
   * written down as this and never as themselves, so a leaked database holds nothing presentable.
   */
  export async function digest(value: string): Promise<string> {
    return hex(await crypto.subtle.digest(ALG, new TextEncoder().encode(value)));
  }
}
