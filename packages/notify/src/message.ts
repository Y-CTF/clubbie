import type { Club, Event, Member, Season } from '@clubbie/core';
import { markup } from '@clubbie/term';
import { Stamp } from './stamp.ts';
import { Phrases, type Seat } from './words.ts';

/**
 * What a fact is about. It is a union rather than a label because a channel that draws a glyph
 * instead of a word needs to know which fact it is holding, and the label is already translated by
 * the time it gets here.
 */
export const FACTS = ['when', 'kind', 'where', 'places', 'closes', 'until'] as const;
export type Role = (typeof FACTS)[number];

/** One labelled thing about the notice: when it is, where it is, how many places it has. */
export interface Fact {
  readonly of: Role;
  readonly label: string;
  readonly value: string;
}

/** The one thing the notice wants the reader to do, and where. */
export interface Link {
  readonly label: string;
  readonly url: string;
}

/** Who the notice is from, as a channel that draws a letterhead needs it. */
export interface From {
  readonly name: string;
  /** The one colour the club is drawn in, which is the site's own accent. */
  readonly accent: string;
  /** Why this landed in somebody's inbox, which is what the foot of an email is for. */
  readonly why: string;
}

export interface MessageFields {
  /** One line, used as an email subject and as the summary a chat preview shows. */
  readonly subject: string;
  readonly from: From;
  /** What the notice is about, in the club's own words: an event title, a season, a name. */
  readonly title: string;
  /** One or two sentences saying what has happened. */
  readonly lead: string;
  readonly facts: readonly Fact[];
  /** The club's own description of the event, quoted rather than paraphrased. */
  readonly note: string | null;
  readonly action: Link | null;
}

/** The fields are declared once, in `MessageFields`; the class carries them by declaration merging. */
export interface Message extends MessageFields {}

/**
 * A notice, as a shape rather than as a block of text.
 *
 * It used to be a subject and a body somebody had already joined together, which meant every
 * channel got the same flat column of lines: a chat message that repeated its own subject back as
 * its first line, and an email that was plain text with a bare url at the bottom. A channel can do
 * better than that, and it can only do better if it is handed the parts.
 *
 * Every piece is markup, interpolated through the `markup` template, so an event title a member
 * typed cannot open a span, smuggle a control character into a chat message or forge a line of an
 * email. What each channel does with the pieces is its own: `Telegram` writes them as its subset
 * of html, `Letter` lays them out as an email, and `body` is the flat form for anything else.
 */
export class Message {
  /** Between the blocks of a notice: a title, a lead, the facts, the note, the link. */
  static readonly SEP = '\n\n';
  /** Between the lines of one block. */
  static readonly LINE = '\n';
  /** How much of a club's own description a notice carries before it stops being a notice. */
  static readonly NOTE = 400;
  static readonly ELLIPSIS = '…';

  constructor(fields: MessageFields) {
    Object.assign(this, fields);
  }

  /** A fact, as one line of markup: the label emphasised, the value as it was typed. */
  static line(fact: Fact): string {
    return markup`*${fact.label}*: ${fact.value}`;
  }

  /**
   * The whole notice as one piece of markup, for a channel with no layout of its own and for a
   * test that wants to read what was sent. The facts are one block of lines rather than one block
   * each: they belong together, and a blank line between every one of them was what made a
   * four-line announcement fill a phone.
   */
  get body(): string {
    return Message.text(
      this.title,
      this.lead,
      this.facts.map(Message.line).join(Message.LINE),
      this.note,
      this.action ? markup`${this.action.label}: ${this.action.url}` : '',
    );
  }

  /** Joins the blocks a notice is made of, dropping the ones this notice had nothing for. */
  private static text(...blocks: (string | null)[]): string {
    return blocks.filter(Boolean).join(Message.SEP);
  }

  /** A description as a notice carries it: one paragraph, cut where it stops being a summary. */
  static excerpt(text: string | null): string | null {
    const trimmed = (text ?? '').trim();
    if (trimmed === '') return null;

    const cut = trimmed.length > Message.NOTE;
    return markup`${cut ? trimmed.slice(0, Message.NOTE).trimEnd() + Message.ELLIPSIS : trimmed}`;
  }
}

/**
 * Everything the club ever sends a member: which pieces a notice is made of, and what it says.
 *
 * The words themselves are in `words.ts`, one set per language, and the club decides which. A club
 * that writes its events in German sends its reminders in German too; a club that has chosen no
 * language sends English. It is the club's setting rather than the member's because the event
 * title in the middle of the sentence was typed in one language whatever the sentence around it.
 *
 * Times are written on the club's own clock and in its own language, which is `Stamp`.
 */
