import { beforeEach, describe, expect, test } from 'bun:test';
import {
  Brand,
  type Channel,
  Club,
  Event,
  type EventId,
  type KindId,
  type Language,
  LOCALES,
  type Member,
  type MemberId,
  Team,
} from '@clubbie/core';
import { Logger } from '@clubbie/log';
import { Store } from '@clubbie/store';
import { Markup, markup } from '@clubbie/term';
import type { Sender } from '../src/channel.ts';
import { Letter } from '../src/letter.ts';
import { type Fact, Message, Notices } from '../src/message.ts';
import { Notify } from '../src/notify.ts';
import { Telegram } from '../src/telegram.ts';

const NOW = new Date('2026-03-01T12:00:00Z');
/** One notice, as `Notices` builds them, for the tests that are about delivery rather than words. */
function plain(title = 'Training night'): Message {
  return new Message({
    subject: markup`the club: *${title}*`,
    from: { name: 'the club', accent: '#2563eb', why: 'you are a member.' },
    title: markup`*${title}*`,
    lead: 'it starts at seven',
    facts: [{ of: 'where', label: 'where', value: 'HG F 30' }],
    note: null,
    action: null,
  });
}

const MESSAGE = plain();

let store: Store;

/** A channel that records instead of sending, and can be told to refuse. */
class Recorder implements Sender {
  readonly sent: { to: string; message: Message }[] = [];

  constructor(
    readonly channel: Channel,
    private readonly refuses = false,
  ) {}

  async send(to: string, message: Message): Promise<void> {
    if (this.refuses) throw new Error('blocked');
    this.sent.push({ to, message });
  }
}

async function member(name: string): Promise<Member> {
  return store.members.enroll(
    { provider: 'test', subject: name, email: `${name}@example.org`, name, avatar: null },
    NOW,
  );
}

/** Links a chat, the way redeeming a code from the bot does. */
async function chat(who: Member): Promise<void> {
  const { token } = await store.links.issue(who.id, NOW);
  await store.links.redeem(token, `chat-${who.name}`, who.name, NOW);
}

beforeEach(async () => {
  const { log } = Logger.memory();
  store = await Store.open(Store.MEMORY, log);
});

function notify(...senders: Sender[]): Notify {
  return new Notify(store, senders, Logger.memory().log);
}

describe('Notify', () => {
  test('a member with a chat is reached there rather than by email', async () => {
    const ada = await member('ada');
    await chat(ada);

    const telegram = new Recorder('telegram');
    const email = new Recorder('email');
    const sent = await notify(telegram, email).send('event.published', [ada], MESSAGE);

    expect(telegram.sent).toHaveLength(1);
    expect(telegram.sent[0]?.to).toBe('chat-ada');
    expect(email.sent).toHaveLength(0);
    expect(sent[0]?.channel).toBe('telegram');
  });

  test('a member with no chat is reached by email', async () => {
    const alan = await member('alan');
    const email = new Recorder('email');

    await notify(new Recorder('telegram'), email).send('event.published', [alan], MESSAGE);
    expect(email.sent[0]?.to).toBe('alan@example.org');
  });

  test('a channel that refuses falls through to the next one', async () => {
    const grace = await member('grace');
    await chat(grace);

    const email = new Recorder('email');
    const deliveries = await notify(new Recorder('telegram', true), email).send(
      'event.published',
      [grace],
      MESSAGE,
    );

    expect(email.sent).toHaveLength(1);
    expect(deliveries[0]?.sent).toBe(true);
  });

  test('an announcement a member switched off is not sent', async () => {
    const ken = await member('ken');
    await store.prefs.update(ken.id, { announcements: false });

    const email = new Recorder('email');
    const deliveries = await notify(email).send('event.published', [ken], MESSAGE);

    expect(email.sent).toHaveLength(0);
    expect(deliveries[0]?.sent).toBe(false);
  });

  test('a notice about something they did is sent whatever they switched off', async () => {
    const ken = await member('ken');
    await store.prefs.update(ken.id, { announcements: false, reminders: false });

    const email = new Recorder('email');
    await notify(email).send('rsvp.promoted', [ken], MESSAGE);
    expect(email.sent).toHaveLength(1);
  });

  test('a member who switched a channel off is not reached on it', async () => {
    const ada = await member('ada');
    await chat(ada);
    await store.prefs.update(ada.id, { telegram: false });

    const telegram = new Recorder('telegram');
    const email = new Recorder('email');
    await notify(telegram, email).send('event.published', [ada], MESSAGE);

    expect(telegram.sent).toHaveLength(0);
    expect(email.sent).toHaveLength(1);
  });

  test('a deployment with no channel sends nothing and says so', async () => {
    const ada = await member('ada');
    const quiet = notify();

    expect(quiet.silent).toBe(true);
    expect(await quiet.send('event.published', [ada], MESSAGE)).toEqual([]);
  });
});

describe('Telegram', () => {
  function recorded(): { said: string[]; telegram: Telegram } {
    const said: string[] = [];
    return {
      said,
      telegram: new Telegram(async (_to, html) => {
        said.push(html);
      }),
    };
  }

  /** A chat is not a terminal and not a text file: emphasis arrives as emphasis, in its own tag. */
  test('a message reaches a chat as html, and does not repeat its own subject', async () => {
    const { said, telegram } = recorded();

    await telegram.send('chat-1', MESSAGE);
    expect(said[0]).toBe('<b>Training night</b>\n\nit starts at seven\n\n📍 HG F 30');
  });

  /** And a member who calls their event `<b>` cannot open a tag in everybody else's chat. */
  test('a title carrying html arrives as the text it was typed as', async () => {
    const { said, telegram } = recorded();

    await telegram.send('chat-1', plain('<b>shouting</b>'));
    expect(said[0]).toContain('<b>&lt;b&gt;shouting&lt;/b&gt;</b>');
  });
});

