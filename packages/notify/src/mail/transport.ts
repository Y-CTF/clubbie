import { Diag } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import { Codes } from '../codes.ts';

/** One mail, once a `Message` has been laid out. Every transport takes exactly this. */
export interface Mail {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/**
 * What a deployment was given to send with. A transport reads whatever of this it needs and the
 * config refuses one that is missing something, so nothing here is optional at the point of use.
 */
export interface Mailbox {
  readonly from: string;
  readonly key?: string | undefined;
  /** The second half of a key pair, for a provider that signs with two (Mailjet). */
  readonly secret?: string | undefined;
  /** The sending domain, for a provider whose url contains it (Mailgun). */
  readonly domain?: string | undefined;
  /** An smtp url, `smtp://user:pass@host:587` or `smtps://…`. */
  readonly url?: string | undefined;
  /** Overrides where a provider's api lives: a region, a self-hosted relay, a test double. */
  readonly endpoint?: string | undefined;
}

/**
 * One way of putting a mail on the wire.
 *
 * Every provider here is the same three decisions (a url, an authorization header, the shape of
 * the body) and nothing else, so `Post` makes those three abstract and each provider is the ten
 * lines that answer them. SMTP answers none of them and is a transport of its own.
 */
export interface Wire {
  readonly name: string;
  deliver(mail: Mail): Promise<void>;
}

/** A transport that POSTs one mail to a provider's HTTP API. */
export abstract class Post implements Wire {
  static readonly TYPE = 'application/json';
  static readonly FORM = 'application/x-www-form-urlencoded';
  /** How much of a provider's refusal is worth putting in a diagnostic. */
  static readonly EXCERPT = 200;

  abstract readonly name: string;
  /** Where this provider takes mail, unless the deployment named somewhere else. */
  protected abstract get url(): string;
  protected abstract headers(): Record<string, string>;
  protected abstract body(mail: Mail): BodyInit;

  constructor(protected readonly credentials: Mailbox) {}

  /** JSON unless a provider says otherwise, which is Mailgun and only Mailgun. */
  protected get type(): string {
    return Post.TYPE;
  }

  async deliver(mail: Mail): Promise<void> {
    const response = await fetch(this.credentials.endpoint ?? this.url, {
      method: 'POST',
      headers: { 'content-type': this.type, accept: Post.TYPE, ...this.headers() },
      body: this.body(mail),
    });
    if (response.ok) return;

    const detail = await response.text().catch(() => '');
    throw Diag.error(Codes.email, markup`*${this.name}* refused a message`)
      .note(markup`it answered ${response.status}: ${detail.slice(0, Post.EXCERPT)}`)
      .help('check the api key and that the from address is on a verified domain');
  }

  /** Basic authentication, for the providers that ask for a key pair rather than a token. */
  protected static basic(user: string, password: string): string {
    return `Basic ${btoa(`${user}:${password}`)}`;
  }

  /** A credential the config guaranteed is there, so its absence is a broken table, not a typo. */
  protected required(what: keyof Mailbox): string {
    const value = this.credentials[what];
    if (value) return value;
    throw new Error(`${this.name} was built without the ${what} it needs`);
  }
}
