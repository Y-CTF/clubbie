import { beforeEach, describe, expect, test } from 'bun:test';
import { Bytes, Signin, Site } from '@clubbie/core';
import { BOT, type Harness, harness } from './harness.ts';

let h: Harness;

beforeEach(async () => {
  h = await harness();
});

/** Signs the way the widget does, so the route is exercised rather than mocked past. */
async function widget(over: Record<string, string | number> = {}): Promise<Record<string, unknown>> {
  const payload = {
    id: 4242,
    first_name: 'Ada',
    username: 'ada',
    auth_date: Math.floor(Date.now() / 1000),
    ...over,
  };
  const check = Object.entries(payload)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(BOT));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return {
    ...payload,
    hash: Bytes.hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(check))),
  };
}

async function post(body: unknown, cookie?: string): Promise<Response> {
  return await h.call('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify(body),
    ...(cookie ? { cookie } : {}),
  });
}

/** The cookie header a browser would send back from a response that set one. */
function jar(response: Response): string {
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

describe('signing in with Telegram', () => {
  test('is offered when a bot is configured, and not when none is', async () => {
    const { providers } = (await (await h.call('/auth/providers')).json()) as { providers: string[] };
    expect(providers).toContain('telegram');

    const botless = await harness({ telegram: null });
    const answer = (await (await botless.call('/auth/providers')).json()) as { providers: string[] };
    expect(answer.providers).not.toContain('telegram');
  });

  test('is not drawn by a club that has switched it off in its ways in', async () => {
    await h.store.club.update({ providers: ['eduid'] });

    const answer = (await (await h.call('/auth/providers')).json()) as {
      providers: string[];
      telegram: string | null;
    };
    expect(answer.providers).not.toContain('telegram');
    expect(answer.telegram).toBeNull();

    await h.store.club.update({ providers: ['telegram'] });
    const back = (await (await h.call('/auth/providers')).json()) as { providers: string[] };
    expect(back.providers).toContain('telegram');
    expect(back.providers).not.toContain('eduid');
  });

  test('a payload this club did not sign is refused', async () => {
    const forged = { ...(await widget()), hash: 'f'.repeat(64) };
    expect((await post(forged)).status).toBe(403);
  });

  /**
   * Telegram releases no address and a member is keyed on one, so a chat nobody knows waits for
   * the mail rather than enrolling on its own.
   */
  test('a chat nobody knows is asked for an address first', async () => {
    const response = await post(await widget());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enrol: true });
    /** No session yet: proving a chat is not proving who you are here. */
    expect(response.headers.get('set-cookie') ?? '').not.toContain('clubbie_session=');
    expect(await h.store.members.count()).toBe(0);
  });

  test('and proving the address afterwards links the chat in one act', async () => {
    const held = jar(await post(await widget()));

    await h.call('/auth/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.org' }),
      cookie: held,
    });
    const link = new URL(h.posted[0]?.url ?? '').pathname.slice(Site.API.length);
    const response = await h.call(link, { redirect: 'manual', cookie: held });

    expect(response.status).toBe(302);
    const member = await h.store.members.byEmail('ada@example.org');
    expect(member).not.toBeNull();
    expect((await h.store.links.chat(member?.id ?? ('' as never)))?.chatId).toBe('4242');
  });

  test('a chat the club already knows is simply signed in', async () => {
    const ada = await h.member('ada');
    await h.store.links.attach(ada.id, '4242', 'ada');

    const response = await post(await widget());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enrol: false });
    expect(response.headers.get('set-cookie')).toContain('clubbie_session=');
  });

  /** Nothing about the address flow changes for somebody who never went near Telegram. */
  test('an ordinary email sign-in links no chat', async () => {
    await h.call('/auth/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'alan@example.org' }),
    });
    const link = new URL(h.posted[0]?.url ?? '').pathname.slice(Site.API.length);
    await h.call(link, { redirect: 'manual' });

    const member = await h.store.members.byEmail('alan@example.org');
    expect(await h.store.links.chat(member?.id ?? ('' as never))).toBeNull();
    expect(Signin.PROVIDER).toBe('email');
  });
});
