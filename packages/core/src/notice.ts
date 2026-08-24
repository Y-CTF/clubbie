import type { MemberId } from './member.ts';

/** Every message the club ever sends a member, and nothing may be sent that is not one of these. */
export const NOTICES = [
  'event.published',
  'event.reminder',
  'rsvp.promoted',
  'rsvp.demoted',
  'member.admitted',
  'season.renewal',
] as const;
export type Notice = (typeof NOTICES)[number];

/** Where a notice can go. A member with no channel linked simply hears nothing. */
export const CHANNELS = ['telegram', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * What a notice is about, which is what a member gets to switch off. Nobody may switch off
 * `personal`: it is the answer to something they did, and silently dropping it would be a bug
 * reported as "the club never told me I was admitted".
 */
export const TOPICS = ['announcements', 'reminders', 'personal'] as const;
export type Topic = (typeof TOPICS)[number];

const ABOUT: Record<Notice, Topic> = {
  'event.published': 'announcements',
  'event.reminder': 'reminders',
  'rsvp.promoted': 'personal',
  'rsvp.demoted': 'personal',
  'member.admitted': 'personal',
  /**
   * Personal, and deliberately so. It is the only notice about a member's own standing in the club
   * rather than about an evening, and a member who does not hear it stops being a member. Filing it
   * under reminders would let somebody switch off the one message that costs them their place.
   */
  'season.renewal': 'personal',
};

export interface PrefsFields {
  readonly memberId: MemberId;
  readonly telegram: boolean;
  readonly email: boolean;
  readonly announcements: boolean;
  readonly reminders: boolean;
}

/** The fields are declared once, in `PrefsFields`; the class carries them by declaration merging. */
export interface Prefs extends PrefsFields {}

/**
 * What one member has agreed to hear, and the only thing that decides whether a notice is sent.
 * The rule is asked here rather than at each sender, so a new channel cannot forget to check.
 */
export class Prefs {
  static readonly NOTICES = NOTICES;
  static readonly CHANNELS = CHANNELS;
  static readonly TOPICS = TOPICS;

  constructor(fields: PrefsFields) {
    Object.assign(this, fields);
  }

  /** Everything on, which is what a member who has never opened the page has agreed to. */
  static default(memberId: MemberId): Prefs {
    return new Prefs({ memberId, telegram: true, email: true, announcements: true, reminders: true });
  }

  static topic(notice: Notice): Topic {
    return ABOUT[notice];
  }

  wants(notice: Notice, channel: Channel): boolean {
    if (!this[channel]) return false;

    switch (Prefs.topic(notice)) {
      case 'announcements':
        return this.announcements;
      case 'reminders':
        return this.reminders;
      case 'personal':
        return true;
    }
  }
}
