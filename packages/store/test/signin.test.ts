import { beforeEach, describe, expect, test } from 'bun:test';
import { Signin } from '@clubbie/core';
import type { Store } from '../src/index.ts';
import { Fixture } from './harness.ts';

const NOW = new Date('2026-03-01T12:00:00Z');
const ADDRESS = 'ada@example.org';

let store: Store;

beforeEach(async () => {
  store = await Fixture.open();
});

describe('a request to sign in with an address', () => {
  test('is spent by its link, once', async () => {
    const { token } = await store.signins.open(ADDRESS, NOW);

    expect(await store.signins.claim(token, NOW)).toBe(ADDRESS);
    /** A mail scanner that opens the link before the member gets nothing the second time. */
    expect(await store.signins.claim(token, NOW)).toBeNull();
  });

  test('is spent by its code, once', async () => {
    const { code } = await store.signins.open(ADDRESS, NOW);

    expect(await store.signins.answer(ADDRESS, code, NOW)).toBe(ADDRESS);
    expect(await store.signins.answer(ADDRESS, code, NOW)).toBe('unknown');
  });

  test('and spending one way spends the other', async () => {
    const { token, code } = await store.signins.open(ADDRESS, NOW);

    expect(await store.signins.claim(token, NOW)).toBe(ADDRESS);
    expect(await store.signins.answer(ADDRESS, code, NOW)).toBe('unknown');
  });

  test('lasts exactly as long as it says', async () => {
    const { token, expiresAt } = await store.signins.open(ADDRESS, NOW);
    expect(expiresAt.getTime()).toBe(NOW.getTime() + Signin.TTL);

    const late = new Date(expiresAt.getTime() + 1);
    expect(await store.signins.claim(token, late)).toBeNull();
  });

  /** Six digits are only safe because guesses are counted. This is the counting. */
  test('survives a wrong code twice and is spent by the third', async () => {
    const { code } = await store.signins.open(ADDRESS, NOW);
    const wrong = code === '000000' ? '111111' : '000000';

    expect(await store.signins.answer(ADDRESS, wrong, NOW)).toBe('unknown');
    expect(await store.signins.answer(ADDRESS, wrong, NOW)).toBe('unknown');
    expect(await store.signins.answer(ADDRESS, wrong, NOW)).toBe('exhausted');

    /** And the real code is worth nothing afterwards, which is the point of spending it. */
    expect(await store.signins.answer(ADDRESS, code, NOW)).toBe('unknown');
  });

  /**
   * Pressing the button twice must leave one way in. Two live codes means the one a member reads
   * is whichever mail arrived first, which is a sign-in that fails for no visible reason.
   */
  test('asking again retires the request before it', async () => {
    const first = await store.signins.open(ADDRESS, NOW);
    const second = await store.signins.open(ADDRESS, NOW);

    expect(await store.signins.claim(first.token, NOW)).toBeNull();
    expect(await store.signins.claim(second.token, NOW)).toBe(ADDRESS);
  });

  test('one address does not answer for another', async () => {
    const { code } = await store.signins.open(ADDRESS, NOW);

    expect(await store.signins.answer('alan@example.org', code, NOW)).toBe('unknown');
    expect(await store.signins.answer(ADDRESS, code, NOW)).toBe(ADDRESS);
  });

  test('the sweep drops what is spent and what has run out', async () => {
    const { token } = await store.signins.open(ADDRESS, NOW);
    await store.signins.claim(token, NOW);
    await store.signins.open('alan@example.org', NOW);

    expect(await store.signins.sweep(NOW)).toBe(1);
    expect(await store.signins.sweep(new Date(NOW.getTime() + Signin.TTL + 1))).toBe(1);
  });
});
