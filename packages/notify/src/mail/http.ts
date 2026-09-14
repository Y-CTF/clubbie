import { Net } from '@clubbie/core';
import { type Mail, Post } from './transport.ts';

/**
 * The providers that take a mail as one HTTP request.
 *
 * They differ only in the three things `Post` asks for, and each of them is written here rather
 * than in a file of its own because a file per provider would be four lines of import for ten
 * lines of body shape. What they share is the interesting part; what they disagree about is
 * `From` against `from` against `sender`.
 */
export namespace Http {
  /** Resend, and everything that copied its API. The default a deployment gets. */
  export class Resend extends Post {
    readonly name = 'resend';

    protected get url(): string {
      return 'https://api.resend.com/emails';
    }

    protected headers(): Record<string, string> {
      return { authorization: `Bearer ${this.required('key')}` };
    }

    protected body(mail: Mail): string {
      return JSON.stringify({
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        /** Both halves: the layout for a client that renders it, the text for one that will not. */
        html: mail.html,
        text: mail.text,
      });
    }
  }

  /** Postmark, which authenticates with a server token rather than a bearer. */
  export class Postmark extends Post {
    readonly name = 'postmark';

    protected get url(): string {
      return 'https://api.postmarkapp.com/email';
    }

    protected headers(): Record<string, string> {
      return { 'x-postmark-server-token': this.required('key') };
    }

    protected body(mail: Mail): string {
      return JSON.stringify({
        From: mail.from,
        To: mail.to,
        Subject: mail.subject,
        HtmlBody: mail.html,
        TextBody: mail.text,
        /** Postmark bills a club's notices as transactional, which is what they are. */
        MessageStream: 'outbound',
      });
    }
  }

  /** SendGrid, whose body is a personalisation list and whose parts are typed content entries. */
  export class SendGrid extends Post {
    readonly name = 'sendgrid';

    protected get url(): string {
      return 'https://api.sendgrid.com/v3/mail/send';
    }

    protected headers(): Record<string, string> {
      return { authorization: `Bearer ${this.required('key')}` };
    }

    protected body(mail: Mail): string {
      return JSON.stringify({
        personalizations: [{ to: [{ email: mail.to }] }],
        from: { email: mail.from },
        subject: mail.subject,
        /** Order matters to SendGrid: the last part is the one a client prefers. */
        content: [
          { type: 'text/plain', value: mail.text },
          { type: 'text/html', value: mail.html },
        ],
      });
    }
  }

  /**
   * Mailgun, which is a form post rather than JSON, authenticates as the user `api`, and puts the
   * sending domain in its url. The domain is the club's own, so it is configured rather than
   * guessed: a club sending as `hello@mail.example.org` may well be on the domain `example.org`.
   */
  export class Mailgun extends Post {
    readonly name = 'mailgun';
    static readonly HOST = 'https://api.mailgun.net/v3';
    static readonly USER = 'api';

    protected get url(): string {
      return `${Mailgun.HOST}/${this.required('domain')}/messages`;
    }

    protected override get type(): string {
      return Net.FORM;
    }

    protected headers(): Record<string, string> {
      return { authorization: Post.basic(Mailgun.USER, this.required('key')) };
    }

    protected body(mail: Mail): string {
      return new URLSearchParams({
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }).toString();
    }
  }

  /** Brevo, which takes a key in a header of its own. */
  export class Brevo extends Post {
    readonly name = 'brevo';

    protected get url(): string {
      return 'https://api.brevo.com/v3/smtp/email';
    }

    protected headers(): Record<string, string> {
      return { 'api-key': this.required('key') };
    }

    protected body(mail: Mail): string {
      return JSON.stringify({
        sender: { email: mail.from },
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
      });
    }
  }

  /** Mailjet, the one provider here that authenticates with a key and a secret. */
  export class Mailjet extends Post {
    readonly name = 'mailjet';

    protected get url(): string {
      return 'https://api.mailjet.com/v3.1/send';
    }

    protected headers(): Record<string, string> {
      return { authorization: Post.basic(this.required('key'), this.required('secret')) };
    }

    protected body(mail: Mail): string {
      return JSON.stringify({
        Messages: [
          {
            From: { Email: mail.from },
            To: [{ Email: mail.to }],
            Subject: mail.subject,
            HTMLPart: mail.html,
            TextPart: mail.text,
          },
        ],
      });
    }
  }
}
