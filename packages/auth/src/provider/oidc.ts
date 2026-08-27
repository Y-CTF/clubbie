import { Club } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { Profile } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { decodeIdToken } from 'arctic';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Codes } from '../codes.ts';
import type { Credentials, Pending, Provider } from '../provider.ts';
import { Exchange } from './exchange.ts';

/** The subset of a discovery document this flow uses. */
interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  /** Where the issuer publishes the public halves of the keys it signs id tokens with. */
  jwks_uri?: string;
}

/**
 * An id token once decoded: arbitrary JSON, read through `Oidc.text` and `Oidc.yes`.
 *
 * It is deliberately not an interface of optional strings. A provider is another system, and
 * writing down what we hope it sends does not make it send that: the claim this app cares about
 * most, `schac_home_organization`, is multi-valued in the federation schemas it comes from, so
 * the hoped-for `string` arrives as `["ethz.ch"]` and `.toLowerCase()` throws inside a sign-in.
 */
type Claims = Record<string, unknown>;

/** The claims this flow reads, named once rather than spelled at each lookup. */
const CLAIM = {
  subject: 'sub',
  email: 'email',
  verified: 'email_verified',
  name: 'name',
  given: 'given_name',
  family: 'family_name',
  picture: 'picture',
  /**
   * SCHAC, the schema academic federations agree on: the institution the identity belongs to, as a
   * domain. eduID releases it against the scope in `Providers`; a plain OIDC provider does not,
   * and a club that filters on it has simply configured a provider that cannot answer.
   */
  organisation: 'schac_home_organization',
} as const;

/**
 * Any OpenID Connect provider, configured by issuer alone: the endpoints come from the issuer's
 * discovery document, fetched once and kept.
 *
 * How this app proves it is itself is `Exchange`: a shared secret, or a key the provider only
 * ever sees the public half of. The class does not care which, because the difference is entirely
 * in the token request.
 *
 * The id token's signature is checked against the issuer's published keys whenever it publishes
 * any. It arrives over a TLS-authenticated call to the token endpoint, which OpenID Connect
 * allows as a reason to skip the check, but the keys are one cached fetch and the alternative is
 * an app that would accept an id token from anywhere if a route ever handed it one.
 */
export class Oidc implements Provider {
  static readonly DISCOVERY = '/.well-known/openid-configuration';
  /**
   * What any OpenID Connect provider is asked for. A provider that releases more than this asks
   * for the extra scope in its own entry in `Providers`: what eduID calls its SCHAC attributes is
   * eduID's business, not this class's.
   */
  static readonly SCOPES = ['openid', 'profile', 'email'];

