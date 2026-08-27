import { type Credentials, Key, type Named, Provider, Providers, type Spec } from '@clubbie/auth';
import { Brand } from '@clubbie/core';
import { type Code, Diag, type Span } from '@clubbie/diag';
import { Level } from '@clubbie/log';
import { type Mailbox, type Transport, Transports } from '@clubbie/notify';
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
  /** The email channel, or nothing. What it needs depends on which transport it sends over. */
  readonly email: Mail | null;
}

/** An email channel: which wire it leaves on, and the credentials that wire asked for. */
export interface Mail extends Mailbox {
  readonly transport: Transport;
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
    emailTransport: 'EMAIL_TRANSPORT',
    emailFrom: 'EMAIL_FROM',
    emailKey: 'EMAIL_API_KEY',
    emailSecret: 'EMAIL_API_SECRET',
    emailDomain: 'EMAIL_DOMAIN',
    emailUrl: 'EMAIL_SMTP_URL',
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
    VARS.emailSecret,
  ];
  export const MASK = 8;
  /**
   * Variables that carry a secret without saying so in their name. Both are connection strings:
   * `DATABASE_URL` reads like an address and is `postgres://user:hunter2@host/db`, an smtp url
   * carries the mailbox password the same way, and a boot that refuses a bad `PORT` prints the
   * environment it read while doing it.
   */
  export const SECRETS: readonly string[] = [VARS.databaseUrl, VARS.emailUrl];
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
   * The email channel, read through `Transports`: which wire, and everything that wire needs.
   *
   * A club sends over one of several providers or over its own mail server, and each of them asks
   * for something different, so what is required here is the table's answer rather than a list
   * written twice. What has not changed is when it refuses: a channel that is half configured is
   * a boot that fails, not a club that finds out at the moment it needed to send.
   */
  function email(env: Source, seen: readonly Entry[]): Mail | null {
    const from = env[VARS.emailFrom];
    const credentials: Partial<Mailbox> = {
      ...(from ? { from } : {}),
      ...pick(env, { key: VARS.emailKey, secret: VARS.emailSecret }),
      ...pick(env, { domain: VARS.emailDomain, url: VARS.emailUrl, endpoint: VARS.emailEndpoint }),
    };
    const named = env[VARS.emailTransport]?.trim().toLowerCase();
    /** Nothing at all is a club that sends no email, which is a supported way to run this. */
    if (!named && Object.keys(credentials).length === 0) return null;

    const transport = named ?? Transports.DEFAULT;
    if (!Transports.known(transport)) {
      throw fault(
        seen,
        Codes.config.transport,
        VARS.emailTransport,
        markup`there is no email transport called ${transport}`,
      ).help(markup`it is one of ${Transports.NAMES.join(', ')}`);
    }

    if (!from) {
      throw fault(seen, Codes.config.email, VARS.emailFrom, 'the email channel has no sender')
        .note('every provider refuses a message with no address to send it from')
        .help(markup`set \`${VARS.emailFrom}\` to an address on a domain the provider has verified`);
    }

    const missing = Transports.missing(transport, credentials);
    if (missing.length > 0) {
      const vars = missing.map((need) => NEEDS[need]);
      throw fault(
        seen,
        Codes.config.email,
        vars[0] ?? VARS.emailTransport,
        markup`*${transport}* cannot send with what it was given`,
      )
        .note(markup`it needs ${vars.map((name) => `\`${name}\``).join(' and ')}`)
        .help(markup`set them, or choose another transport with \`${VARS.emailTransport}\``);
    }

    return { transport, from, ...credentials };
  }

  /**
   * Which variable carries which credential, so a refusal can name the thing an operator has to
   * go and set rather than the field this code happens to call it.
   */
  const NEEDS: Record<keyof Mailbox, string> = {
    from: VARS.emailFrom,
    key: VARS.emailKey,
    secret: VARS.emailSecret,
    domain: VARS.emailDomain,
    url: VARS.emailUrl,
    endpoint: VARS.emailEndpoint,
  };

  /** The variables that were actually set, under the names the credentials use. */
  function pick<K extends string>(env: Source, vars: Record<K, string>): Partial<Record<K, string>> {
    const out: Partial<Record<K, string>> = {};
    for (const [field, name] of Object.entries(vars) as [K, string][]) {
      const value = env[name];
      if (value) out[field] = value;
    }
    return out;
  }

  /**
   * Reads every provider through the registry. A half-configured one is refused here rather than
   * at the redirect, which is the difference between a boot that fails and a member who cannot
   * sign in on a Sunday.
   */
  function providers(env: Source, seen: readonly Entry[]): Config['providers'] {
    const out: Record<string, Partial<Credentials>> = {};
    for (const name of Providers.NAMES) {
      const spec = Providers.spec(name);
      const credentials = read_(env, spec.vars);
      whole(name, credentials, spec.vars, seen);
      issued(name, credentials, spec.vars, seen);
      out[name] = credentials;
    }
    return out;
  }

  /**
   * Refuses a provider that has credentials and no issuer to use them against. Only the generic
   * OpenID Connect entry can be in that state: every named provider carries its own issuer, and
   * this one is whichever one the deployment runs, so nothing but the environment can say.
   */
  function issued(
    name: Named,
    credentials: Partial<Credentials>,
    vars: Spec['vars'],
    seen: readonly Entry[],
  ): void {
    if (!vars.issuer || credentials.issuer || !Providers.needsIssuer(name)) return;
    if (!Provider.configured(credentials)) return;

    throw fault(seen, Codes.config.issuer, vars.issuer, markup`*${name}* has no issuer`)
      .note('a generic openid connect provider is only identified by the issuer it discovers from')
      .help(markup`set \`${vars.issuer}\` to its origin, such as \`https://id.example.org\``);
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
      ...(key(env, vars) ? { key: key(env, vars) } : {}),
    };
  }

  /**
   * The private key a provider signs its assertions with, when one is configured.
   *
   * A PEM carries newlines and an environment variable is one line in most of the places these
   * are set, so `\n` written literally is read as a newline. Without that a deployment that has
   * pasted a perfectly good key into a compose file gets "invalid keyData" at the first sign-in.
   */
  function key(env: Source, vars: Spec['vars']): Key | undefined {
    if (!vars.privateKey) return undefined;

    const pem = env[vars.privateKey]?.replace(/\\n/g, '\n').trim();
    if (!pem) return undefined;

    const id = vars.keyId ? env[vars.keyId] : undefined;
    return {
      pem,
      ...(id ? { id } : {}),
      algorithm: (vars.algorithm ? env[vars.algorithm] : undefined) || Key.ALGORITHM,
    };
  }

  /**
   * Refuses a provider that is half configured, naming the half that is missing.
   *
   * What proves a client is a secret or a key, and a provider that takes keys is complete with
   * either. A key handed to a provider that cannot use one is refused rather than ignored: it was
   * set by somebody who believed it was doing something.
   */
  function whole(
    name: Named,
    credentials: Partial<Credentials>,
    vars: Spec['vars'],
    seen: readonly Entry[],
  ): void {
    if (credentials.key && !Providers.keyed(name)) {
      throw fault(seen, Codes.config.provider, vars.clientSecret, markup`*${name}* takes no private key`)
        .note('only an openid connect provider authenticates with a key instead of a secret')
        .help(markup`sign in to ${name} with \`${vars.clientSecret}\` instead`);
    }

    const proof = Boolean(credentials.clientSecret || credentials.key);
    if (Boolean(credentials.clientId) === proof) return;

    const missing = credentials.clientId ? vars.clientSecret : vars.clientId;
    const present = credentials.clientId ? vars.clientId : vars.clientSecret;
    const diag = fault(seen, Codes.config.provider, missing, markup`*${name}* is half configured`).note(
      markup`\`${present}\` is set, \`${missing}\` is not`,
    );
    throw Providers.keyed(name) && vars.privateKey
      ? diag.help(markup`set both, or set \`${vars.privateKey}\` instead of a secret, or set neither`)
      : diag.help('set both, or neither');
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
