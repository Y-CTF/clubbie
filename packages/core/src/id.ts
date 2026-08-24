declare const brand: unique symbol;

/** An id that only ever compares equal to one of its own kind. */
export type Id<K extends string> = string & { readonly [brand]: K };

/**
 * Ids are time-sorted: a millisecond timestamp in Crockford base32, then randomness.
 * Sorting rows by id therefore sorts them by creation, so a listing needs no second index.
 */
export namespace Id {
  export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  export const TIME = 10;
  export const RANDOM = 16;
  export const LENGTH = TIME + RANDOM;

  export function create<K extends string>(now: number = Date.now()): Id<K> {
    return (time(now) + random()) as Id<K>;
  }

  export function valid(value: string): boolean {
    return value.length === LENGTH && [...value].every((c) => ALPHABET.includes(c));
  }

  /** The instant an id was minted, which is the only thing an id says about itself. */
  export function minted(id: string): Date {
    let ms = 0;
    for (const c of id.slice(0, TIME)) ms = ms * ALPHABET.length + ALPHABET.indexOf(c);
    return new Date(ms);
  }

  function time(now: number): string {
    let out = '';
    for (let i = TIME - 1, ms = now; i >= 0; i--, ms = Math.floor(ms / ALPHABET.length)) {
      out = ALPHABET[ms % ALPHABET.length] + out;
    }
    return out;
  }

  function random(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(RANDOM));
    return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  }
}
