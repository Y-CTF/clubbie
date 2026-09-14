import { beforeEach, describe, expect, test } from 'bun:test';
import { Codes as AuthCodes } from '@clubbie/auth';
import { Signin, Site } from '@clubbie/core';
import { type Harness, harness, refusal } from './harness.ts';

const ADDRESS = 'ada@example.org';

let h: Harness;

beforeEach(async () => {
  h = await harness();
});

async function ask(email = ADDRESS): Promise<Response> {
  return await h.call('/auth/email', { method: 'POST', body: JSON.stringify({ email }) });
}

/**
 * The path out of the absolute url a mail carries. The harness mounts the API at the root, so the
 * `/api` the link is written with comes back off.
 */
function path(url: string): string {
  return new URL(url).pathname.slice(Site.API.length);
}

describe('signing in with an address', () => {
  test('is offered beside the configured providers', async () => {
    const { providers } = (await (await h.call('/auth/providers')).json()) as { providers: string[] };
    expect(providers).toContain(Signin.PROVIDER);
  });

  test('is not offered by a club that cannot send mail', async () => {
    const silent = await harness({ email: false });
    const { providers } = (await (await silent.call('/auth/providers')).json()) as {
      providers: string[];
    };

    expect(providers).not.toContain(Signin.PROVIDER);
    expect(
      (await silent.call('/auth/email', { method: 'POST', body: JSON.stringify({ email: ADDRESS }) })).status,
    ).toBe(503);
  });

  test('sends one mail carrying a link and a code', async () => {
    expect((await ask()).status).toBe(200);

    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]?.to).toBe(ADDRESS);
    expect(h.posted[0]?.code).toMatch(/^\d{6}$/);
    expect(new URL(h.posted[0]?.url ?? '').pathname).toStartWith('/api/auth/email/');
  });

  test('the link signs the member in and creates them', async () => {
    await ask();

    const response = await h.call(path(h.posted[0]?.url ?? ''), { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('set-cookie')).toContain('clubbie_session=');

    const member = await h.store.members.byEmail(ADDRESS);
    expect(member?.email).toBe(ADDRESS);
    /** Whoever signs in first runs the club, however they proved who they were. */
    expect(member?.role).toBe('admin');
  });

  test('the code signs the member in, in the tab that asked', async () => {
    await ask();

    const response = await h.call('/auth/email/code', {
      method: 'POST',
      body: JSON.stringify({ email: ADDRESS, code: h.posted[0]?.code }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('clubbie_session=');
  });

  test('the code is read however it was copied', async () => {
    await ask();

    const spaced = Signin.grouped(h.posted[0]?.code ?? '');
    const response = await h.call('/auth/email/code', {
      method: 'POST',
      body: JSON.stringify({ email: ADDRESS, code: spaced }),
    });

    expect(response.status).toBe(200);
  });

  test('a link is good once', async () => {
    await ask();
    const link = path(h.posted[0]?.url ?? '');

    expect((await h.call(link, { redirect: 'manual' })).status).toBe(302);
    expect((await h.call(link, { redirect: 'manual' })).status).toBe(422);
  });

  test('a wrong code is refused and says what to do', async () => {
    await ask();

    const response = await h.call('/auth/email/code', {
      method: 'POST',
      body: JSON.stringify({ email: ADDRESS, code: '000001' }),
    });

    expect(response.status).toBe(422);
    expect((await refusal(response)).diag.code).toBe(AuthCodes.expired);
  });

  /**
   * The door is asked before the mail is sent rather than after it is answered: a club that takes
   * one university has no business mailing an address it was always going to refuse.
   */
  test('a club with a door refuses the address rather than mailing it', async () => {
    await h.store.club.update({ domains: ['ethz.ch'] });

    const response = await ask('somebody@example.org');
    expect(response.status).toBe(403);
    expect(h.posted).toHaveLength(0);

    expect((await ask('somebody@ethz.ch')).status).toBe(200);
    expect(h.posted).toHaveLength(1);
  });

  test('an address that is not one is refused before anything is written', async () => {
    const response = await h.call('/auth/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'not an address' }),
    });

    expect(response.status).toBe(422);
    expect(h.posted).toHaveLength(0);
  });

  /** An address already held by another provider is the existing conflict, not a second account. */
  test('an address another provider already holds is a conflict', async () => {
    await h.store.members.enroll({
      provider: 'github',
      subject: 'gh-ada',
      email: ADDRESS,
      name: 'Ada',
      avatar: null,
    });

    await ask();
    const response = await h.call(path(h.posted[0]?.url ?? ''), { redirect: 'manual' });
    expect(response.status).toBe(409);
  });
});
