import { Diag } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import { CodeChallengeMethod, OAuth2Client, OAuth2Tokens } from 'arctic';
import { importPKCS8, SignJWT } from 'jose';
import { Codes } from '../codes.ts';
import { type Credentials, Key } from '../provider.ts';

/**
 * How this app proves to a token endpoint that it is itself.
 *
 * There are two ways and a provider takes one of them: a shared secret, which arctic sends, or a
 * signed assertion, which is a key the provider never sees the private half of. The rest of a
 * flow is identical, so the difference is one object rather than a branch inside `Oidc`.
 */
export interface Exchange {
  /** Where to send somebody. Client authentication plays no part in this half of the flow. */
  authorize(endpoint: string, state: string, verifier: string, scopes: string[]): URL;
  code(endpoint: string, code: string, verifier: string): Promise<OAuth2Tokens>;
}

export namespace Exchange {
  /** The assertion type RFC 7523 gives `private_key_jwt`, spelled exactly once. */
  export const ASSERTION = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
  export const FORM = 'application/x-www-form-urlencoded';
  export const TYPE = 'application/json';
  /** How much of a token endpoint's refusal is worth putting in a diagnostic. */
  export const EXCERPT = 200;

  /** The one a deployment configured, which is the key if it set one and the secret otherwise. */
  export function of(name: string, credentials: Credentials, redirect: string): Exchange {
    return credentials.key
      ? new Assertion(name, credentials.clientId, credentials.key, redirect)
      : new Secret(credentials.clientId, credentials.clientSecret ?? null, redirect);
  }

  /** A client secret, sent the way arctic sends it. */
  export class Secret implements Exchange {
    private client: OAuth2Client;

    constructor(clientId: string, clientSecret: string | null, redirect: string) {
      this.client = new OAuth2Client(clientId, clientSecret, redirect);
    }

    authorize(endpoint: string, state: string, verifier: string, scopes: string[]): URL {
      return this.client.createAuthorizationURLWithPKCE(
        endpoint,
        state,
        CodeChallengeMethod.S256,
        verifier,
        scopes,
      );
    }

    code(endpoint: string, code: string, verifier: string): Promise<OAuth2Tokens> {
      return this.client.validateAuthorizationCode(endpoint, code, verifier);
    }
  }

  /**
   * A private key, signed into a fresh assertion per exchange.
   *
   * The authorization url is still arctic's, built by a client with no password: that half of the
   * flow carries no credential at all. Only the token request is written here, because arctic
   * sends a secret or nothing and this sends neither.
   */
  export class Assertion implements Exchange {
    private client: OAuth2Client;
    private signer: Promise<CryptoKey> | null = null;

    constructor(
      private readonly name: string,
      private readonly clientId: string,
      private readonly key: Key,
      private readonly redirect: string,
    ) {
      this.client = new OAuth2Client(clientId, null, redirect);
    }

    authorize(endpoint: string, state: string, verifier: string, scopes: string[]): URL {
      return this.client.createAuthorizationURLWithPKCE(
        endpoint,
        state,
        CodeChallengeMethod.S256,
        verifier,
        scopes,
      );
    }

    async code(endpoint: string, code: string, verifier: string): Promise<OAuth2Tokens> {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirect,
        code_verifier: verifier,
        client_id: this.clientId,
        client_assertion_type: ASSERTION,
        client_assertion: await this.assert(endpoint),
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': FORM, accept: TYPE },
        body,
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || typeof data !== 'object' || data === null) {
        const detail = typeof data === 'object' && data !== null ? JSON.stringify(data) : '';
        throw Diag.error(Codes.exchange, markup`*${this.name}* refused the signed assertion`)
          .note(markup`the token endpoint answered ${response.status}: ${detail.slice(0, EXCERPT)}`)
          .help('check the key registered with the provider, its `kid` and its algorithm');
      }

      return new OAuth2Tokens(data);
    }

    /**
     * One assertion: this client, to this token endpoint, good for a minute.
     *
     * `jti` is what stops a captured assertion being replayed inside that minute, and the audience
     * is the endpoint rather than the issuer because that is the party being proved to.
     */
    private async assert(endpoint: string): Promise<string> {
      const now = Math.floor(Date.now() / 1000);
      const jwt = new SignJWT({})
        .setProtectedHeader({
          alg: this.key.algorithm,
          ...(this.key.id ? { kid: this.key.id } : {}),
        })
        .setIssuer(this.clientId)
        .setSubject(this.clientId)
        .setAudience(endpoint)
        .setIssuedAt(now)
        .setExpirationTime(now + Key.LIFETIME)
        .setJti(crypto.randomUUID());

      return jwt.sign(await this.private());
    }

    /**
     * The key, imported once. A bad PEM is a deployment mistake that only shows at the first
     * sign-in, so it says which variable to look at rather than surfacing as a parse error.
     */
    private private(): Promise<CryptoKey> {
      this.signer ??= importPKCS8(this.key.pem, this.key.algorithm).catch((error: unknown) => {
        this.signer = null;
        throw Diag.error(Codes.provider, markup`*${this.name}* could not read its private key`)
          .note(markup`it said: ${error instanceof Error ? error.message : String(error)}`)
          .help('the key is a pkcs#8 pem, the block that starts `-----BEGIN PRIVATE KEY-----`');
      });
      return this.signer;
    }
  }
}
