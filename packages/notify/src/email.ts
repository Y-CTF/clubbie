import type { Channel } from '@clubbie/core';
import { Markup } from '@clubbie/term';
import type { Sender } from './channel.ts';
import { Letter } from './letter.ts';
import { type Named, Transports } from './mail/registry.ts';
import type { Mailbox, Wire } from './mail/transport.ts';
import type { Message } from './message.ts';

/**
 * Email, as one channel over whichever transport a deployment configured.
 *
 * The channel's job is the letter: a notice laid out as html and as text, addressed from the club.
 * Which wire it leaves on is `Transports`, because a club that moves from one provider to another
 * has changed nothing about what it sends. That split is also what let SMTP in: it is a transport
 * beside the others rather than a second implementation of a channel.
 */
export class Email implements Sender {
  readonly channel: Channel = 'email';

  private constructor(
    private readonly from: string,
    private readonly transport: Wire,
  ) {}

  /** The channel a deployment configured, built through the table that validated it. */
  static over(name: Named, credentials: Mailbox): Email {
    return new Email(credentials.from, Transports.make(name, credentials));
  }

  /** The transport this is sending over, which is what a boot line reports. */
  get via(): string {
    return this.transport.name;
  }

  async send(to: string, message: Message): Promise<void> {
    await this.transport.deliver({
      from: this.from,
      to,
      subject: Markup.strip(message.subject),
      /** Both halves: the layout for a client that renders it, the text for one that will not. */
      html: Letter.html(message),
      text: Letter.text(message),
    });
  }
}
