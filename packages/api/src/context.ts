import type { Auth } from '@clubbie/auth';
import type { Ability, Member } from '@clubbie/core';
import type { Logger } from '@clubbie/log';
import type { Store } from '@clubbie/store';

export interface Options {
  readonly store: Store;
  readonly auth: Auth;
  readonly log: Logger;
  /** Signs the short-lived cookie that carries an in-flight OAuth state. */
  readonly secret: string;
  readonly baseUrl: string;
  /** Where sign-in returns to once a session exists. */
  readonly home?: string;
  /**
   * Whether a proxy in front rewrites the forwarding headers. Only then are they believed, since
   * a caller writes them itself otherwise and a throttle keyed on one would be no throttle.
   */
  readonly trustProxy?: boolean | undefined;
  /**
   * Sends a sign-in mail. The server wires it to `Notify`; the API never learns what a letter
   * looks like, the way `Notify` never learns what a chat client is.
   */
  readonly post?: ((to: string, url: string, code: string) => Promise<void>) | undefined;
}

/**
 * What every handler is handed. `member` is null for a signed-out caller and `ability` answers
 * for them anyway (it says no to everything), so no handler has to branch on absence.
 *
 * `log` is the request's own child logger: it already carries the request id and, once the
 * session is resolved, the member id, so a handler logs a message and never re-attaches context.
 */
export interface Env {
  Variables: {
    store: Store;
    auth: Auth;
    options: Options;
    log: Logger;
    requestId: string;
    member: Member | null;
    ability: Ability;
  };
}
