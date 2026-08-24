import { describe, expect, test } from 'bun:test';
import { Render } from '@clubbie/diag';
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
