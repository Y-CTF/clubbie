import { Ability, Event, Millis } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { Logger } from '@clubbie/log';
import type { Store } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { type Context, Bot as Grammy } from 'grammy';
import { Codes } from './codes.ts';
import { Say } from './say.ts';

export interface Options {
  readonly token: string;
  readonly store: Store;
  readonly log: Logger;
  /** Where a member gets a linking code, printed in the replies that ask for one. */
  readonly baseUrl: string;
}

/**
 * The Telegram bot. It does two things and refuses everything else: it links a chat to a member,
 * and it answers questions about what is coming up.
 *
 * It holds no authority of its own. A chat is worth exactly what it is linked to, and every
 * answer goes through the same `Ability` the API uses, so a pending member learns nothing here
 * that the web app would not tell them either.
 */
export class Bot {
  /** What one invitation is worth: one person, for an hour. */
  static readonly SEATS = 1;
  static readonly INVITE = Millis.HOUR;
  static readonly SECOND = Millis.SECOND;
  /** The only kind of chat a member may link: a one-to-one conversation with the bot. */
  static readonly PRIVATE = 'private';

  /** How many events a `/events` reply lists before it stops. */
  static readonly LIMIT = 5;

  /**
   * How Telegram is told to read a message. Html rather than either markdown, because the markdown
   * flavours require escaping a dozen characters an event title is full of, and one missed escape
   * is a refused message rather than a mangled one.
   */
  static readonly FORMAT = 'HTML' as const;

  private readonly bot: Grammy;
  private readonly log: Logger;

  constructor(private readonly options: Options) {
    this.bot = new Grammy(options.token);
    this.log = options.log.child('bot');
    this.wire();
  }

  private wire(): void {
    this.bot.command(Say.COMMANDS.start, (c) => this.link(c));
    this.bot.command(Say.COMMANDS.link, (c) => this.link(c));
    this.bot.command(Say.COMMANDS.whoami, (c) => this.whoami(c));
    this.bot.command(Say.COMMANDS.events, (c) => this.events(c));
    this.bot.command(Say.COMMANDS.unlink, (c) => this.unlink(c));

    /** A failure never reaches Telegram as a stack trace: the member gets a sentence. */
    this.bot.catch(async (error) => {
      const diag = Diag.of(error.error, Codes.update);
      this.log.error('update failed', diag, { update: error.ctx.update.update_id });
      await Bot.say(error.ctx, Say.broke()).catch(() => {});
    });
  }

  async start(): Promise<void> {
    const me = await this.bot.api.getMe();
    this.log.info('bot online', { username: me.username });
    /**
     * Long polling runs for as long as the process does, so its promise is not awaited. It is
     * still caught: grammy rejects it when the loop dies, and an unhandled rejection takes the
     * whole process down, which is the api and the scheduler as well as the bot.
     */
    void this.bot.start({ onStart: () => this.log.debug('long polling started') }).catch((error: unknown) => {
      this.log.error(
        'long polling stopped',
        Diag.of(error, Codes.update)
          .note('the api, the web app and the scheduler are still running')
          .help('restart to pick the bot back up'),
      );
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
    this.log.info('bot stopped');
  }

  /** Redeems a code, which is the only way a chat ever becomes a member. */
  private async link(c: Context): Promise<void> {
    const code = c.match?.toString().trim();
    const chatId = Bot.chat(c);

    /**
     * Only a direct message. A group chat is a room, not a person, and binding one to a member
     * hands their notices, their email and their `/unlink` to everybody in it.
     */
    if (c.chat?.type !== Bot.PRIVATE) {
      await Bot.say(c, Say.private_());
      return;
    }

    if (!chatId) return;

    if (!code) {
      await Bot.say(c, Say.needsCode(this.options.baseUrl));
      return;
    }

    const member = await this.options.store.links.redeem(code, chatId, c.from?.username ?? null);
    if (!member) {
      this.log.warn('link refused', { chat: chatId });
      await Bot.say(c, Say.refused());
      return;
    }

    this.log.info('chat linked', { chat: chatId, member: member.id });
    await Bot.say(c, Say.linked(member));
  }

  /** Every reply leaves in the format the replies are written in, which is decided once, here. */
  private static say(c: Context, text: string): Promise<unknown> {
    return c.reply(text, { parse_mode: Bot.FORMAT });
  }

  /**
   * The chat an update came from, or nothing.
   *
   * `String(c.chat?.id ?? '')` was the version this replaced: the empty string is a value the
   * column accepts and matches on, so an update with no chat would have been resolved as whoever
   * happened to hold the empty row. A missing chat is a refusal, not a chat called nothing.
   */
  private static chat(c: Context): string | null {
    return c.chat === undefined ? null : String(c.chat.id);
  }

  private async whoami(c: Context): Promise<void> {
    const member = await this.member(c);
    if (!member) return;
    await Bot.say(c, Say.who(member));
  }

  private async events(c: Context): Promise<void> {
    const member = await this.member(c);
    if (!member) return;

    if (!Ability.of(member).can('event:read')) {
      await Bot.say(c, Say.pending());
      return;
    }

    const upcoming = await this.options.store.events.list({
      state: Event.LIVE,
      upcoming: new Date(),
      limit: Bot.LIMIT,
    });
    if (upcoming.length === 0) {
      await Bot.say(c, Say.nothing());
      return;
    }

    await Bot.say(c, Say.upcoming(upcoming));
  }

  private async unlink(c: Context): Promise<void> {
    const member = await this.member(c);
    if (!member) return;
    await this.options.store.links.unlink(member.id);
    this.log.info('chat unlinked', { member: member.id });
    await Bot.say(c, Say.gone());
  }

  /** The member behind a chat, or a reply telling them how to become one. */
  private async member(c: Context) {
    const chatId = Bot.chat(c);
    const member = chatId === null ? null : await this.options.store.links.byChat(chatId);
    if (member) return member;
    await Bot.say(c, Say.unlinked(this.options.baseUrl));
    return null;
  }

  /**
   * Sends one message to one chat. Who hears anything, and on which channel, is `Notify`'s
   * decision: the bot is a way of speaking, not a mailing list, and holding the list in two
   * places is how half a club stops getting reminders.
   *
   * A chat that refuses (blocked, deleted, kicked) is reported as a diagnostic so the caller can
   * count it, rather than swallowed here where nothing can act on it.
   */
  tell = async (chatId: string, text: string): Promise<void> => {
    try {
      await this.bot.api.sendMessage(chatId, text, { parse_mode: Bot.FORMAT });
    } catch (error) {
      throw Diag.of(error, Codes.send).note(markup`chat \`${chatId}\` did not take the message`);
    }
  };

  /**
   * A one-off invitation to the club's group, good for one person and for an hour.
   *
   * One person is the whole point: a club's group link passed around is a group anybody can walk
   * into, and the reason to mint these per member is that the app already knows who asked. The
   * expiry is belt and braces, since a link nobody spent is still a link.
   */
  invite = async (group: string, now: Date = new Date()): Promise<string> => {
    try {
      const link = await this.bot.api.createChatInviteLink(group, {
        member_limit: Bot.SEATS,
        expire_date: Math.floor((now.getTime() + Bot.INVITE) / Bot.SECOND),
      });
      return link.invite_link;
    } catch (error) {
      throw Diag.of(error, Codes.send)
        .note(markup`the bot could not make an invitation for \`${group}\``)
        .help('the bot has to be in the group and allowed to invite people');
    }
  };
}
