import { CHANNELS, type Channel, type Member, type MemberId, type Notice, Prefs } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { Logger } from '@clubbie/log';
import type { Store } from '@clubbie/store';
import type { Sender } from './channel.ts';
import type { Message } from './message.ts';

/** What one attempt at one member came to, which is what a caller logs and a job counts. */
export interface Delivery {
  readonly memberId: MemberId;
  /** The channel that took it, or null for a member nothing could reach. */
  readonly channel: Channel | null;
  readonly sent: boolean;
  /**
   * Whether a channel was tried and would not take it, as against a member who wanted nothing and
   * a member with nowhere to be reached. The queue needs the difference: an outage is worth
   * retrying and a member who switched everything off is not.
   */
  readonly refused: boolean;
}

/** Where a member is reached on each channel. A member with no address there is simply skipped. */
const ADDRESS: Record<Channel, (member: Member, chatId: string | null) => string | null> = {
  telegram: (_member, chatId) => chatId,
  email: (member) => member.email,
};

/**
 * Who hears a notice, and where.
 *
 * One member, one channel: the first channel they have that they have not switched off. A club
 * that reaches somebody on Telegram has no business also emailing them, and a member who reads
 * neither is not a delivery failure, they are a member who reads neither.
 *
 * A channel that throws is reported and skipped rather than allowed to stop a broadcast: one
 * blocked chat must not cost forty members their announcement.
 */
export class Notify {
  /** The order channels are tried in, which is the order the domain lists them in. */
  static readonly ORDER: readonly Channel[] = CHANNELS;

  private readonly senders: Map<Channel, Sender>;

  constructor(
    private readonly store: Store,
    senders: readonly Sender[],
    private readonly log: Logger,
  ) {
    this.senders = new Map(senders.map((sender) => [sender.channel, sender]));
  }

  get channels(): Channel[] {
    return Notify.ORDER.filter((channel) => this.senders.has(channel));
  }

  get silent(): boolean {
    return this.senders.size === 0;
  }

  /** Sends one notice to some members, and reports what happened per member. */
  async send(notice: Notice, members: readonly Member[], message: Message): Promise<Delivery[]> {
    if (members.length === 0 || this.silent) return [];

    const ids = members.map((member) => member.id);
    const [prefs, chats] = await Promise.all([this.store.prefs.many(ids), this.store.links.chats(ids)]);
    const rooms = new Map(chats.map((chat) => [chat.memberId, chat.chatId]));

    const out: Delivery[] = [];
    for (const member of members) {
      const wants = prefs.get(member.id) ?? Prefs.default(member.id);
      out.push(await this.reach(notice, member, wants, rooms.get(member.id) ?? null, message));
    }

    const sent = out.filter((delivery) => delivery.sent).length;
    const refused = out.filter((delivery) => delivery.refused).length;
    this.log.info('notice sent', { notice, members: members.length, sent, refused });
    return out;
  }

  /** The first channel this member can be reached on and has agreed to. */
  private async reach(
    notice: Notice,
    member: Member,
    prefs: Prefs,
    chatId: string | null,
    message: Message,
  ): Promise<Delivery> {
    let refused = false;
    for (const channel of this.channels) {
      const to = ADDRESS[channel](member, chatId);
      if (!to || !prefs.wants(notice, channel)) continue;

      const sender = this.senders.get(channel);
      if (!sender) continue;

      try {
        await sender.send(to, message);
        return { memberId: member.id, channel, sent: true, refused: false };
      } catch (error) {
        refused = true;
        this.log.warn('channel refused', {
          notice,
          channel,
          member: member.id,
          reason: Diag.of(error).message,
        });
      }
    }

    return { memberId: member.id, channel: null, sent: false, refused };
  }
}