export namespace Notices {
  /**
   * Which facts a reminder or a seat notice repeats: when it is, and where.
   *
   * By role rather than by position. `about` builds a variable-length list, so taking the first
   * two of it meant an event with no location advertised its capacity under the word "where".
   */
  export const SOON: readonly Role[] = ['when', 'where'];

  /** The letterhead every notice carries: who it is from, and the one colour the club is drawn in. */
  function from(club: Club): From {
    return { name: club.name, accent: club.design.accent, why: Phrases.of(club.locale).footer(club.name) };
  }

  /**
   * What is worth saying about an event, in the order somebody reads it: when, where, how many
   * places, and when answers stop.
   *
   * The deadline is dropped when it is the start, which is what a club that takes answers up to
   * the door has: repeating the same stamp under a different label taught members that the second
   * one meant nothing. The kind is the club's own word for its evenings, which the caller reads,
   * because `notify` has no business knowing what a choir calls a concert.
   */
  function about(event: Event, club: Club, kind: string | null): Fact[] {
    const say = Phrases.of(club.locale).labels;
    const facts: Fact[] = [
      { of: 'when', label: say.when, value: markup`${Stamp.when(event.startsAt, event.endsAt, club)}` },
    ];

    if (kind) facts.push({ of: 'kind', label: say.kind, value: markup`${kind}` });
    if (event.location) facts.push({ of: 'where', label: say.where, value: markup`${event.location}` });
    if (event.capacity !== null) {
      facts.push({ of: 'places', label: say.places, value: markup`${event.capacity}` });
    }
    if (event.closesAt !== null && event.closesAt.getTime() !== event.startsAt.getTime()) {
      facts.push({ of: 'closes', label: say.closes, value: markup`${Stamp.at(event.deadline, club)}` });
    }
    return facts;
  }

  export function published(event: Event, club: Club, url: string, kind: string | null = null): Message {
    const say = Phrases.of(club.locale).published;
    return new Message({
      subject: say.subject(club.name, event.title),
      from: from(club),
      title: markup`*${event.title}*`,
      lead: say.lead(club.name),
      facts: about(event, club, kind),
      note: Message.excerpt(event.description),
      action: { label: say.action, url },
    });
  }

  /**
   * A notice about one member's place at one evening. Read on the way out of the door, so it
   * carries when and where and nothing else. The three that use it differ only in their words.
   */
  function seat(event: Event, club: Club, url: string, say: Seat): Message {
    return new Message({
      subject: say.subject(club.name, event.title),
      from: from(club),
      title: markup`*${event.title}*`,
      lead: say.lead(),
      facts: about(event, club, null).filter((fact) => Notices.SOON.includes(fact.of)),
      note: null,
      action: { label: say.action, url },
    });
  }

  export function reminder(event: Event, club: Club, url: string): Message {
    return seat(event, club, url, Phrases.of(club.locale).reminder);
  }

  export function promoted(event: Event, club: Club, url: string): Message {
    return seat(event, club, url, Phrases.of(club.locale).promoted);
  }

  export function demoted(event: Event, club: Club, url: string): Message {
    return seat(event, club, url, Phrases.of(club.locale).demoted);
  }

  export function admitted(member: Member, club: Club, url: string): Message {
    const say = Phrases.of(club.locale).admitted;
    return new Message({
      subject: say.subject(club.name),
      from: from(club),
      title: markup`*${club.name}*`,
      lead: say.lead(member.name, club.name),
      facts: [],
      note: null,
      action: { label: say.action, url },
    });
  }

  /**
   * The membership that is about to lapse, or has. The deadline is dropped when the season has
   * none, which is what a missing fact is everywhere else in this file.
   */
  export function renewal(season: Season, club: Club, url: string): Message {
    const say = Phrases.of(club.locale);
    return new Message({
      subject: say.renewal.subject(club.name, season.name),
      from: from(club),
      title: markup`*${season.name}*`,
      lead: say.renewal.lead(season.name),
      facts:
        season.renewalAt === null
          ? []
          : [{ of: 'until', label: say.labels.until, value: markup`${Stamp.at(season.renewalAt, club)}` }],
      note: null,
      action: { label: say.renewal.action, url },
    });
  }
}
