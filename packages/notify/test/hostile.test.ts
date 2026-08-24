import { describe, expect, test } from 'bun:test';
import { Club, Event, type EventId, type KindId, type Language, LOCALES, type MemberId } from '@clubbie/core';
import { Markup } from '@clubbie/term';
import { Notices } from '../src/message.ts';

/**
 * What a member can type into an event title, in every language the club can be written in.
 *
 * The delivered form is what matters: a chat gets `Markup.strip` of the message and an email gets
 * `Markup.strip` of each half, so a title survives escaping only if it comes back out of the strip
 * exactly as it was typed, and carries no escape sequence and no delimiter of its own.
 */
const NOW = new Date('2026-03-01T12:00:00Z');
const URL = 'https://club.example/events/EVENT';

function eventTitled(title: string, location: string | null = 'HG F 30'): Event {
  return new Event({
    id: 'EVENT' as EventId,
    title,
    description: null,
    kind: 'meeting' as KindId,
    state: 'published',
    startsAt: new Date('2026-03-02T18:00:00Z'),
    endsAt: null,
    closesAt: null,
    location,
    capacity: null,
    seasonId: null,
    scheduleId: null,
    listed: false,
    createdBy: 'MEMBER' as MemberId,
    createdAt: NOW,
  });
}

function club(locale: Language | null): Club {
  return new Club({ ...Club.default(NOW), locale });
}

/** Every notice about an event, in one language, as the channels actually deliver it. */
function delivered(title: string, locale: Language) {
  const event = eventTitled(title);
  const where = club(locale);
  return [
    Notices.published(event, where, URL),
    Notices.reminder(event, where, URL),
    Notices.promoted(event, where, URL),
    Notices.demoted(event, where, URL),
  ].map((message) => ({
    subject: Markup.strip(message.subject),
    body: Markup.strip(message.body),
  }));
}

const TITLES = {
  markup: 'Training `rm -rf /` *urgent* \\ night',
  ansi: 'Training \u001b[31mred\u001b[0m night',
  newline: 'Training night\nFrom: committee@club.example',
  long: `Training ${'x'.repeat(500)} night`,
};

describe('a hostile event title, in every language', () => {
  test('markup characters come back out as typed and open no span', () => {
    for (const locale of LOCALES) {
      for (const { subject, body } of delivered(TITLES.markup, locale)) {
        for (const text of [subject, body]) {
          expect(text).toContain(TITLES.markup);
        }
      }
    }
  });

  test('an escape sequence never survives to a channel', () => {
    for (const locale of LOCALES) {
      for (const { subject, body } of delivered(TITLES.ansi, locale)) {
        for (const text of [subject, body]) {
          expect(text).not.toContain('\u001b');
          expect(text).toContain('Training [31mred[0m night');
        }
      }
    }
  });

  /**
   * The finding: a newline is kept by `Markup.text` (it is not treated as a control character),
   * so a title with one puts a line break into what is used as an email subject.
   */
  test('a newline in a title reaches the subject line', () => {
    for (const locale of LOCALES) {
      for (const { subject } of delivered(TITLES.newline, locale)) {
        expect(subject).toContain('\n');
      }
    }
  });

  /** And it also breaks the emphasis span it sits inside, so the delimiters print. */
  test('a newline leaves a bare delimiter in the body', () => {
    const [published] = delivered(TITLES.newline, 'en');
    expect(published?.body.startsWith('*Training night')).toBe(true);
  });

  test('a long title is carried whole, so the length limit is the only bound', () => {
    for (const locale of LOCALES) {
      for (const { subject } of delivered(TITLES.long, locale)) {
        expect(subject.length).toBeGreaterThan(500);
      }
    }
  });
});
