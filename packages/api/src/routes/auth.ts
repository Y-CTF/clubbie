import { Codes as AuthCodes } from '@clubbie/auth';
import { type MemberId, Site } from '@clubbie/core';
import { type Code, Diag } from '@clubbie/diag';
import { Codes as StoreCodes } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { vValidator } from '@hono/valibot-validator';
import { type Context, Hono } from 'hono';
import { Check } from '../check.ts';
import { Codes } from '../codes.ts';
import type { Env } from '../context.ts';
import { Cookie } from '../cookie.ts';
import { Fail, Refusal } from '../fail.ts';
import { Input } from '../input.ts';

/**
 * A sign-in diagnostic as an HTTP refusal.
 *
 * `Auth` throws diagnostics rather than `Fail`s, because it sits below the API and knows nothing
 * about status codes. What it does know is what went wrong, and that is what this maps: without
 * it every one of them fell through to the unhandled branch and reached the member as a 503
 * saying something went wrong on our side, which is both untrue and unactionable when the real
 * answer is "this club is for members of ethz.ch".
 */
const REFUSALS: Partial<Record<Code, Refusal>> = {
  /** The address belongs to an account created another way: a conflict, not a server fault. */
  [StoreCodes.identity]: Refusal.Conflict,
  [AuthCodes.provider]: Refusal.Missing,
  [AuthCodes.organisation]: Refusal.Forbidden,
  [AuthCodes.unverified]: Refusal.Forbidden,
  [AuthCodes.claims]: Refusal.Forbidden,
  [AuthCodes.profile]: Refusal.Forbidden,
  [AuthCodes.discovery]: Refusal.Unavailable,
  [AuthCodes.exchange]: Refusal.Unavailable,
  /** A spent or mistyped code is the caller's to fix, not an outage. */
  [AuthCodes.expired]: Refusal.Invalid,
};

/**
 * Links the chat that was waiting on an address, if there was one. Signing in with Telegram and
 * then proving an address is one act, so the member comes out with both rather than being asked
 * to link the bot again from their profile.
 */
async function adopt(c: Context<Env>, memberId: MemberId): Promise<void> {
  const waiting = await Cookie.held(c, c.get('options').secret);
  if (!waiting) return;

  await c.get('store').links.attach(memberId, waiting.id, waiting.username);
  c.get('log').info('telegram linked by enrolment', { member: memberId });
}

/** Rethrows whatever sign-in threw, as the refusal it deserves. A stranger is never a 503. */
function refuse(error: unknown): never {
  if (error instanceof Diag) throw Fail.because(REFUSALS[error.code] ?? Refusal.Unavailable, error);
  throw error;
}

/**
 * The sign-in flow, which is the only part of the API that redirects rather than answering JSON:
 * a browser has to be handed to the provider and handed back.
 *
 * The state is compared against the one parked at the start, and the parked copy is consumed
 * whether or not it matches, so a replayed callback finds nothing to compare against.
 */
