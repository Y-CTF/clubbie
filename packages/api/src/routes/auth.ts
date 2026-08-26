import { Codes as AuthCodes } from '@clubbie/auth';
import { type Code, Diag } from '@clubbie/diag';
import { Codes as StoreCodes } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { vValidator } from '@hono/valibot-validator';
import { Hono } from 'hono';
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
};

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
