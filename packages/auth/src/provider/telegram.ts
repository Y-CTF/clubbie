import { Millis } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { Codes } from '../codes.ts';

/** Who the widget says signed in, once its signature has been checked. */
export interface Chatter {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly photo: string | null;
}

/**
 * Telegram's login widget, verified.
 *
 * The widget hands the browser a payload signed with the bot's own token, so the club's bot is
 * the credential and there is no client secret to register. What it proves is a chat, and only
 * that: Telegram releases no address, so this cannot enrol anybody on its own.
 *
 * The freshness check is what makes the signature worth anything. The payload is signed but not
 * bound to a session, so an old one is replayable forever without it.
 */
export class Login {
  /** What this provider is called, beside `github` and `email`. */
  static readonly NAME = 'telegram';
  static readonly ALG = 'SHA-256';
  static readonly HMAC = { name: 'HMAC', hash: Login.ALG } as const;
  /** Telegram's own recommendation, and long enough for somebody who reads the consent screen. */
  static readonly FRESH = 5 * Millis.MINUTE;
  static readonly HASH = 'hash';
  static readonly SEP = '\n';
  static readonly PAIR = '=';
  /** Telegram writes seconds; everything here is milliseconds. */
  static readonly SECOND = Millis.SECOND;

  constructor(private readonly token: string) {}

  /**
   * The identity a payload proves, or a refusal.
   *
   * The check string is every field but the hash, sorted, which is Telegram's definition and not
   * a choice. Keys outside it are dropped rather than signed over, so a caller cannot smuggle an
   * extra field past a signature that never covered it.
   */
  async verify(payload: Record<string, unknown>, now: Date = new Date()): Promise<Chatter> {
    const given = Login.text(payload[Login.HASH]);
    const fields = Object.entries(payload)
      .filter(([key]) => key !== Login.HASH)
      .map(([key, value]) => [key, Login.text(value)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null);

    const check = [...fields]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}${Login.PAIR}${value}`)
      .join(Login.SEP);

    if (!given || !(await this.signed(check, given))) {
      throw Diag.error(Codes.claims, 'Telegram did not sign that sign-in')
        .note('the payload does not match this club’s bot')
        .help('start again from the sign-in page');
    }

    const said = Object.fromEntries(fields);
    const at = Number(said.auth_date) * Login.SECOND;
    if (!Number.isFinite(at) || now.getTime() - at > Login.FRESH) {
      throw Diag.error(Codes.expired, 'that Telegram sign-in is too old to use')
        .note('a signed payload stays valid forever unless it is used straight away')
        .help('start again from the sign-in page');
    }

    const id = said.id;
    if (!id) {
      throw Diag.error(Codes.claims, 'Telegram named no account').help('start again from the sign-in page');
    }

    return {
      id,
      name: [said.first_name, said.last_name].filter(Boolean).join(' ') || (said.username ?? id),
      username: said.username ?? null,
      photo: said.photo_url ?? null,
    };
  }

  /** Constant-time, because this compares a signature against one an attacker is choosing. */
  private async signed(check: string, given: string): Promise<boolean> {
    const secret = await crypto.subtle.digest(Login.ALG, new TextEncoder().encode(this.token));
    const key = await crypto.subtle.importKey('raw', secret, Login.HMAC, false, ['verify']);

    const bytes = Login.bytes(given);
    if (!bytes) return false;
    return crypto.subtle.verify(Login.HMAC, key, bytes, new TextEncoder().encode(check));
  }

  /** A lowercase hex signature as bytes, or null when it is not one at all. */
  private static bytes(hex: string): ArrayBuffer | null {
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
    return Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16)).buffer;
  }

  private static text(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  }
}
