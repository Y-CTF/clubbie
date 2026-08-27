import { beforeEach, describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { Input } from '../src/input.ts';
import { type Harness, harness } from './harness.ts';

/**
 * What a provider is allowed to send a member back with.
 *
 * The callback is the one input this app does not shape, and the bound on it used to be the one
 * written for the strings it mints itself. eduID's authorisation code is several hundred
 * characters, so every sign-in through it was refused by the schema before the flow began.
 */
let h: Harness;

beforeEach(async () => {
  h = await harness();
});

describe('the sign-in callback', () => {
  test("a provider's long authorisation code is accepted", () => {
    const code = 'a'.repeat(687);
    expect(v.safeParse(Input.callback, { code, state: 'state' }).success).toBe(true);
  });

  test('a code is still bounded, because it arrives in a url from somewhere else', () => {
    const code = 'a'.repeat(Input.GRANT + 1);
    expect(v.safeParse(Input.callback, { code, state: 'state' }).success).toBe(false);
  });

  test('the state this app minted is held to the length this app mints', () => {
    const state = 'a'.repeat(Input.TOKEN + 1);
    expect(v.safeParse(Input.callback, { code: 'code', state }).success).toBe(false);
  });

  /**
   * Through HTTP rather than the schema alone: a long code has to reach the flow and be refused
   * for having no cookie, which is what happens to any callback that arrives without one.
   */
  test('a long code reaches the flow rather than the validator', async () => {
    const code = 'a'.repeat(687);
    const response = await h.app.request(`/auth/eduid/callback?code=${code}&state=state`);

    expect(response.status).not.toBe(400);
  });
});
