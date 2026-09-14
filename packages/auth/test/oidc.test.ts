import { afterEach, describe, expect, test } from 'bun:test';
import { Diag } from '@clubbie/diag';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Codes } from '../src/codes.ts';
import { Oidc } from '../src/provider/oidc.ts';

const REDIRECT = 'http://localhost:3000/api/auth/eduid/callback';
const SUBJECT = 'a-stable-subject';
const EMAIL = 'member@example.org';

const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig' };

/** What a deployment reaches, and what the issuer behind it calls itself, which differ in practice. */
interface Issuer {
  readonly configured: string;
  readonly published: string;
  /** What the id token writes in `iss`, when that is not the published identifier itself. */
  readonly stated?: string;
}

const asked: string[] = [];
const real = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = real;
  asked.length = 0;
});

/**
 * A whole provider on the other end of `fetch`: its configuration, its keys, its token endpoint
 * and its userinfo. Everything a sign-in touches is a request, so stubbing the one function is
 * enough to drive the real class rather than a mock of it.
 */
function serve(issuer: Issuer): void {
  const origin = new URL(issuer.configured).origin;
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input instanceof Request ? input.url : input);
    asked.push(url);

    if (url.endsWith(Oidc.DISCOVERY)) {
      return Response.json({
        issuer: issuer.published,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        userinfo_endpoint: `${origin}/userinfo`,
        jwks_uri: `${origin}/keys`,
      });
    }
    if (url === `${origin}/keys`) return Response.json({ keys: [jwk] });
    if (url === `${origin}/token`) {
      return Response.json({
        access_token: 'access',
        token_type: 'Bearer',
        id_token: await token(issuer.stated ?? issuer.published),
      });
    }
    if (url === `${origin}/userinfo`) return Response.json({ sub: SUBJECT, email: EMAIL });
    throw new Error(`nothing stubbed for ${url}`);
  }) as typeof fetch;
}

function token(iss: string): Promise<string> {
  return new SignJWT({ email: EMAIL, email_verified: true })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(iss)
    .setSubject(SUBJECT)
    .setAudience('client')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

function provider(configured: string): Oidc {
  return new Oidc('eduid', configured, { clientId: 'client', clientSecret: 'secret' }, REDIRECT);
}

async function refusal(run: Promise<unknown>): Promise<Diag> {
  const error: unknown = await run.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(Diag);
  return error as Diag;
}

describe('the identifier an issuer publishes for itself', () => {
  test('a trailing slash is not a different issuer', async () => {
    /** eduID is reached at the bare origin and calls itself with a slash. Both are eduID. */
    serve({ configured: 'https://login.eduid.ch', published: 'https://login.eduid.ch/' });

    const profile = await provider('https://login.eduid.ch').finish('code', 'verifier');
    expect(profile.subject).toBe(SUBJECT);
    expect(profile.email).toBe(EMAIL);
  });

  test('a tenant a multi-tenant document leaves open is whatever the token puts there', async () => {
    serve({
      configured: 'https://login.microsoftonline.com/common/v2.0',
      published: 'https://login.microsoftonline.com/{tenantid}/v2.0',
      stated: 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0',
    });

    const profile = await provider('https://login.microsoftonline.com/common/v2.0').finish(
      'code',
      'verifier',
    );
    expect(profile.subject).toBe(SUBJECT);
  });

  test('an issuer with a path is asked for its configuration under that path', async () => {
    serve({
      configured: 'https://login.microsoftonline.com/common/v2.0',
      published: 'https://login.microsoftonline.com/{tenantid}/v2.0',
      stated: 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0',
    });

    await provider('https://login.microsoftonline.com/common/v2.0').finish('code', 'verifier');
    expect(asked[0]).toBe('https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration');
  });

  test('a token signed for another issuer at the same keys is refused', async () => {
    serve({
      configured: 'https://login.eduid.ch',
      published: 'https://login.eduid.ch/',
      stated: 'https://login.eduid.ch/tenants/somebody-else',
    });

    const diag = await refusal(provider('https://login.eduid.ch').finish('code', 'verifier'));
    expect(diag.code).toBe(Codes.claims);
  });

  test('a configuration that names another host is refused', async () => {
    serve({ configured: 'https://login.eduid.ch', published: 'https://evil.example' });

    const diag = await refusal(provider('https://login.eduid.ch').finish('code', 'verifier'));
    expect(diag.code).toBe(Codes.discovery);
  });
});
