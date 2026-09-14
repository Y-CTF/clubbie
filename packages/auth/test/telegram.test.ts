import { describe, expect, test } from 'bun:test';
import { Bytes } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { Codes } from '../src/codes.ts';
import { Login } from '../src/provider/telegram.ts';

const TOKEN = '8354471971:AAFtest-bot-token';
const NOW = new Date('2026-03-01T12:00:00Z');

/** Telegram's own recipe, so the test signs the way the widget does rather than the way we read. */
async function sign(payload: Record<string, string | number>): Promise<Record<string, unknown>> {
  const check = Object.entries(payload)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TOKEN));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(check));
  return { ...payload, hash: Bytes.hex(mac) };
}

function payload(over: Record<string, string | number> = {}): Record<string, string | number> {
  return {
    id: 4242,
    first_name: 'Ada',
    last_name: 'Lovelace',
    username: 'ada',
    auth_date: Math.floor(NOW.getTime() / 1000),
    ...over,
  };
}

async function refusal(run: Promise<unknown>): Promise<Diag> {
  const error: unknown = await run.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(Diag);
  return error as Diag;
}

describe('a Telegram login', () => {
  const login = new Login(TOKEN);

  test('is the account the widget signed for', async () => {
    const chatter = await login.verify(await sign(payload()), NOW);

    expect(chatter.id).toBe('4242');
    expect(chatter.name).toBe('Ada Lovelace');
    expect(chatter.username).toBe('ada');
  });

  test('falls back to the username when no name was released', async () => {
    const signed = await sign({ id: 7, username: 'ada', auth_date: Math.floor(NOW.getTime() / 1000) });
    expect((await login.verify(signed, NOW)).name).toBe('ada');
  });

  test('a payload signed by another bot is refused', async () => {
    const signed = await sign(payload());
    const other = new Login('9999999999:AAFsomebody-elses-bot');

    expect((await refusal(other.verify(signed, NOW))).code).toBe(Codes.claims);
  });

  /** The signature covers the fields, so changing one after the fact has to break it. */
  test('a field changed after signing is refused', async () => {
    const signed = await sign(payload());

    expect((await refusal(login.verify({ ...signed, id: '9999' }, NOW))).code).toBe(Codes.claims);
  });

  /** A field the signature never covered must not be read as if it had been. */
  test('a field added after signing is refused', async () => {
    const signed = await sign(payload());

    expect((await refusal(login.verify({ ...signed, extra: 'smuggled' }, NOW))).code).toBe(Codes.claims);
  });

  test('a payload with no hash at all is refused', async () => {
    const { hash: _, ...bare } = await sign(payload());

    expect((await refusal(login.verify(bare, NOW))).code).toBe(Codes.claims);
  });

  test('a hash that is not hex is refused rather than throwing', async () => {
    const signed = await sign(payload());

    expect((await refusal(login.verify({ ...signed, hash: 'not hex' }, NOW))).code).toBe(Codes.claims);
  });

  /**
   * A signed payload stays valid forever on its own, so replaying yesterday's would be a way in
   * for anybody who ever saw one.
   */
  test('a payload older than the window is refused', async () => {
    const signed = await sign(payload());
    const late = new Date(NOW.getTime() + Login.FRESH + 1);

    expect((await refusal(login.verify(signed, late))).code).toBe(Codes.expired);
  });

  test('and one inside it is not', async () => {
    const signed = await sign(payload());
    const soon = new Date(NOW.getTime() + Login.FRESH - 1);

    expect((await login.verify(signed, soon)).id).toBe('4242');
  });
});
