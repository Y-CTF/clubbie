/**
 * The product name, and everything derived from it. Running code never writes `clubbie`: it asks
 * here, so renaming the project is one edit rather than a search across every package.
 */
export namespace Brand {
  export const STEM = 'clubbie';

  /** The binary, the root log scope, and the user agent the app identifies itself with. */
  export const cli = STEM;
  export const agent = STEM;
  export const scope = STEM;

  /**
   * The default database file, beside whatever directory the server was started in. The url around
   * it is `Store.file`, because a scheme is the store's business and `core` has never heard of one.
   */
  export const db = `${STEM}.db`;

  export function cookie(name: string): string {
    return `${STEM}_${name}`;
  }
}
