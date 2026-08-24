import { type Member, Site } from '@clubbie/core';
import type { Tally } from '@clubbie/store';
import { Markup, markup, When } from '@clubbie/term';

/**
 * Everything the bot ever says, in one place.
 *
 * Replies are written in the same markup as diagnostics and rendered on the way out, because
 * Telegram is not a terminal: one vocabulary, three renderings, and no reply assembled ad hoc at a
 * command handler. Values go through the markup template, so a member's own name cannot open a
 * span or smuggle a control character into a chat message.
 */
export namespace Say {
  export const COMMANDS = {
    link: 'link',
    start: 'start',
    whoami: 'whoami',
    events: 'events',
    unlink: 'unlink',
  } as const;

  export type Command = (typeof COMMANDS)[keyof typeof COMMANDS];

  /** Where a member fetches a linking code. The path itself belongs to `Site`, not to a reply. */
  export const PROFILE = (baseUrl: string): string => Site.url(baseUrl, 'profile');

  export function needsCode(baseUrl: string): string {
    return text(markup`send me the code from ${PROFILE(baseUrl)}, like this:\n/link <code>`);
  }

  export function unlinked(baseUrl: string): string {
    return text(markup`this chat is not linked. get a code at ${PROFILE(baseUrl)}, then \`/link <code>\`.`);
  }

  /**
   * What a chat that is not one person is told. A link binds a chat id to a member, and every
   * personal notice for them is then delivered to it: in a group that means their email, their
   * role and every seat they win or lose is read out to everybody in the room, and any member of
   * that room can unlink them.
   */
  export function private_(): string {
    return text('link me in a direct message rather than in a group: this chat becomes your inbox.');
  }

  export function refused(): string {
    return text('that code is unknown, already used, or expired. get a fresh one and try again.');
  }

  export function linked(member: Member): string {
    return text(markup`linked to *${member.name}*. you are ${member.status}.`);
  }

  export function who(member: Member): string {
    return text(markup`*${member.name}* (${member.email})\nrole: ${member.role}\nstatus: ${member.status}`);
  }

  export function pending(): string {
    return text('an organiser has to admit you before you can see events.');
  }

  export function nothing(): string {
    return text('nothing is scheduled.');
  }

  export function upcoming(events: readonly Tally[]): string {
    return text(
      events
        .map(({ event, going }) => markup`${When.stamp(event.startsAt)}  *${event.title}*  ${going} going`)
        .join('\n'),
    );
  }

  export function broke(): string {
    return text('something went wrong on our side. try again in a moment.');
  }

  export function gone(): string {
    return text('unlinked. this chat no longer knows who you are.');
  }

  /**
   * Markup resolved to Telegram's own html: emphasis arrives as emphasis rather than as a pair of
   * asterisks, and no escape sequence or stray backslash goes with it. The bot sends every reply
   * in this format, which is why it is decided here and not at a call site.
   */
  function text(source: string): string {
    return Markup.html(source);
  }
}
