import { describe, expect, test } from 'bun:test';
import { Club, Event, type EventId, type KindId, type MemberId, Team } from '@clubbie/core';
import { When } from '@clubbie/term';
import { Csv } from '../src/csv.ts';
import { Ical } from '../src/ical.ts';

const NOW = new Date('2026-03-01T12:00:00Z');

function event(fields: Partial<Event> = {}): Event {
  return new Event({
    id: 'EVENT' as EventId,
    title: 'Weekly meeting',
    description: null,
    kind: 'meeting' as KindId,
    state: 'published',
    startsAt: NOW,
    endsAt: null,
    closesAt: null,
    location: null,
    capacity: null,
    seasonId: null,
    scheduleId: null,
    listed: true,
    teams: false,
    teamSize: null,
    teamsBy: Team.MAKER,
    createdBy: 'ORGANISER' as MemberId,
    createdAt: NOW,
    ...fields,
  });
}

const lines = (text: string) => text.split(Ical.EOL);

describe('Ical', () => {
  test('an event becomes a VEVENT with UTC basic stamps', () => {
    const feed = Ical.calendar([event()], Club.default(NOW), NOW);

    expect(lines(feed)).toContain('BEGIN:VEVENT');
    expect(lines(feed)).toContain('DTSTART:20260301T120000Z');
    expect(lines(feed)).toContain('SUMMARY:Weekly meeting');
    expect(lines(feed)).toContain('STATUS:CONFIRMED');
  });

  test('an event with no end still has one, since a VEVENT needs it', () => {
    const feed = Ical.calendar([event()], Club.default(NOW), NOW);
    expect(lines(feed)).toContain(`DTEND:${When.basic(new Date(NOW.getTime() + Ical.DEFAULT))}`);
  });

  test('a separator in a title is escaped rather than ending the value', () => {
    expect(Ical.quote('Pizza, CTF; and writeups')).toBe('Pizza\\, CTF\\; and writeups');
    expect(Ical.quote('two\nlines')).toBe('two\\nlines');
  });

  /** A lone carriage return would end the line and let everything after it read as iCal. */
  test('a control character in a title cannot open a new line', () => {
    expect(Ical.quote('sneaky\rSUMMARY:forged')).toBe('sneakySUMMARY:forged');
  });

  test('a parameter is quoted rather than escaped, so a name cannot forge a value', () => {
    expect(Ical.param('Rowing Club, Zürich')).toBe('"Rowing Club, Zürich"');
    expect(Ical.param('X:mailto:someone@example.org')).toBe('"X:mailto:someone@example.org"');
    expect(Ical.param('Polytech CTF')).toBe('Polytech CTF');
  });

  test('a long line is folded at 75 octets, continued with a space', () => {
    const folded = Ical.fold(`SUMMARY:${'a'.repeat(200)}`);
    const parts = folded.split(Ical.EOL);

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(Ical.FOLD);
    for (const part of parts.slice(1)) expect(part.startsWith(Ical.CONTINUE)).toBe(true);
    expect(parts.join('').replaceAll(Ical.CONTINUE, '')).toBe(`SUMMARY:${'a'.repeat(200)}`);
  });

  test('every line of a feed ends CRLF and fits', () => {
    const long = event({ title: 'Ünité '.repeat(30) });
    for (const line of lines(Ical.calendar([long], Club.default(NOW), NOW))) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(Ical.FOLD);
    }
  });
});

describe('Csv', () => {
  test('every field is quoted, and a quote inside one is doubled', () => {
    expect(Csv.of(['name'], [['Ada "the countess"']])).toBe(`"name"\r\n"Ada ""the countess"""\r\n`);
  });

  test('a field that a spreadsheet would run as a formula is defused', () => {
    expect(Csv.of(['name'], [['=cmd|calc']])).toContain(`"'=cmd|calc"`);
  });

  test('a filename is ascii, and the readable name goes beside it', () => {
    expect(Csv.filename('Insomni’hack teaser')).toBe('Insomni-hack-teaser.csv');
    expect(Csv.filename('весёлые старты')).toBe(`${Csv.FALLBACK}.csv`);

    const headers = Csv.headers(Csv.filename('весёлые'), 'весёлые.csv');
    expect(headers['content-disposition']).toContain(`filename="${Csv.FALLBACK}.csv"`);
    expect(headers['content-disposition']).toContain("filename*=UTF-8''");
  });

  /** A header value has to be Latin-1: a name kept as it is would throw inside the response. */
  test('the headers it produces can actually be sent', () => {
    const headers = Csv.headers(Csv.filename('весёлые'), 'весёлые.csv');
    expect(() => new Response('x', { headers })).not.toThrow();
  });
});
