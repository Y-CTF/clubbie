import { Site } from '@clubbie/core';

/**
 * Every page the app has. The path comes from `Site`, which the server writes its links from too,
 * so a renamed page renames it in a reminder email in the same edit. What is declared here is only
 * what the browser knows on top of that: whether a signed-out caller has any business seeing it.
 *
 * What a page is *called* is not here. That is prose, it is translated, and it lives in the
 * catalogue under the same key: `words.t.pages.Events`.
 */
export interface Route {
  readonly pattern: string;
  /** Whether the page is only worth showing to a signed-in member. */
  readonly private: boolean;
}

export const Route = {
  Home: { pattern: Site.PATHS.home, private: false },
  Events: { pattern: Site.PATHS.events, private: true },
  Compose: { pattern: Site.PATHS.compose, private: true },
  Event: { pattern: Site.PATHS.event, private: true },
  Edit: { pattern: Site.PATHS.edit, private: true },
  Sheet: { pattern: Site.PATHS.sheet, private: true },
  Members: { pattern: Site.PATHS.members, private: true },
  Member: { pattern: Site.PATHS.member, private: true },
  Repeat: { pattern: Site.PATHS.repeat, private: true },
  Seasons: { pattern: Site.PATHS.seasons, private: true },
  Settings: { pattern: Site.PATHS.settings, private: true },
  Jobs: { pattern: Site.PATHS.jobs, private: true },
  Profile: { pattern: Site.PATHS.profile, private: true },
} as const satisfies Record<string, Route>;

export type Name = keyof typeof Route;

export interface Match {
  readonly name: Name;
  readonly route: Route;
  readonly params: Readonly<Record<string, string>>;
  /**
   * What the page is looking at, as opposed to which page it is. The calendar keeps its view and
   * its date here, so a member can send somebody the week they are talking about, and the back
   * button walks back through the pages rather than through the state of one.
   */
  readonly query: Readonly<Record<string, string>>;
}

/**
 * A history router in one file. It exists rather than a dependency because the whole contract is
 * three things: match a path, push a path, and tell the app when the path changed.
 *
 * A pattern segment starting with `:` captures; everything else matches literally. More specific
 * patterns are tried first, so `/events/new` is never swallowed by `/events/:id`.
 */
export class Router {
  /** A link the SPA must not intercept: it leaves the app (a sign-in redirect, a download). */
  static readonly EXTERNAL = 'data-external';

  current = $state<Match>(Router.match(location.pathname, location.search));

  constructor() {
    addEventListener('popstate', () => {
      this.current = Router.match(location.pathname, location.search);
    });
  }

  /** Literal segments before captures, so a fixed path always wins over a parameter. */
  static get names(): Name[] {
    return (Object.keys(Route) as Name[]).sort(
      (a, b) => Router.captures(Route[a].pattern) - Router.captures(Route[b].pattern),
    );
  }

  private static captures(pattern: string): number {
    return pattern.split('/').filter((part) => part.startsWith(':')).length;
  }

  /** The path for a route, with its parameters filled in. The only way a link is built. */
  static to(name: Name, params: Record<string, string> = {}, query: Record<string, string> = {}): string {
    const path = Route[name].pattern
      .split('/')
      .map((part) => (part.startsWith(':') ? encodeURIComponent(params[part.slice(1)] ?? '') : part))
      .join('/');

    const search = new URLSearchParams(query).toString();
    return search ? `${path}?${search}` : path;
  }

  static match(path: string, search = ''): Match {
    const query = Object.fromEntries(new URLSearchParams(search));
    for (const name of Router.names) {
      const params = Router.compare(Route[name].pattern, path);
      if (params) return { name, route: Route[name], params, query };
    }
    return { name: 'Home', route: Route.Home, params: {}, query };
  }

  /** The captured parameters when the pattern matches, or null when it does not. */
  private static compare(pattern: string, path: string): Record<string, string> | null {
    const wanted = pattern.split('/').filter(Boolean);
    const got = path.split('/').filter(Boolean);
    if (wanted.length !== got.length) return null;

    const params: Record<string, string> = {};
    for (const [index, part] of wanted.entries()) {
      const segment = got[index] as string;
      if (part.startsWith(':')) {
        /**
         * A segment that is not valid percent-encoding is not a parameter, it is a bad link.
         * `decodeURIComponent('100%')` throws, and this runs inside the router's own field
         * initialiser during `mount`, so a mangled url used to throw before anything rendered:
         * a white page with no way back except editing the address bar. It simply does not match.
         */
        const value = Router.decode(segment);
        if (value === null) return null;
        params[part.slice(1)] = value;
      } else if (part !== segment) return null;
    }
    return params;
  }

  /** One segment, decoded, or null when it is not something a browser could have encoded. */
  private static decode(segment: string): string | null {
    try {
      return decodeURIComponent(segment);
    } catch {
      return null;
    }
  }

  go(name: Name, params: Record<string, string> = {}, query: Record<string, string> = {}): void {
    const to = Router.to(name, params, query);
    if (to === location.pathname + location.search) return;
    history.pushState({}, '', to);
    this.current = Router.here(to);
  }

  /**
   * The same, without an entry in the history.
   *
   * It is what a page uses to write down what it is looking at. A calendar stepped through six
   * months would otherwise leave six entries between a member and the page they arrived from, and
   * the back button is for going back to that page, not for undoing a month.
   */
  replace(name: Name, params: Record<string, string> = {}, query: Record<string, string> = {}): void {
    const to = Router.to(name, params, query);
    if (to === location.pathname + location.search) return;
    history.replaceState({}, '', to);
    this.current = Router.here(to);
  }

  /** A match for a url this app just wrote, path and query alike. */
  private static here(to: string): Match {
    const [path = '', search = ''] = to.split('?');
    return Router.match(path, search);
  }

  /**
   * Intercepts a click on an in-app link so a navigation does not reload the whole SPA. A link
   * marked external is left alone: `/api/auth/github` is a redirect the browser must actually
   * follow, and pushing it into the router would render the sign-in page at a dead url.
   */
  intercept = (event: MouseEvent): void => {
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    const href = anchor?.getAttribute('href');
    if (!href?.startsWith('/') || anchor?.hasAttribute(Router.EXTERNAL)) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

    event.preventDefault();
    history.pushState({}, '', href);
    this.current = Router.here(href);
  };
}
