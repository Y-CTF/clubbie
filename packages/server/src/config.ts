import { type Credentials, type Named, Providers, type Spec } from '@clubbie/auth';
import { Brand } from '@clubbie/core';
import { type Code, Diag, type Span } from '@clubbie/diag';
import { Level } from '@clubbie/log';
import { Store } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { Codes } from './codes.ts';

export interface Config {
  readonly databaseUrl: string;
  readonly baseUrl: string;
  readonly secret: string;
  readonly port: number;
  readonly level: Level;
  readonly json: boolean;
  readonly assets: string;
  readonly providers: Partial<Record<Named, Partial<Credentials>>>;
  readonly telegram: string | null;
  /** Set when something in front of this process rewrites `x-forwarded-for` and its relatives. */
  readonly trustProxy: boolean;
  /** Set together or not at all: an email channel needs a key and an address it may send from. */
  readonly email: Mail | null;
}

export interface Mail {
  readonly key: string;
  readonly from: string;
  readonly endpoint: string | undefined;
}

/**
 * The environment, read once and reported as diagnostics rather than as a thrown string.
 *
 * A misconfigured deployment is the most common way this app fails, and it fails before anyone
 * can look at a log level, so every refusal here points at the variable it means, in a rendering
 * of the environment as it was actually seen (secrets redacted), and says what to do about it.
 *
 * Provider variables are not listed here: `Providers` owns them, so a new provider adds itself to
 * the reading, the validation and the redaction at once.
 */
export namespace Config {
  export const VARS = {
    databaseUrl: 'DATABASE_URL',
    baseUrl: 'BASE_URL',
    secret: 'SESSION_SECRET',
    port: 'PORT',
    level: Level.ENV,
    json: 'LOG_JSON',
    assets: 'ASSETS',
    telegram: 'TELEGRAM_TOKEN',
    trustProxy: 'TRUST_PROXY',
    emailKey: 'EMAIL_API_KEY',
    emailFrom: 'EMAIL_FROM',
    emailEndpoint: 'EMAIL_ENDPOINT',
  } as const;

  export const DEFAULTS = {
    databaseUrl: Store.file(Brand.db),
    baseUrl: 'http://localhost:3000',
    port: 3000,
    assets: 'packages/web/dist',
  } as const;

  /** A session secret shorter than this is not worth signing a cookie with. */
  export const SECRET = 32;
  export const PORTS = { min: 1, max: 65535 } as const;
  /** What the environment is called when a diagnostic underlines a line of it. */
  export const SOURCE = 'environment';
  /**
   * Variables whose value is never printed, however a diagnostic renders them. Each provider's
   * secret is named by `Providers`, which is the table that already knows which variable is which.
   */
  export const HIDDEN: readonly string[] = [
    ...Providers.secrets(),
    VARS.secret,
    VARS.telegram,
    VARS.emailKey,
  ];
  export const MASK = 8;
  /**
   * Variables that carry a secret without saying so in their name. A connection string is the
   * whole list: `DATABASE_URL` reads like an address and is `postgres://user:hunter2@host/db`,
   * and a boot that refuses a bad `PORT` prints the environment it read while doing it.
   */
  export const SECRETS: readonly string[] = [VARS.databaseUrl];
  /** What a redacted password is shown as, so the shape of the url survives the redaction. */
  export const MASKED = '***';
  /** Written in an environment flag, these mean off. Anything else set means on. */
  export const OFF: readonly string[] = ['false', '0', 'no', 'off'];
  /** The only two schemes a member's browser can follow back from a provider. */
  export const SCHEMES: readonly string[] = ['http:', 'https:'];

  export type Source = Record<string, string | undefined>;

  /** One environment variable as the diagnostic sees it: a line of text, and where it sits. */
  interface Entry {
    readonly name: string;
    readonly shown: string;
    readonly span: Span;
  }

  export function read(env: Source = globalThis.process?.env ?? {}): Config {
    const seen = entries(env);

    const port = Number(env[VARS.port] ?? DEFAULTS.port);
    if (!Number.isInteger(port) || port < PORTS.min || port > PORTS.max) {
      throw fault(
        seen,
        Codes.config.port,
        VARS.port,
        markup`a port is a whole number between ${PORTS.min} and ${PORTS.max}`,
      ).help(markup`remove \`${VARS.port}\` to use ${DEFAULTS.port}`);
    }

    const secret = env[VARS.secret] ?? '';
    if (secret.length < SECRET) {
      throw fault(
        seen,
        Codes.config.secret,
        VARS.secret,
        secret
          ? markup`this secret is ${secret.length} characters, ${SECRET} is the minimum`
          : 'no session secret is set',
      )
        .note('it signs the cookie that carries an in-flight sign-in')
        .help('generate one with `openssl rand -base64 32`');
    }

    const baseUrl = (env[VARS.baseUrl] ?? DEFAULTS.baseUrl).replace(/\/$/, '');
    if (!absolute(baseUrl)) {
      throw fault(seen, Codes.config.baseUrl, VARS.baseUrl, 'this is not an absolute url')
        .note('oauth redirect urls are built from it')
        .help('write the origin members reach, such as `https://clubbie.example.org`');
    }

    return {
      databaseUrl: env[VARS.databaseUrl] ?? DEFAULTS.databaseUrl,
      baseUrl,
      secret,
      port,
      level: Level.parse(env[VARS.level]),
      json: flag(env[VARS.json]),
      assets: env[VARS.assets] ?? DEFAULTS.assets,
      providers: providers(env, seen),
      telegram: env[VARS.telegram] ?? null,
      trustProxy: flag(env[VARS.trustProxy]),
      email: email(env, seen),
    };
  }

