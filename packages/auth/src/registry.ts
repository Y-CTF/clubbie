import { Discord } from './provider/discord.ts';
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
 *
 * Most entries are OpenID Connect and differ only by issuer, so they are written with `openid`
 * rather than spelled out: an entry that repeats a class name and a variable prefix five times is
 * five chances to mistype one.
 */
export interface Spec {
  readonly vars: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly issuer?: string;
    readonly privateKey?: string;
    readonly keyId?: string;
    readonly algorithm?: string;
  };
  /**
   * The issuer used when a deployment names none. A spec that takes an issuer variable and has no
   * fallback here cannot be built without one, which is what `oidc` is: it is every provider this
   * table does not name, so only the deployment knows who it is.
   */
  readonly issuer?: string;
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
/**
 * eduID's newer spelling of the same thing, which their registry tells every client to request.
 *
 * It is deliberately not asked for. A client may only request the scopes its own registration was
 * granted, and a registration whose attributes are still mapped to `User.Read` above is not one of
 * them: eduID then refuses the *token exchange* with `unauthorized_client`, so the sign-in dies a
 * step earlier than it would have with a missing claim. A deployment registered the new way sets
 * its scope here instead.
 */
export const USERINFO = 'https://eduid.ch/scope/userinfo.read';

/** Google is one issuer for everybody, Workspace domain or not. */
export const GOOGLE = 'https://accounts.google.com';
/**
 * Microsoft's multi-tenant issuer, which admits any Entra account and any personal one. A club
 * that is one university or one company sets `MICROSOFT_ISSUER` to its own tenant instead, which
 * is the door: the common issuer lets the whole world in, and refusing them afterwards by domain
 * is a second list to keep.
 */
export const MICROSOFT = 'https://login.microsoftonline.com/common/v2.0';
/** GitLab.com. A self-hosted instance is its own origin, in `GITLAB_ISSUER`. */
export const GITLAB = 'https://gitlab.com';

/**
 * An OpenID Connect entry: the variables are named after it, and the issuer is either fixed here
 * or given by the deployment. `scopes` is what this provider releases beyond the three every
 * OpenID Connect provider takes.
 *
 * Every one of them takes a private key instead of a secret, because that is a property of the
 * protocol rather than of any one provider. GitHub and Discord do not, so they say so by not
 * naming the variables.
 */
function openid(name: string, issuer: string | undefined, scopes: readonly string[] = []): Spec {
  const prefix = name.toUpperCase();
  return {
    vars: {
      clientId: `${prefix}_CLIENT_ID`,
      clientSecret: `${prefix}_CLIENT_SECRET`,
      issuer: `${prefix}_ISSUER`,
      privateKey: `${prefix}_PRIVATE_KEY`,
      keyId: `${prefix}_KEY_ID`,
      algorithm: `${prefix}_KEY_ALGORITHM`,
    },
    ...(issuer ? { issuer } : {}),
    make: (credentials, redirect) =>
      new Oidc(name, credentials.issuer ?? issuer ?? '', credentials, redirect, [...Oidc.SCOPES, ...scopes]),
  };
}

const SPECS = {
  eduid: openid('eduid', EDUID, [SCHAC]),
  google: openid('google', GOOGLE),
  microsoft: openid('microsoft', MICROSOFT),
  gitlab: openid('gitlab', GITLAB),
  /** Anything else that speaks OpenID Connect: Keycloak, Authentik, Zitadel, a campus IdP. */
  oidc: openid('oidc', undefined),
  github: {
    vars: {
      clientId: 'GITHUB_CLIENT_ID',
      clientSecret: 'GITHUB_CLIENT_SECRET',
    },
    make: (credentials, redirect) => new GitHub(credentials, redirect),
  },
  discord: {
    vars: {
      clientId: 'DISCORD_CLIENT_ID',
      clientSecret: 'DISCORD_CLIENT_SECRET',
    },
    make: (credentials, redirect) => new Discord(credentials, redirect),
  },
} as const satisfies Record<string, Spec>;

export type Named = keyof typeof SPECS;

export namespace Providers {
  export const NAMES = Object.keys(SPECS) as Named[];

  export function spec(name: Named): Spec {
    return SPECS[name];
  }

  export function known(name: string): name is Named {
    return name in SPECS;
  }

  /** Every variable any provider reads, which is what a config listing and a redaction cover. */
  export function vars(name: Named): readonly string[] {
    return Object.values(spec(name).vars as Record<string, string>);
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
    return NAMES.flatMap((name) => {
      const { clientSecret, privateKey } = spec(name).vars;
      return privateKey ? [clientSecret, privateKey] : [clientSecret];
    });
  }

  /** Whether this provider can authenticate with a key rather than a shared secret. */
  export function keyed(name: Named): boolean {
    return Boolean(spec(name).vars.privateKey);
  }

  /**
   * Whether this provider still needs to be told who its issuer is. A generic OpenID Connect
   * entry has no default, and building it with an empty issuer would fail at the first sign-in
   * rather than at boot.
   */
  export function needsIssuer(name: Named): boolean {
    return Boolean(spec(name).vars.issuer) && spec(name).issuer === undefined;
  }
}
