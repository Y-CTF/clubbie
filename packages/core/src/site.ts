/**
 * Every page of the web app, as a path. The SPA's router builds its table from this, and anything
 * that has to write a link into a chat message, an email or a redirect asks here.
 *
 * It lives beside the API rather than in the SPA because the server sends more links than the
 * browser does, and a reminder pointing at a page that was renamed last week is the kind of bug
 * nobody notices until a member follows it.
 */
export namespace Site {
  /**
   * Where the API is mounted, under the same origin as the pages.
   *
   * It lives here rather than in `api` because four packages need it and two of them are below
   * `api` in the graph: `core` builds an asset's url from it, `auth` builds the callback a
   * provider is registered against, and the server decides from it which requests are not the
   * SPA. Moving the mount used to be four edits, three of which failed at runtime.
   */
  export const API = '/api';

  export const PATHS = {
    home: '/',
    events: '/events',
    event: '/events/:id',
    sheet: '/events/:id/sheet',
    compose: '/events/new',
    edit: '/events/:id/edit',
    /**
     * The rule behind a repeating event. It lives under the events because that is what it is: a
     * repeat is not a second kind of thing the club does, it is one of them happening again, and
     * it is written on the same form the one-off is written on.
     */
    repeat: '/events/repeats/:id',
    members: '/members',
    member: '/members/:id',
    seasons: '/seasons',
    settings: '/settings',
    /**
     * The queue, which is a page of its own rather than a section of the settings. It is not a
     * setting: nothing on it is saved, it is read while something is going wrong, and it changes
     * under the reader while they are looking at it.
     */
    jobs: '/jobs',
    profile: '/profile',
  } as const;

  export type Name = keyof typeof PATHS;

  /** A path with its parameters filled in. The only way a link is built, on either side. */
  export function path(name: Name, params: Readonly<Record<string, string>> = {}): string {
    return PATHS[name]
      .split('/')
      .map((part) => (part.startsWith(':') ? (params[part.slice(1)] ?? '') : part))
      .join('/');
  }

  /** The same, absolute, for a message that will be read outside the browser. */
  export function url(baseUrl: string, name: Name, params: Readonly<Record<string, string>> = {}): string {
    return new URL(path(name, params), baseUrl).toString();
  }
}
