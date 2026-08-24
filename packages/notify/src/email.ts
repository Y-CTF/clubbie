import type { Channel } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { Markup, markup } from '@clubbie/term';
import type { Sender } from './channel.ts';
import { Codes } from './codes.ts';
import { Letter } from './letter.ts';
import type { Message } from './message.ts';

export interface Credentials {
  readonly key: string;
  /** The address members see, which a provider will only accept for a domain it has verified. */
  readonly from: string;
  readonly endpoint?: string | undefined;
}

/**
 * Email over a provider's HTTP API rather than SMTP. SMTP would mean a socket, a TLS story and a
 * queue of its own; a POST is a `fetch`, which every runtime this app targets already has, and the
 * retry story is the job queue that was needed anyway.
 *
 * The body shape is the one Resend and its API-compatible relatives take. A provider that wants a
 * different shape is a second class beside this one, not a flag inside it.
 */
export class Email implements Sender {
  readonly channel: Channel = 'email';
  /** Where a message goes when nothing else is configured. */
  static readonly ENDPOINT = 'https://api.resend.com/emails';
  static readonly TYPE = 'application/json';
  /** How much of a provider's answer is worth putting in a log line. */
  static readonly EXCERPT = 200;

  constructor(private readonly credentials: Credentials) {}

  async send(to: string, message: Message): Promise<void> {
    const response = await fetch(this.credentials.endpoint ?? Email.ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.credentials.key}`,
        'content-type': Email.TYPE,
      },
      body: JSON.stringify({
        from: this.credentials.from,
        to: [to],
        subject: Markup.strip(message.subject),
        /** Both halves: the layout for a client that renders it, the text for one that will not. */
        html: Letter.html(message),
        text: Letter.text(message),
      }),
    });

    if (response.ok) return;

    const detail = await response.text().catch(() => '');
    throw Diag.error(Codes.email, markup`the email provider refused a message`)
      .note(markup`it answered ${response.status}: ${detail.slice(0, Email.EXCERPT)}`)
      .help('check the api key and that the from address is on a verified domain');
  }
}
