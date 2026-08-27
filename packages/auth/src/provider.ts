import type { Profile } from '@clubbie/store';

/** What a caller must hand back to finish a flow it started. */
export interface Pending {
  readonly url: URL;
  readonly state: string;
  readonly verifier: string;
}

/**
 * One OAuth provider, reduced to the two things the app needs: where to send someone, and who
 * came back. Arctic owns the protocol; a provider here owns the profile, because only it knows
 * which field is a stable subject and which email has actually been verified.
 */
export interface Provider {
  readonly name: string;
  begin(state: string, verifier: string): Pending | Promise<Pending>;
  finish(code: string, verifier: string): Promise<Profile>;
}

/**
 * A private key this app authenticates itself with, instead of a shared secret.
 *
 * It is the asymmetric half of OpenID Connect client authentication (`private_key_jwt`): the app
 * signs a short assertion with a key only it holds, and the provider checks it against the public
 * half it was registered with. Federations increasingly require it, because a shared secret is a
 * password that travels to a second party and lives in both their configurations.
 */
export interface Key {
  /** The private key in PKCS#8 PEM, which is what every provider's console hands back. */
  readonly pem: string;
  /** The `kid` the provider registered the public half under, when it registered one. */
  readonly id?: string | undefined;
  /** The algorithm the key is used with. `RS256` unless the provider asked for another. */
  readonly algorithm: string;
}

/**
 * A provider is configured or it does not exist. An unconfigured one must never half-work.
 *
 * A client id is always needed; what proves the client is either a secret or a key, and which of
 * the two a given provider will accept is `Spec.keyed`.
 */
export interface Credentials {
  readonly clientId: string;
  readonly clientSecret?: string | undefined;
  readonly issuer?: string | undefined;
  readonly key?: Key | undefined;
}

export namespace Key {
  /** What a key is signed with when nothing says otherwise: every provider takes it. */
  export const ALGORITHM = 'RS256';
  /** How long an assertion is good for. Seconds, because the assertion is spent immediately. */
  export const LIFETIME = 60;
}

export namespace Provider {
  export function configured(credentials: Partial<Credentials>): credentials is Credentials {
    return Boolean(credentials.clientId) && Boolean(credentials.clientSecret || credentials.key);
  }

  /**
   * The shared secret, for a provider that has no other way of proving who it is.
   *
   * The config refuses such a provider unless it has one, so reaching this without a secret is a
   * broken registry rather than a misconfigured deployment: it throws where an invariant is
   * checked rather than as a diagnostic somebody signing in is asked to read.
   */
  export function secret(name: string, credentials: Credentials): string {
    if (credentials.clientSecret) return credentials.clientSecret;
    throw new Error(`${name} was built without the client secret it can only sign in with`);
  }
}
