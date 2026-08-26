import { beforeEach, describe, expect, test } from 'bun:test';
import type { Member } from '@clubbie/core';
import { Logger } from '@clubbie/log';
import { Store } from '@clubbie/store';
import { Auth } from '../src/auth.ts';
import { Token } from '../src/session.ts';

const NOW = new Date('2026-03-01T12:00:00Z');
const BASE = 'http://localhost';

let store: Store;
let auth: Auth;

async function signIn(member: Member, at: Date): Promise<string> {
  const minted = await Token.mint(at);
  await store.sessions.open(minted.digest, member.id, minted.expiresAt, at);
  return minted.token;
}

beforeEach(async () => {
  const { log } = Logger.memory();
  store = await Store.open(Store.MEMORY, log);
  auth = Auth.create(store, { baseUrl: BASE, providers: {} });
});

describe('Token', () => {
  test('a token is stored as its digest, never as itself', async () => {
    const minted = await Token.mint(NOW);
    expect(minted.digest).not.toBe(minted.token);
    expect(minted.digest).toBe(await Token.digest(minted.token));
  });

  test('a session is stale only once it is halfway through its life', () => {
    const fresh = new Date(NOW.getTime() + Token.TTL);
    const nearly = new Date(NOW.getTime() + Token.TTL / Token.RENEW / 2);

    expect(Token.stale(fresh, NOW)).toBe(false);
    expect(Token.stale(nearly, NOW)).toBe(true);
  });
});

describe('Auth', () => {
  test('a fresh session resolves without being written to', async () => {
    const member = await store.members.enroll(
      { provider: 'test', subject: 'ada', email: 'ada@example.org', name: 'ada', avatar: null },
      NOW,
    );
    const token = await signIn(member, NOW);

    const resolved = await auth.resolve(token, NOW);
    expect(resolved?.member.id).toBe(member.id);
    expect(resolved?.renewed).toBe(false);
  });

  /** The window slides: a member who keeps using the club app is never signed out by the clock. */
  test('a session past halfway is renewed, and says so', async () => {
    const member = await store.members.enroll(
      { provider: 'test', subject: 'alan', email: 'alan@example.org', name: 'alan', avatar: null },
      NOW,
    );
    const token = await signIn(member, NOW);
    const later = new Date(NOW.getTime() + Token.TTL - 1000);

    const resolved = await auth.resolve(token, later);
    expect(resolved?.renewed).toBe(true);
    expect(resolved?.expiresAt.getTime()).toBe(later.getTime() + Token.TTL);

    /** And it is the stored session that moved, not just the answer. */
    const again = await auth.resolve(token, new Date(later.getTime() + Token.TTL - 1000));
    expect(again).not.toBeNull();
  });

  test('an expired session resolves to nobody', async () => {
    const member = await store.members.enroll(
      { provider: 'test', subject: 'ken', email: 'ken@example.org', name: 'ken', avatar: null },
      NOW,
    );
    const token = await signIn(member, NOW);

    expect(await auth.resolve(token, new Date(NOW.getTime() + Token.TTL + 1000))).toBeNull();
  });

  test('signing out ends the session everywhere it was valid', async () => {
    const member = await store.members.enroll(
      { provider: 'test', subject: 'grace', email: 'grace@example.org', name: 'grace', avatar: null },
      NOW,
    );
    const token = await signIn(member, NOW);

    await auth.signOut(token);
    expect(await auth.resolve(token, NOW)).toBeNull();
  });
});
