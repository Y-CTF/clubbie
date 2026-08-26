import { GitHub } from './provider/github.ts';
import { Oidc } from './provider/oidc.ts';
import type { Credentials, Provider } from './provider.ts';

/**
 * Every sign-in provider the app knows, with the environment variables that configure it and the
 * one line that builds it.
 *
 * This table is the single owner: the server reads the environment through it, validates through
 * it, redacts through it, and `Auth.create` builds from it. Adding a provider is one entry plus
 * one `Provider` implementation, and nothing else in the codebase learns its name.
 */
export interface Spec {
  readonly vars: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly issuer?: string;
  };
  make(credentials: Credentials, redirect: string): Provider;
}

/** eduID's issuer, unless a deployment points at their test environment with `EDUID_ISSUER`. */
export const EDUID = 'https://login.eduid.ch';
/**
 * eduID's own scope for the SCHAC attributes, which is where `schac_home_organization` comes
 * from. Without asking for it the claim is simply absent, and a club that has restricted itself
 * to an institution turns away every single member, including the one who typed the restriction.
 * A provider that does not know the scope ignores it, so asking costs a deployment nothing.
 */
export const SCHAC = 'https://login.eduid.ch/authz/User.Read';

const SPECS = {
  eduid: {
    vars: {
      clientId: 'EDUID_CLIENT_ID',
      clientSecret: 'EDUID_CLIENT_SECRET',
      issuer: 'EDUID_ISSUER',
    },
    make: (credentials, redirect) =>
      new Oidc('eduid', credentials.issuer ?? EDUID, credentials, redirect, [...Oidc.SCOPES, SCHAC]),
  },
  github: {
    vars: {
      clientId: 'GITHUB_CLIENT_ID',
      clientSecret: 'GITHUB_CLIENT_SECRET',
    },
    make: (credentials, redirect) => new GitHub(credentials, redirect),
  },
} as const satisfies Record<string, Spec>;

export type Named = keyof typeof SPECS;

export namespace Providers {
  export const NAMES = Object.keys(SPECS) as Named[];

  export function spec(name: Named): Spec {
    return SPECS[name];
  }

  /** Every variable any provider reads, which is what a config listing and a redaction cover. */
  export function vars(name: Named): readonly string[] {
    return Object.values(SPECS[name].vars as Record<string, string>);
  }

  export function all(): readonly string[] {
    return NAMES.flatMap(vars);
  }

  /**
   * The variables that carry a credential, so a config listing knows what never to print. It is
   * read off the table rather than guessed from the variable's name: a provider whose secret is
   * not called `..._SECRET` would otherwise be printed in full by any failed boot.
   */
  export function secrets(): readonly string[] {
    return NAMES.map((name) => SPECS[name].vars.clientSecret);
  }
}