/**
 * The language a notice goes out in is the club's, not the reader's browser's: the event title in
 * the middle of the sentence was typed in one language whatever the sentence around it, and a
 * member with a German browser in an English club would otherwise get half of each.
 */
describe('what the club sends', () => {
  const event = new Event({
    id: 'EVENT' as EventId,
    title: 'Training night',
    description: null,
    kind: 'meeting' as KindId,
    state: 'published',
    startsAt: new Date('2026-03-02T18:00:00Z'),
    endsAt: null,
    closesAt: null,
    location: 'HG F 30',
    capacity: null,
    seasonId: null,
    scheduleId: null,
    listed: false,
    teams: false,
    teamSize: null,
    teamsBy: Team.MAKER,
    createdBy: 'MEMBER' as MemberId,
    createdAt: NOW,
  });

  function club(locale: Language | null): Club {
    return new Club({ ...Club.default(NOW), locale });
  }

  const Url = 'https://club.example/events/EVENT';
  const labels = (message: Message): string[] => message.facts.map((fact: Fact) => fact.label);

  test('is written in the club language, the title included as it was typed', () => {
    const english = Notices.published(event, club(null), Url);
    const german = Notices.published(event, club('de'), Url);

    expect(english.body).toContain('where');
    expect(german.body).toContain('wo');
    expect(german.body).toContain('Training night');
    expect(german.subject).toContain(Brand.STEM);
  });

  /** A club reads its own clock and its own calendar, not an ISO stamp sliced out of a log line. */
  test('says when in the club language, on the club clock', () => {
    const zurich = new Club({ ...Club.default(NOW), timezone: 'Europe/Zurich' });
    const when = Notices.published(event, zurich, Url).facts[0]?.value ?? '';

    expect(when).toContain('19:00');
    expect(when).toContain('March');
    expect(Notices.published(event, new Club({ ...zurich, locale: 'de' }), Url).facts[0]?.value).toContain(
      'März',
    );
  });

  test('writes a finishing time as a range rather than as a second fact', () => {
    const until = new Event({ ...event, endsAt: new Date('2026-03-02T20:00:00Z') });
    const utc = new Club({ ...Club.default(NOW), timezone: 'UTC' });
    const when = Notices.published(until, utc, Url).facts[0]?.value ?? '';

    expect(when).toContain('18:00');
    expect(when).toContain('20:00');
  });

  /**
   * The deadline is what a club sets when answers close early. One that closes at the start is
   * every club that has not thought about it, and repeating the same stamp under a second label
   * taught members that the label meant nothing.
   */
  test('drops the deadline when it is the start, and keeps it when it is not', () => {
    expect(labels(Notices.published(event, club(null), Url))).not.toContain('answers close');

    const early = new Event({ ...event, closesAt: new Date('2026-03-01T18:00:00Z') });
    expect(labels(Notices.published(early, club(null), Url))).toContain('answers close');
  });

  test('drops the fact an event had nothing for, in every language', () => {
    const roomless = new Event({ ...event, location: null, capacity: null });

    for (const locale of LOCALES) {
      const message = Notices.published(roomless, club(locale), Url);
      expect(message.body).not.toContain('HG F 30');
      expect(message.facts).toHaveLength(1);
    }
  });

  /** What the club typed about the evening is the half a bare listing of facts cannot say. */
  test('carries the kind, the places and the description', () => {
    const full = new Event({ ...event, capacity: 12, description: 'bring a laptop' });
    const message = Notices.published(full, club(null), Url, 'workshop');

    expect(labels(message)).toEqual(['when', 'what', 'where', 'places']);
    expect(message.facts.map((fact) => fact.value)).toContain('workshop');
    expect(message.note).toBe('bring a laptop');
  });

  test('cuts a description that is longer than a notice', () => {
    const essay = new Event({ ...event, description: 'x'.repeat(Message.NOTE * 2) });
    const note = Notices.published(essay, club(null), Url).note ?? '';

    expect(note.length).toBe(Message.NOTE + Message.ELLIPSIS.length);
    expect(note.endsWith(Message.ELLIPSIS)).toBe(true);
  });

  /** A reminder is read on the way out of the door, so it carries less than the announcement. */
  test('a reminder says when and where and stops', () => {
    expect(labels(Notices.reminder(event, club(null), Url))).toEqual(['when', 'where']);
  });

  test('escapes what a member typed, whichever language it is wrapped in', () => {
    const shouty = new Event({ ...event, title: 'Training *night*' });

    for (const locale of LOCALES) {
      const message = Notices.published(shouty, club(locale), Url);
      expect(message.subject).not.toContain('*night*');
      expect(Markup.html(message.title)).toBe('<b>Training *night*</b>');
    }
  });
});

/**
 * The layout an email arrives in. What is asserted is what it must never do, not what it looks
 * like: a test that pinned the padding would fail on every edit to the design and prove nothing.
 */
describe('an email', () => {
  const message = plain('Training <b>night</b>');

  test('carries the notice in both halves, laid out and flat', () => {
    expect(Letter.html(message)).toContain('<table');
    expect(Letter.text(message)).toBe('*Training <b>night</b>*\n\nit starts at seven\n\n*where*: HG F 30');
  });

  test('never lets a title open a tag of its own', () => {
    expect(Letter.html(message)).toContain('&lt;b&gt;night&lt;/b&gt;');
    expect(Letter.html(message)).not.toContain('<b>night</b>');
  });

  test('escapes a url before it goes inside an attribute', () => {
    const hostile = new Message({ ...message, action: { label: 'answer', url: 'https://x/"onload="1' } });
    expect(Letter.html(hostile)).not.toContain('"onload="');
  });
});
