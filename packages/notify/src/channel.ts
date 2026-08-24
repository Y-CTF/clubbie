import type { Channel } from '@clubbie/core';
import type { Message } from './message.ts';

/**
 * One way of reaching a member. A channel knows how to deliver, and nothing else: who wants to
 * hear what is `Prefs`, and who is reachable at all is the store's answer.
 *
 * `send` throws on a failure the caller should retry (a provider that is down) and returns
 * normally otherwise. A member who has blocked the bot is not an error worth retrying, so a
 * channel that can tell the difference reports it by returning.
 */
export interface Sender {
  readonly channel: Channel;
  send(to: string, message: Message): Promise<void>;
}
