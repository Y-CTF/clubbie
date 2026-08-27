import { Diag } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import { Codes } from '../codes.ts';
import type { Mail, Mailbox, Wire } from './transport.ts';

/** As much of nodemailer as this uses, so the lazy import needs no types from the package. */
interface Mailer {
  sendMail(mail: Record<string, string>): Promise<unknown>;
}

interface Nodemailer {
  createTransport(url: string, defaults?: Record<string, unknown>): Mailer;
}

/**
 * A real mail server, which is what most clubs already have: the university relay, the hosting
 * package that came with the domain, a box in a cupboard.
 *
 * It is the one transport with a dependency, imported when the first message is sent rather than
 * at the top of the file: a deployment sending over an HTTP API never loads it, and a missing
 * module is a diagnostic naming the command to run rather than a boot that dies inside an import.
 *
 * The specifier is written out rather than held in a constant, unlike `pg` in the store. It has
 * to be: `bun build --compile` follows a literal dynamic import and bundles what it finds, and
 * follows nothing at all through a variable, so the single-binary deployment would carry an smtp
 * transport that cannot find its own module.
 */
export class Smtp implements Wire {
  readonly name = 'smtp';
  static readonly PACKAGE = 'nodemailer';
  /** The url schemes a mail server is reached at, checked at boot rather than at first send. */
  static readonly SCHEMES: readonly string[] = ['smtp:', 'smtps:'];

  private mailer: Promise<Mailer> | null = null;

  constructor(private readonly credentials: Mailbox) {}

  async deliver(mail: Mail): Promise<void> {
    const mailer = await this.connect();
    await mailer
      .sendMail({ from: mail.from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text })
      .catch((error: unknown) => {
        throw Diag.error(Codes.email, markup`the mail server refused a message`)
          .note(markup`it said: ${error instanceof Error ? error.message : String(error)}`)
          .help('check the smtp url, its credentials, and that the server relays for this sender');
      });
  }

  /**
   * The connection pool, built once. Nodemailer keeps and reuses the sockets, which is what makes
   * a queue draining thirty reminders one conversation with the server rather than thirty.
   */
  private connect(): Promise<Mailer> {
    this.mailer ??= Smtp.load()
      .then((nodemailer) => nodemailer.createTransport(this.credentials.url ?? '', { pool: true }))
      .catch((error: unknown) => {
        this.mailer = null;
        throw error;
      });
    return this.mailer;
  }

  private static async load(): Promise<Nodemailer> {
    try {
      const module = (await import('nodemailer')) as unknown as {
        default?: Nodemailer;
      } & Partial<Nodemailer>;
      const nodemailer = module.default ?? module;
      if (typeof nodemailer.createTransport === 'function') return nodemailer as Nodemailer;
      throw new Error('the module exports no createTransport');
    } catch (error) {
      throw Diag.error(Codes.email, markup`sending over smtp needs *${Smtp.PACKAGE}*`)
        .note(markup`it said: ${error instanceof Error ? error.message : String(error)}`)
        .help(markup`run \`bun add ${Smtp.PACKAGE}\`, or send over a provider's api instead`);
    }
  }
}
