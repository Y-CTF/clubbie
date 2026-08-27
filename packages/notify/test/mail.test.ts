import { afterEach, describe, expect, test } from 'bun:test';
import { markup } from '@clubbie/term';
import { Email } from '../src/email.ts';
import { Transports } from '../src/mail/registry.ts';
import type { Mailbox } from '../src/mail/transport.ts';
import { Message } from '../src/message.ts';

const FROM = 'club@example.org';
const TO = 'ada@example.org';

const MESSAGE = new Message({
  subject: markup`the club: *training night*`,
  from: { name: 'the club', accent: '#2563eb', why: 'you are a member.' },
  title: markup`*training night*`,
  lead: 'it starts at seven',
  facts: [{ of: 'where', label: 'where', value: 'HG F 30' }],
  note: null,
  action: null,
});

const original = globalThis.fetch;

/** One request as a test reads it: the body is text, whether the transport wrote JSON or a form. */
interface Sent {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

/** Records what a transport put on the wire, and answers with whatever the test asked for. */
function record(status = 200): { sent(): Sent } {
  const calls: Sent[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method),
      headers: init.headers as Record<string, string>,
      body: String(init.body),
    });
    return new Response(status === 200 ? '{}' : 'refused', { status });
  }) as typeof fetch;

  return {
    sent(): Sent {
      const [first] = calls;
      if (!first) throw new Error('the transport sent nothing');
      return first;
    },
  };
}

function mailbox(extra: Partial<Mailbox> = {}): Mailbox {
  return { from: FROM, key: 'key', ...extra };
}

afterEach(() => {
  globalThis.fetch = original;
});

describe('email transports', () => {
  test('every transport in the table sends, and names the member it was given', async () => {
    for (const name of Transports.NAMES.filter((one) => one !== 'smtp')) {
      const wire = record();
      await Email.over(name, mailbox({ secret: 'secret', domain: 'example.org' })).send(TO, MESSAGE);

      const sent = wire.sent();
      expect(sent.method).toBe('POST');
      /** Either spelling: one of them writes a form, where the `@` is escaped. */
      expect(sent.body.includes(TO) || sent.body.includes(encodeURIComponent(TO))).toBe(true);
    }
  });

  test('resend takes the shape it documents', async () => {
    const wire = record();
    await Email.over('resend', mailbox()).send(TO, MESSAGE);

    const sent = wire.sent();
    expect(sent.url).toContain('api.resend.com');
    expect(JSON.parse(sent.body)).toMatchObject({ from: FROM, to: [TO] });
  });

  test('postmark authenticates with its server token rather than a bearer', async () => {
    const wire = record();
    await Email.over('postmark', mailbox()).send(TO, MESSAGE);

    const sent = wire.sent();
    expect(sent.headers['x-postmark-server-token']).toBe('key');
    expect(JSON.parse(sent.body)).toMatchObject({ From: FROM, To: TO });
  });

  test('sendgrid puts the html part last, which is the one a client prefers', async () => {
    const wire = record();
    await Email.over('sendgrid', mailbox()).send(TO, MESSAGE);

    expect(JSON.parse(wire.sent().body).content.at(-1).type).toBe('text/html');
  });

  test('mailgun posts a form to the domain it sends for', async () => {
    const wire = record();
    await Email.over('mailgun', mailbox({ domain: 'mail.example.org' })).send(TO, MESSAGE);

    const sent = wire.sent();
    expect(sent.url).toContain('/v3/mail.example.org/messages');
    expect(sent.headers['content-type']).toContain('form-urlencoded');
    expect(new URLSearchParams(sent.body).get('to')).toBe(TO);
  });

  test('mailjet authenticates with the pair it was given', async () => {
    const wire = record();
    await Email.over('mailjet', mailbox({ secret: 'secret' })).send(TO, MESSAGE);

    expect(wire.sent().headers.authorization).toBe(`Basic ${btoa('key:secret')}`);
  });

  test('brevo names its own header', async () => {
    const wire = record();
    await Email.over('brevo', mailbox()).send(TO, MESSAGE);

    expect(wire.sent().headers['api-key']).toBe('key');
  });

  test('an endpoint set by the deployment wins over the provider it belongs to', async () => {
    const wire = record();
    await Email.over('resend', mailbox({ endpoint: 'https://relay.example.org/send' })).send(TO, MESSAGE);

    expect(wire.sent().url).toBe('https://relay.example.org/send');
  });

  test('a refusal is a diagnostic naming the transport, so the queue can retry it', async () => {
    record(422);
    const send = Email.over('resend', mailbox()).send(TO, MESSAGE);

    await expect(send).rejects.toThrow(/resend/);
  });

  test('both halves go out: the layout, and the text for a client that will not render it', async () => {
    const wire = record();
    await Email.over('resend', mailbox()).send(TO, MESSAGE);

    const sent = JSON.parse(wire.sent().body);
    expect(sent.html).toContain('<table');
    expect(sent.text).toContain('training night');
    /**
     * The subject carries the emphasis as written rather than as an escape sequence, which is
     * what `Markup.strip` is for and what `hostile.test.ts` holds every channel to.
     */
    expect(sent.subject).toBe('the club: *training night*');
  });

  test('the table says what a transport is missing rather than that it is misconfigured', () => {
    expect(Transports.missing('mailgun', { from: FROM, key: 'key' })).toEqual(['domain']);
    expect(Transports.missing('smtp', { from: FROM })).toEqual(['url']);
    expect(Transports.missing('resend', { from: FROM, key: 'key' })).toEqual([]);
  });
});