export const auth = new Hono<Env>()
  .get('/providers', (c) => c.json({ providers: c.get('auth').names }))

  /**
   * The Telegram login widget. It proves a chat and nothing else: Telegram releases no address,
   * and a member is keyed on one, so a chat nobody here knows waits in a signed cookie while the
   * address is proved by mail. An existing member simply gets a session.
   */
  .post('/telegram', vValidator('json', Input.login, Check.body), async (c) => {
    const store = c.get('store');
    const secret = c.get('options').secret;
    const log = c.get('log').child('auth', { provider: 'telegram' });

    const chatter = await c
      .get('auth')
      .chat.verify(c.req.valid('json'))
      .catch((error: unknown) => refuse(error));

    const member = await store.links.byChat(chatter.id);
    if (!member) {
      await Cookie.hold(c, secret, { id: chatter.id, name: chatter.name, username: chatter.username });
      log.info('telegram proved a chat with no member');
      return c.json({ enrol: true });
    }

    await store.links.attach(member.id, chatter.id, chatter.username);
    const minted = await c.get('auth').session(member);
    Cookie.session(c, minted.token, minted.expiresAt);
    log.info('signed in', { member: member.id });
    return c.json({ enrol: false });
  })

  /**
   * Asking for a sign-in mail. It answers the same way whether or not the address is one this
   * club knows, because a page that said "no such member" would be a way to ask who is one.
   */
  .post('/email', vValidator('json', Input.signin, Check.body), async (c) => {
    const { email } = c.req.valid('json');
    const log = c.get('log').child('auth', { provider: 'email' });
    const post = c.get('options').post;

    if (!post) {
      throw Fail.because(
        Refusal.Unavailable,
        Diag.error(Codes.auth.callback, 'this club cannot sign anybody in by email')
          .note('no mail transport is configured')
          .help('sign in with one of the other providers, or ask an organiser'),
      );
    }

    const requested = await c
      .get('auth')
      .mail.open(email)
      .catch((error: unknown) => refuse(error));

    const url = new URL(Site.Api.signin(requested.token), c.get('options').baseUrl).toString();
    await post(requested.email, url, requested.code).catch((error: unknown) => {
      log.error('could not send a sign-in mail', error);
      throw Fail.because(
        Refusal.Unavailable,
        Diag.error(Codes.auth.callback, 'the sign-in mail could not be sent')
          .note('the club\u2019s mail provider would not take it')
          .help('try again in a minute, or sign in another way'),
      );
    });

    log.info('sign-in mail sent');
    return c.json({ sent: true, expiresAt: requested.expiresAt.toISOString() });
  })

  /** The link half. A browser follows it, so it redirects rather than answering JSON. */
  .get('/email/:token', vValidator('param', Input.params.signin, Check.param), async (c) => {
    const session = await c
      .get('auth')
      .mail.claim(c.req.valid('param').token)
      .then((profile) => c.get('auth').admit(profile))
      .catch((error: unknown) => refuse(error));

    await adopt(c, session.member.id);
    Cookie.session(c, session.token, session.expiresAt);
    c.get('log').info('signed in', { member: session.member.id, provider: 'email' });
    return c.redirect(c.get('options').home ?? '/');
  })

  /** The code half, answered in the tab that asked. */
  .post('/email/code', vValidator('json', Input.code, Check.body), async (c) => {
    const { email, code } = c.req.valid('json');
    const session = await c
      .get('auth')
      .mail.answer(email, code)
      .then((profile) => c.get('auth').admit(profile))
      .catch((error: unknown) => refuse(error));

    await adopt(c, session.member.id);
    Cookie.session(c, session.token, session.expiresAt);
    c.get('log').info('signed in', { member: session.member.id, provider: 'email' });
    return c.json({ ok: true });
  })

  .get('/:provider', vValidator('param', Input.params.provider, Check.param), async (c) => {
    const { provider } = c.req.valid('param');
    const log = c.get('log').child('auth', { provider });

    const pending = await c
      .get('auth')
      .begin(provider)
      .catch((error: unknown) => {
        log.warn('could not start sign-in', { reason: String(error) });
        return refuse(error);
      });

    await Cookie.park(c, c.get('options').secret, {
      provider,
      state: pending.state,
      verifier: pending.verifier,
    });
    log.debug('sign-in started');
    return c.redirect(pending.url.toString());
  })

  .get(
    '/:provider/callback',
    vValidator('param', Input.params.provider, Check.param),
    vValidator('query', Input.callback, Check.query),
    async (c) => {
      const { provider } = c.req.valid('param');
      const log = c.get('log').child('auth', { provider });
      const { code, state, error } = c.req.valid('query');
      const flow = await Cookie.take(c, c.get('options').secret);

      if (error) {
        log.warn('provider refused', { reason: error });
        throw Fail.because(
          Refusal.Forbidden,
          Diag.error(Codes.auth.refused, markup`*${provider}* refused the sign-in`).note(
            markup`it said: ${error}`,
          ),
        );
      }

      if (!code || !state) {
        throw Fail.invalid(
          Diag.error(Codes.auth.callback, 'the callback carried no authorisation code')
            .over('callback', new URL(c.req.url).search)
            .help('start again from the sign-in page rather than reloading this url'),
        );
      }

      if (!flow || flow.provider !== provider || flow.state !== state) {
        log.warn('state did not match', { parked: flow?.provider ?? null });
        throw Fail.because(
          Refusal.Forbidden,
          Diag.error(Codes.auth.state, 'this sign-in did not start here')
            .note('the state cookie is missing, expired, or was minted for another provider')
            .help('start again from the sign-in page; the flow lasts ten minutes'),
        );
      }

      const session = await c
        .get('auth')
        .complete(provider, code, flow.verifier)
        .catch((error: unknown) => {
          log.warn('could not finish sign-in', { reason: String(error) });
          return refuse(error);
        });
      Cookie.session(c, session.token, session.expiresAt);
      log.info('signed in', {
        member: session.member.id,
        status: session.member.status,
        role: session.member.role,
      });

      return c.redirect(c.get('options').home ?? '/');
    },
  )

  .post('/logout', async (c) => {
    const token = Cookie.read(c);
    if (token) await c.get('auth').signOut(token);
    Cookie.clear(c);
    c.get('log').info('signed out', { member: c.get('member')?.id ?? null });
    return c.json({ ok: true });
  });
