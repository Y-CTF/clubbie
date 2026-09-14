import type { Channel } from '@clubbie/core';
import { Markup } from '@clubbie/term';
import type { Sender } from './channel.ts';
import { type Fact, Message, type Role } from './message.ts';

/**
 * What a chat platform is, to this package: something that takes a chat id and some html. The
 * markup a notice is written in is rendered before it gets here, so the sender's only job is to
 * tell the platform which format it is reading.
 */
export type Chat = (to: string, html: string) => Promise<void>;

/**
 * Telegram, as a channel. The bot itself stays in `@clubbie/bot`: this holds a function that
 * sends, so `notify` never depends on grammy and a test can pass a closure that records.
 *
 * The subject is not sent. It is the club's name and the event's title, and both are already in
 * the message: a chat window says who is writing at the top of it, so an announcement that opened
 * with `Y-CTF: Weekly meeting` and then said `Weekly meeting` was reading itself back twice.
 *
 * Telegram parses a small subset of html rather than the whole thing, which is why the layout is
 * lines and not a table: `<b>`, `<i>`, `<a>` and `<blockquote>` are in it, and anything that lays
 * out a page is not. A fact is a glyph and a value rather than a word and a value, because a chat
 * message is read in a column two inches wide next to forty others, and a repeated `where:` in the
 * same weight as everything around it is a wall. The glyph is the label: it says which fact this
 * is at a glance and in any language.
 */
export class Telegram implements Sender {
  readonly channel: Channel = 'telegram';

  /**
   * What each fact wears in a chat. It is keyed by the fact's role rather than by its label, so a
   * German club gets the same pin on the same line, and a fact this table has no glyph for falls
   * back to its word rather than disappearing.
   */
  static readonly GLYPHS: Readonly<Record<Role, string>> = {
    when: '🗓',
    kind: '🏷',
    where: '📍',
    places: '👥',
    closes: '⏳',
    until: '⏳',
    code: '🔑',
  };

  constructor(private readonly chat: Chat) {}

  async send(to: string, message: Message): Promise<void> {
    await this.chat(to, Telegram.html(message));
  }

  /** One fact, as a chat line: the glyph in place of the label, the value as it was typed. */
  static fact(fact: Fact): string {
    const glyph = Telegram.GLYPHS[fact.of];
    return glyph ? `${glyph} ${Markup.html(fact.value)}` : Markup.html(Message.line(fact));
  }

  static html(message: Message): string {
    const blocks = [
      Markup.html(message.title),
      Markup.html(message.lead),
      message.facts.map(Telegram.fact).join(Message.LINE),
      message.note === null ? '' : `<blockquote>${Markup.html(message.note)}</blockquote>`,
      message.action === null
        ? ''
        : `<a href="${Markup.attr(message.action.url)}">${Markup.html(message.action.label)}</a>`,
    ];
    return blocks.filter(Boolean).join(Message.SEP);
  }
}
