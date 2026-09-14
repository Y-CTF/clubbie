import { Club, Net } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { Profile } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Codes } from '../codes.ts';
import type { Credentials, Pending, Provider } from '../provider.ts';
import { Exchange } from './exchange.ts';

/** The subset of a discovery document this flow uses. */
interface Discovery {
  /**
   * What the issuer calls itself, which is what an id token's `iss` carries and not always the
   * url a deployment typed to reach it. It is optional here because a provider that omits it
   * leaves the configured url as the only thing to check against.
   */
  issuer?: string;
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
 * The id token's signature is always checked against the issuer's published keys. It arrives over
 * a TLS-authenticated call to the token endpoint, which OpenID Connect allows as a reason to skip
 * the check, and this does not take it: the endpoint it came from is itself whatever the discovery
 * document named, so trusting the call is trusting that document twice. A provider that publishes
 * no key set is refused rather than believed, because the alternative is reading `sub` and `email`
 * out of an unsigned blob and enrolling a member from it.
 */
export class Oidc implements Provider {
  /**
   * Relative, and joined to the issuer's own path rather than to its origin. An issuer is allowed
   * a path (`/common/v2.0` at Microsoft, `/realms/<club>` at Keycloak) and the discovery document
   * lives underneath it; resolving an absolute `/.well-known/...` would throw that path away and
   * ask the origin, which answers 404.
   */
  static readonly DISCOVERY = '.well-known/openid-configuration';
  /**
   * A segment of a published issuer that stands for whatever the token carries there. Microsoft's
   * multi-tenant document names itself `https://login.microsoftonline.com/{tenantid}/v2.0`, and
   * every token it signs writes a real tenant in that segment.
   */
  static readonly PLACEHOLDER = /^\{.+\}$/;
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
    this.endpoints ??= fetch(this.document(), { signal: Net.patience() })
      .then(async (response) => {
        if (response.ok) return (await response.json()) as Discovery;
        throw Diag.error(Codes.discovery, markup`*${this.name}* did not answer with its configuration`)
          .note(markup`${this.document()} answered ${response.status}`)
          .help(markup`check the issuer url, then restart`);
      })
      .catch((error: unknown) => {
        this.endpoints = null;
        throw error;
      });
    return this.endpoints;
  }

  /** Where the issuer's configuration is, which is its own url with the well-known path under it. */
  private document(): URL {
    return new URL(Oidc.DISCOVERY, this.issuer.endsWith('/') ? this.issuer : `${this.issuer}/`);
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
    if (!keys) {
      throw Diag.error(Codes.discovery, markup`*${this.name}* publishes no signing keys`)
        .note('an id token nothing can check cannot say who signed in')
        .help('check the issuer url: an OpenID Connect provider publishes a `jwks_uri`');
    }

    const { payload } = await jwtVerify(id, keys, { audience: this.credentials.clientId }).catch(
      (error: unknown) => {
        throw Diag.error(Codes.claims, markup`*${this.name}* signed in with a token this app cannot trust`)
          .note(markup`it said: ${error instanceof Error ? error.message : String(error)}`)
          .help('start again from the sign-in page; if it keeps happening, check the client id');
      },
    );

    const named = await this.named();
    if (!Oidc.issued(named, payload.iss)) {
      throw Diag.error(Codes.claims, markup`*${this.name}* signed in with a token from another issuer`)
        .note(markup`the token says ${payload.iss ?? 'nothing'}, and ${named} is who signed it`)
        .help('check the issuer url, then sign in again');
    }
    return payload as Claims;
  }

  /**
   * Who the token's `iss` has to name: the identifier the issuer publishes for itself, which is
   * the authority on its own name. A deployment types a url to reach the provider and the provider
   * writes its own: eduID is reached at `https://login.eduid.ch` and calls itself
   * `https://login.eduid.ch/`, and comparing those two strings refuses every sign-in it makes.
   *
   * It still has to be the same origin the deployment named. The document arrives over TLS from
   * that origin, so an origin saying what its own paths are called is an origin describing itself;
   * one naming somebody else's host would be pointing this app's trust at a provider nobody chose.
   */
  private async named(): Promise<string> {
    const { issuer } = await this.discover();
    if (!issuer) return this.issuer;
    if (new URL(issuer).origin !== new URL(this.issuer).origin) {
      throw Diag.error(Codes.discovery, markup`*${this.name}* publishes a configuration for another issuer`)
        .note(markup`${this.document()} answered for ${issuer}`)
        .help('check the issuer url, then restart');
    }
    return issuer;
  }

  /**
   * Whether a token's `iss` is the issuer that published `named`.
   *
   * The published identifier is a pattern rather than a literal, because a multi-tenant issuer
   * writes one document for every tenant and marks the segment that varies. So the origins must be
   * the same and the path must match segment for segment, with a `{...}` segment matching whatever
   * the token put there. Splitting on `/` is also what makes a trailing slash a non-difference.
   */
  private static issued(named: string, stated: unknown): boolean {
    if (typeof stated !== 'string') return false;

    let want: URL;
    let got: URL;
    try {
      want = new URL(named);
      got = new URL(stated);
    } catch {
      return false;
    }
    if (want.origin !== got.origin) return false;

    const wanted = Oidc.segments(want);
    const given = Oidc.segments(got);
    return (
      wanted.length === given.length &&
      wanted.every((segment, at) => segment === given[at] || Oidc.PLACEHOLDER.test(segment))
    );
  }

  /**
   * A url's path, segment by segment, as the document wrote it. `URL` percent-encodes a path, so
   * the braces a multi-tenant issuer marks its variable segment with arrive as `%7B...%7D` and no
   * pattern would ever see them. Decoding is also what makes the two sides comparable at all.
   */
  private static segments(url: URL): string[] {
    return url.pathname
      .split('/')
      .filter((segment) => segment !== '')
      .map((segment) => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      });
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
      signal: Net.patience(),
      headers: { authorization: `Bearer ${access}`, accept: Net.TYPE },
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