  /**
   * Whether a flag is on. `Boolean(env[name])` is the version this replaced, and it read
   * `TRUST_PROXY=false` as trust the proxy, which handed the rate limiter's key to whoever was
   * sending the requests. An unset variable is off; a set one is on unless it says otherwise.
   */
  export function flag(value: string | undefined): boolean {
    const text = value?.trim().toLowerCase() ?? '';
    return text !== '' && !OFF.includes(text);
  }

  /** A url a browser can be sent to: parseable, http or https, with a host. */
  function absolute(value: string): boolean {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return SCHEMES.includes(url.protocol) && url.hostname !== '';
  }

  /**
   * The email channel, which is all of its variables or none of them. Half of it is refused here
   * for the same reason half a provider is: a club finds out at the moment it needed to send.
   */
  function email(env: Source, seen: readonly Entry[]): Mail | null {
    const key = env[VARS.emailKey];
    const from = env[VARS.emailFrom];
    if (!key && !from) return null;

    if (!key || !from) {
      const missing = key ? VARS.emailFrom : VARS.emailKey;
      const present = key ? VARS.emailKey : VARS.emailFrom;
      throw fault(seen, Codes.config.email, missing, 'the email channel is half configured')
        .note(markup`\`${present}\` is set, \`${missing}\` is not`)
        .help('set both to send email, or neither to send none');
    }

    return { key, from, endpoint: env[VARS.emailEndpoint] };
  }

  /**
   * Reads every provider through the registry. A half-configured one is refused here rather than
   * at the redirect, which is the difference between a boot that fails and a member who cannot
   * sign in on a Sunday.
   */
  function providers(env: Source, seen: readonly Entry[]): Config['providers'] {
    const out: Record<string, Partial<Credentials>> = {};
    for (const name of Providers.NAMES) {
      const credentials = read_(env, Providers.spec(name).vars);
      whole(name, credentials, Providers.spec(name).vars, seen);
      out[name] = credentials;
    }
    return out;
  }

  /** One provider's credentials, taking only the variables that were actually set. */
  function read_(env: Source, vars: Spec['vars']): Partial<Credentials> {
    const clientId = env[vars.clientId];
    const clientSecret = env[vars.clientSecret];
    const issuer = vars.issuer ? env[vars.issuer] : undefined;

    return {
      ...(clientId ? { clientId } : {}),
      ...(clientSecret ? { clientSecret } : {}),
      ...(issuer ? { issuer } : {}),
    };
  }

  /** Refuses an id without a secret, or a secret without an id, naming the one that is missing. */
  function whole(
    name: string,
    credentials: Partial<Credentials>,
    vars: Spec['vars'],
    seen: readonly Entry[],
  ): void {
    if (Boolean(credentials.clientId) === Boolean(credentials.clientSecret)) return;

    const missing = credentials.clientId ? vars.clientSecret : vars.clientId;
    const present = credentials.clientId ? vars.clientId : vars.clientSecret;
    throw fault(seen, Codes.config.provider, missing, markup`*${name}* is half configured`)
      .note(markup`\`${present}\` is set, \`${missing}\` is not`)
      .help('set both, or neither');
  }

  /**
   * The environment as a diagnostic shows it: one `KEY=value` line per variable, secrets masked,
   * each carrying the span it occupies. The spans are built with the text rather than searched
   * for afterwards, so a value that happens to look like another variable cannot mislabel a
   * caret.
   */
  export function entries(env: Source): Entry[] {
    const names = [...new Set([...Object.values(VARS), ...Providers.all()])];
    const out: Entry[] = [];
    let offset = 0;

    for (const name of names) {
      const shown = `${name}=${redact(name, env[name])}`;
      out.push({ name, shown, span: { start: offset, end: offset + shown.length } });
      offset += shown.length + 1;
    }
    return out;
  }

  export function render(env: Source): string {
    return entries(env)
      .map((entry) => entry.shown)
      .join('\n');
  }

  export function redact(name: string, value: string | undefined): string {
    if (value === undefined) return '';
    if (SECRETS.includes(name)) return credentials(value);
    if (!HIDDEN.includes(name)) return value;
    return `${'*'.repeat(Math.min(value.length, MASK))} (${value.length} characters)`;
  }

  /**
   * A connection string with its password taken out and everything else left in. Which host and
   * which database is what an operator reading a failed boot needs; the password is what they
   * must not find in a log they later paste into an issue.
   */
  export function credentials(url: string): string {
    if (!URL.canParse(url)) return url;

    const parsed = new URL(url);
    if (!parsed.password) return url;

    parsed.password = MASKED;
    return parsed.toString();
  }

  /** A diagnostic underlining one variable, in the environment as it was read. */
  function fault(seen: readonly Entry[], code: Code, name: string, message: string): Diag {
    const text = seen.map((entry) => entry.shown).join('\n');
    const entry = seen.find((candidate) => candidate.name === name);
    const diag = Diag.error(code, message).over(SOURCE, text);
    return entry ? diag.label(entry.span, message) : diag;
  }
}
