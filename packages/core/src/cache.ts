/**
 * How long a body may be kept, and by whom.
 *
 * Two things in this app serve bytes: the API, for an image a club uploaded, and the server, for
 * the built SPA. Both make the same distinction and it is the same distinction either way. A body
 * whose url changes whenever the body changes (a hashed bundle, an asset under a random id) can
 * be kept for as long as a browser likes, because a new one arrives under a new url. Anything
 * else is revalidated, so a deploy is visible without a member clearing their cache.
 */
export namespace Cache {
  /** A year in seconds, which is the longest `max-age` anything is allowed to suggest. */
  export const YEAR = 31536000;
  /** For a body that cannot change under its url. */
  export const IMMUTABLE = `public, max-age=${YEAR}, immutable`;
  /** For a body that can: keep it, but ask before using it. */
  export const FRESH = 'no-cache';
  /** Never guess what a body is: the type given is the type it is treated as. */
  export const SNIFF = { 'x-content-type-options': 'nosniff' } as const;
}
