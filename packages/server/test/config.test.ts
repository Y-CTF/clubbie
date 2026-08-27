import { describe, expect, test } from 'bun:test';
import { Key } from '@clubbie/auth';
import { Render } from '@clubbie/diag';
import { Transports } from '@clubbie/notify';
import { Paint } from '@clubbie/term';
import { Config } from '../src/config.ts';

const SECRET = 'x'.repeat(Config.SECRET);
const MINIMAL = { SESSION_SECRET: SECRET };

function fails(env: Config.Source): { code: string; text: string } {
  try {
    Config.read(env);
  } catch (error) {
    return { code: (error as { code: string }).code, text: Render.text(error as never, Paint.plain) };
  }
  throw new Error('expected the config to be refused');
}

describe('Config', () => {
  test('a minimal environment reads with defaults', () => {
    const config = Config.read(MINIMAL);
    expect(config.databaseUrl).toBe(Config.DEFAULTS.databaseUrl);
    expect(config.port).toBe(Config.DEFAULTS.port);
    expect(config.level).toBe('info');
    expect(config.telegram).toBeNull();
  });

  test('no session secret is refused, with the command that makes one', () => {
    const { code, text } = fails({});
    expect(code).toBe('config.secret');
    expect(text).toContain('openssl rand -base64 32');
  });

  test('a bad port underlines the variable in the environment as it was read', () => {
    const { code, text } = fails({ ...MINIMAL, PORT: '99999' });
    expect(code).toBe('config.port');
    expect(text).toContain('PORT=99999');
    expect(text).toContain('^');
  });

  test('a base url that is not absolute is refused', () => {
    expect(fails({ ...MINIMAL, BASE_URL: 'clubbie' }).code).toBe('config.baseUrl');
  });

  test('half a provider is refused, naming the half that is missing', () => {
    const { code, text } = fails({ ...MINIMAL, GITHUB_CLIENT_ID: 'id' });
    expect(code).toBe('config.provider');
    expect(text).toContain('GITHUB_CLIENT_SECRET');
  });

  test('both halves of a provider are read through the registry', () => {
    const config = Config.read({ ...MINIMAL, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' });
    expect(config.providers.github).toEqual({ clientId: 'id', clientSecret: 'secret' });
  });

  test('an openid connect provider may sign in with a key instead of a secret', () => {
    const config = Config.read({
      ...MINIMAL,
      OIDC_CLIENT_ID: 'id',
      OIDC_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----',
      OIDC_ISSUER: 'https://id.example.org',
    });

    /** The literal `\n` a one-line environment carries is read as the newline a pem needs. */
    expect(config.providers.oidc?.key?.pem).toContain('\n');
    expect(config.providers.oidc?.key?.algorithm).toBe(Key.ALGORITHM);
  });

  test('a generic openid connect provider without an issuer is refused', () => {
    const { code, text } = fails({ ...MINIMAL, OIDC_CLIENT_ID: 'id', OIDC_CLIENT_SECRET: 'secret' });
    expect(code).toBe('config.issuer');
    expect(text).toContain('OIDC_ISSUER');
  });

  test('a named provider carries its own issuer, so it needs none', () => {
    const config = Config.read({ ...MINIMAL, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
    expect(config.providers.google?.clientId).toBe('id');
  });

  test('a key handed to a provider that cannot use one is refused rather than ignored', () => {
    const { code } = fails({ ...MINIMAL, GITHUB_CLIENT_ID: 'id', GITHUB_PRIVATE_KEY: 'pem' });
    expect(code).toBe('config.provider');
  });

  test('email defaults to the transport most clubs use', () => {
    const config = Config.read({ ...MINIMAL, EMAIL_FROM: 'club@example.org', EMAIL_API_KEY: 'key' });
    expect(config.email?.transport).toBe(Transports.DEFAULT);
  });

  test('a transport nobody has heard of is refused, listing the ones there are', () => {
    const { code, text } = fails({
      ...MINIMAL,
      EMAIL_FROM: 'club@example.org',
      EMAIL_TRANSPORT: 'carrier-pigeon',
    });
    expect(code).toBe('config.transport');
    expect(text).toContain('smtp');
  });

  test('a transport is refused for what it is missing, by name', () => {
    const { code, text } = fails({
      ...MINIMAL,
      EMAIL_FROM: 'club@example.org',
      EMAIL_TRANSPORT: 'mailgun',
      EMAIL_API_KEY: 'key',
    });
    expect(code).toBe('config.email');
    expect(text).toContain('EMAIL_DOMAIN');
  });

  test('a mailjet key without its secret is refused', () => {
    const { text } = fails({
      ...MINIMAL,
      EMAIL_FROM: 'club@example.org',
      EMAIL_TRANSPORT: 'mailjet',
      EMAIL_API_KEY: 'key',
    });
    expect(text).toContain('EMAIL_API_SECRET');
  });

  test('smtp needs a url and nothing else', () => {
    const config = Config.read({
      ...MINIMAL,
      EMAIL_FROM: 'club@example.org',
      EMAIL_TRANSPORT: 'smtp',
      EMAIL_SMTP_URL: 'smtp://user:hunter2@mail.example.org:587',
    });
    expect(config.email?.transport).toBe('smtp');
  });

  test('an smtp url is redacted like any other connection string', () => {
    const rendered = Config.render({
      ...MINIMAL,
      EMAIL_SMTP_URL: 'smtp://user:hunter2@mail.example.org:587',
    });
    expect(rendered).not.toContain('hunter2');
    expect(rendered).toContain('mail.example.org');
  });

  test('a channel with a key and no sender is refused', () => {
    const { code, text } = fails({ ...MINIMAL, EMAIL_API_KEY: 'key' });
    expect(code).toBe('config.email');
    expect(text).toContain('EMAIL_FROM');
  });

  test('secrets are never printed, whatever a diagnostic renders', () => {
    const rendered = Config.render({ ...MINIMAL, TELEGRAM_TOKEN: 'bot-token-value' });
    expect(rendered).not.toContain(SECRET);
    expect(rendered).not.toContain('bot-token-value');
    expect(rendered).toContain('characters)');
  });

  test('a trailing slash on the base url is dropped, so redirects do not double it', () => {
    expect(Config.read({ ...MINIMAL, BASE_URL: 'https://club.example/' }).baseUrl).toBe(
      'https://club.example',
    );
  });
});
