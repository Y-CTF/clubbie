import { Auth, Token } from '@clubbie/auth';
import type { Event, KindId, Member } from '@clubbie/core';
import { Logger } from '@clubbie/log';
import { Store } from '@clubbie/store';
import { Api } from '../src/app.ts';
import { Cookie } from '../src/cookie.ts';
import type { Body } from '../src/fail.ts';

/**
 * A whole API over an in-memory database, plus a way to call it as a signed-in member.
 *
 * Every API test goes through HTTP rather than through the repositories, because that is the
 * contract the SPA, the calendar clients and the bot actually see: a route that forgets its guard
 * is only visible from out here.
 */
export const SECRET = 'a'.repeat(32);
export const BASE = 'http://localhost';
export const NOW = new Date('2026-03-01T12:00:00Z');
export const DAY = 24 * 60 * 60 * 1000;
/** One of the club's starter kinds, which migration 9 writes for every database. */
export const KIND = 'workshop' as KindId;

export type Harness = Awaited<ReturnType<typeof harness>>;

/** Every sign-in mail the app tried to send, so a test can read the link and the code it carried. */
export interface Sent {
  readonly to: string;
  readonly url: string;
  readonly code: string;
}

export const BOT = '8354471971:AAFtest-bot-token';

export async function harness({
  email = true,
  telegram = BOT,
}: {
  email?: boolean;
  telegram?: string | null;
} = {}) {
  const { log } = Logger.memory();
  const store = await Store.open(Store.MEMORY, log);
  const auth = Auth.create(store, { baseUrl: BASE, providers: {}, email, telegram });
  const posted: Sent[] = [];
  const app = Api.create({
    store,
    auth,
    log,
    secret: SECRET,
    baseUrl: BASE,
    ...(email && {
      post: async (to: string, url: string, code: string) => {
        posted.push({ to, url, code });
      },
    }),
  });

  /** Signs a member in the way the callback does, without going near a provider. */
  async function signIn(member: Member): Promise<string> {
    const minted = await Token.mint();
    await store.sessions.open(minted.digest, member.id, minted.expiresAt, NOW);
    return `${Cookie.SESSION}=${minted.token}`;
  }

  /**
   * A member with a role and a status of the test's choosing. The role is always set explicitly,
   * because whoever signs in first is an admin and a test that forgot would silently be one.
   */
  async function member(
    name: string,
    status: 'pending' | 'active' | 'alumni' = 'active',
    role: 'admin' | 'member' = 'member',
  ): Promise<Member> {
    const enrolled = await store.members.enroll(
      { provider: 'test', subject: name, email: `${name}@example.org`, name, avatar: null },
      NOW,
    );
    return (await store.members.update(enrolled.id, { status, role })) ?? enrolled;
  }

  async function event(organiser: Member, capacity: number | null = null): Promise<Event> {
    return store.events.create(
      {
        title: 'Workshop, Zürich',
        kind: KIND,
        state: 'published',
        startsAt: new Date(Date.now() + DAY),
        capacity,
        listed: true,
      },
      organiser.id,
    );
  }

  const call = (path: string, init: RequestInit & { cookie?: string } = {}) =>
    app.request(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...init.headers,
      },
    });

  return { store, app, call, signIn, member, event, posted };
}

/** The refusal a response carries, which is what a test about a refusal actually asserts on. */
export async function refusal(response: Response): Promise<Body['error']> {
  return ((await response.json()) as Body).error;
}
