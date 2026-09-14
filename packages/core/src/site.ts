import { Signin } from './signin.ts';

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

  /**
   * The API's own paths, for the things reached by writing a url rather than through the typed
   * client: the two halves of the sign-in redirect, the files a browser downloads, and the feed a
   * calendar client polls. `PATHS` is pages, so these five had no owner and were written as
   * literals in four packages, one of which forgot to encode the id it interpolated.
   */
  export namespace Api {
    export function start(provider: string): string {
      return `${API}/auth/${encodeURIComponent(provider)}`;
    }

    export function callback(provider: string): string {
      return `${Api.start(provider)}/callback`;
    }

    export function event(id: string): string {
      return `${API}/events/${encodeURIComponent(id)}/event.ics`;
    }

    export function sheet(id: string): string {
      return `${API}/events/${encodeURIComponent(id)}/sheet.csv`;
    }

    export function roster(): string {
      return `${API}/members/roster.csv`;
    }

    export function calendar(token: string): string {
      return `${API}/calendar/${encodeURIComponent(token)}.ics`;
    }

    /** The link a sign-in mail carries. The only url in the app a stranger is sent. */
    export function signin(token: string): string {
      return `${API}/auth/${Signin.PROVIDER}/${encodeURIComponent(token)}`;
    }
  }

  export const PATHS = {
    home: '/',
    /**
     * Where the club's own website sends somebody who wants in. It is apart from `home` because
     * that page is a sign-in for members who already know what this is, and this one is written
     * for a stranger: what the club does, what happens after they sign up, and one button.
     */
    join: '/join',
    /**
     * What a member sees once, after their first sign-in. Which steps it holds depends on who
     * they are, because the first member to arrive is setting up a club and the rest are joining
     * one.
     */
    welcome: '/welcome',
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