  private exchange: Exchange;
  private endpoints: Promise<Discovery> | null = null;
  private keys: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    readonly name: string,
    private readonly issuer: string,
    private readonly credentials: Credentials,
    redirect: string,
    private readonly scopes: string[] = Oidc.SCOPES,
  ) {
    this.exchange = Exchange.of(name, credentials, redirect);
  }

  /**
   * The issuer's endpoints, fetched once and kept.
   *
   * The failure is cleared rather than cached. `??=` on its own keeps the rejected promise, so a
   * five-second blip at the provider turned into sign-in being broken until somebody restarted
   * the process: every later attempt awaited the same stale rejection.
   */
  private discover(): Promise<Discovery> {
    this.endpoints ??= fetch(new URL(Oidc.DISCOVERY, this.issuer))
      .then(async (response) => {
        if (response.ok) return (await response.json()) as Discovery;
        throw Diag.error(Codes.discovery, markup`*${this.name}* did not answer with its configuration`)
          .note(markup`${new URL(Oidc.DISCOVERY, this.issuer)} answered ${response.status}`)
          .help(markup`check the issuer url, then restart`);
      })
      .catch((error: unknown) => {
        this.endpoints = null;
        throw error;
      });
    return this.endpoints;
  }

  async begin(state: string, verifier: string): Promise<Pending> {
    const { authorization_endpoint } = await this.discover();
    const url = this.exchange.authorize(authorization_endpoint, state, verifier, this.scopes);
    return { url, state, verifier };
  }

  async finish(code: string, verifier: string): Promise<Profile> {
    const { token_endpoint } = await this.discover();
    const tokens = await this.exchange.code(token_endpoint, code, verifier).catch((error: unknown) => {
      /** An `Exchange` that already said what went wrong keeps its own sentence. */
      if (error instanceof Diag) throw error;
      throw Diag.error(Codes.exchange, markup`*${this.name}* would not exchange the sign-in code`)
        .note(markup`it said: ${error instanceof Error ? error.message : String(error)}`)
        .help('start again from the sign-in page; a code is only good once and only for minutes');
    });
    const token = await this.claims(tokens.idToken());
    /**
     * The id token says who, and often no more than that. What a provider puts in it is its own
     * business: eduID releases `sub` there and keeps the address and the home organisation at the
     * userinfo endpoint, which is exactly what that endpoint is for. So anything missing is asked
     * for once, with the access token we were just handed, and the two are merged.
     *
     * The id token wins every claim they disagree about, and userinfo naming a different `sub` is
     * refused outright. The id token is signed and this endpoint's answer is not, and `subject` is
     * what a member's row is matched on: a userinfo body that could overwrite it could point a
     * sign-in at somebody else's account.
     */
    const extra = Oidc.enough(token) ? {} : await this.userinfo(tokens.accessToken());
    const stated = Oidc.text(extra[CLAIM.subject]);
    if (stated !== null && stated !== Oidc.text(token[CLAIM.subject])) {
      throw Diag.error(Codes.claims, markup`*${this.name}* described a different account than it signed in`)
        .note('the userinfo subject does not match the one in the signed id token')
        .help('start again from the sign-in page');
    }
    const claims = { ...extra, ...token };

    const subject = Oidc.text(claims[CLAIM.subject]);
    const email = Oidc.text(claims[CLAIM.email]);
    if (!subject || !email) {
      throw Diag.error(Codes.claims, markup`*${this.name}* returned a token without an identity`)
        .note(markup`it carried ${subject ? 'no email' : 'no subject'}`)
        .help('the provider has to release the `openid` and `email` scopes');
    }

    if (Oidc.yes(claims[CLAIM.verified]) === false) {
      throw Diag.error(Codes.unverified, markup`*${this.name}* has not verified ${email}`)
        .note('an unverified address cannot identify a member: it would merge two people into one')
        .help('verify the address with the provider, then sign in again');
    }

    const home = Oidc.text(claims[CLAIM.organisation])?.toLowerCase() ?? null;

    return {
      provider: this.name,
      subject,
      email: email.toLowerCase(),
      name: Oidc.display(claims) ?? email,
      avatar: Oidc.text(claims[CLAIM.picture]),
      /** The row keeps the plain name, which is what a page prints beside somebody's name. */
      organisation: home,
      /**
       * And the door is given it qualified. `ethz.ch` is only ETH Zurich when eduID is the one
       * saying it: an organisation named the same thing somewhere else is a different organisation,
       * and a club that wrote down a university must not be opened by one.
       */
      organisations: home ? [Club.organisation(this.name, home)] : [],
    };
  }

  /**
   * The id token's claims, with its signature checked against the issuer's published keys.
   *
   * The audience is this client and the issuer is the one discovery came from, so a token minted
   * for another application at the same provider is refused here rather than becoming a member.
   * An issuer that publishes no key set has nothing to check against: the token is then read as
   * it always was, on the strength of the TLS call it arrived in.
   */
  private async claims(id: string): Promise<Claims> {
    const keys = await this.jwks();
    if (!keys) return decodeIdToken(id) as Claims;

    const { payload } = await jwtVerify(id, keys, {
      issuer: this.issuer,
      audience: this.credentials.clientId,
    }).catch((error: unknown) => {
      throw Diag.error(Codes.claims, markup`*${this.name}* signed in with a token this app cannot trust`)
        .note(markup`it said: ${error instanceof Error ? error.message : String(error)}`)
        .help('start again from the sign-in page; if it keeps happening, check the client id');
    });
    return payload as Claims;
  }

  /**
   * The issuer's key set, resolved once. `jose` handles the caching and the re-fetch when a token
   * names a `kid` it has not seen, which is what makes a provider's key rotation a non-event.
   */
  private async jwks(): Promise<ReturnType<typeof createRemoteJWKSet> | null> {
    const { jwks_uri } = await this.discover();
    if (!jwks_uri) return null;

    this.keys ??= createRemoteJWKSet(new URL(jwks_uri));
    return this.keys;
  }

  /**
   * Whether the id token already carries everything a member row needs.
   *
   * The organisation is on the list. It used to be left off, so that a club which does not filter
   * by one paid nothing for it, and the result was that eduID (which keeps the claim at userinfo)
   * never reached it: `organisations` came out empty and a club that had restricted itself to an
   * institution turned away every member, including the admin who typed the restriction. One
   * userinfo call per sign-in is the cheaper of the two mistakes.
   */
  private static enough(claims: Claims): boolean {
    return (
      Oidc.text(claims[CLAIM.subject]) !== null &&
      Oidc.text(claims[CLAIM.email]) !== null &&
      Oidc.text(claims[CLAIM.organisation]) !== null
    );
  }

  /**
   * The claims the provider keeps behind the userinfo endpoint.
   *
   * A failure here is not fatal on its own: the caller then refuses with `claims`, naming what was
   * missing, which is a better sentence than "userinfo answered 500". The endpoint is optional in
   * the discovery document, so a provider without one simply has nothing more to say.
   */
  private async userinfo(access: string): Promise<Claims> {
    const { userinfo_endpoint } = await this.discover();
    if (!userinfo_endpoint) return {};

    const response = await fetch(userinfo_endpoint, {
      headers: { authorization: `Bearer ${access}`, accept: 'application/json' },
    }).catch(() => null);
    if (!response?.ok) return {};

    const body: unknown = await response.json().catch(() => null);
    return typeof body === 'object' && body !== null ? (body as Claims) : {};
  }

  /**
   * A claim as text. A multi-valued claim answers with its first value, which is what a federation
   * means by a home organisation released as a list of one.
   */
  private static text(value: unknown): string | null {
    if (typeof value === 'string') return value.trim() === '' ? null : value;
    if (Array.isArray(value)) return value.length > 0 ? Oidc.text(value[0]) : null;
    return null;
  }

  /**
   * A boolean claim, as a boolean or as the string a provider wrote it as. `null` is "it did not
   * say", which is not the same as "it said no": only a stated `false` refuses a sign-in.
   */
  private static yes(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  }

  private static display(claims: Claims): string | null {
    const full = Oidc.text(claims[CLAIM.name]);
    if (full) return full;

    const parts = [Oidc.text(claims[CLAIM.given]), Oidc.text(claims[CLAIM.family])].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : null;
  }
}
