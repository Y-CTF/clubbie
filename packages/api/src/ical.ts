import { Brand, type Club, type Event, Millis } from '@clubbie/core';
import { When } from '@clubbie/term';
import { Download } from './download.ts';

/**
 * An iCalendar feed, per RFC 5545. This is the single highest-value export a club has: members
 * already live in a calendar app, and a subscribed feed puts the club in it without anybody
 * copying a date across.
 *
 * The rules that matter, and the reason each is here rather than in a template: lines are folded
 * at 75 octets, text fields escape `\ ; , ` and newlines, and every line ends CRLF. A calendar
 * client that meets an unfolded 200-character summary simply drops the event.
 */
export namespace Ical {
  export const EOL = '\r\n';
  export const FOLD = 75;
  export const CONTINUE = ' ';
  export const TYPE = 'text/calendar; charset=utf-8';
  export const VERSION = '2.0';
  /** Who wrote the feed, which some clients show and all of them log. */
  export const AGENT = `-//${Brand.STEM}//EN`;
  /** What a client is asked to wait before refetching. Hourly is polite and plenty. */
  export const REFRESH = 'PT1H';
  /**
   * Control characters, which no iCal line may carry however they arrived in a title. The class is
   * built from its bounds rather than written as a literal, so none of them appear in the source.
   */
  export const LOWEST = 0x00;
  export const HIGHEST = 0x1f;
  export const DELETE = 0x7f;
  export const CONTROL = new RegExp(
    `[${String.fromCharCode(LOWEST)}-${String.fromCharCode(HIGHEST)}${String.fromCharCode(DELETE)}]`,
    'g',
  );
  /**
   * A line break, held aside while the control characters are dropped. It is a private-use
   * character rather than a control one, which the very next step would delete.
   */
  export const BREAK = '\uE000';
  /** How long an event with no end lasts on a calendar, since a VEVENT needs one. */
  export const DEFAULT = Millis.HOUR;
  export const EXTENSION = 'ics';
  /** What one event's file is called when its title carries nothing a header can hold. */
  export const FALLBACK = 'event';

  /** The states a calendar knows, mapped from the ones the club knows. */
  const STATUS: Record<Event['state'], string> = {
    draft: 'TENTATIVE',
    published: 'CONFIRMED',
    cancelled: 'CANCELLED',
  };

  export function calendar(events: readonly Event[], club: Club, now: Date = new Date()): string {
    const lines = [
      'BEGIN:VCALENDAR',
      `VERSION:${VERSION}`,
      `PRODID:${AGENT}`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${quote(club.name)}`,
      `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH}`,
      ...events.flatMap((event) => vevent(event, club, now)),
      'END:VCALENDAR',
    ];
    return lines.map(fold).join(EOL) + EOL;
  }

  export function headers(filename: string): Record<string, string> {
    return {
      'content-type': TYPE,
      'content-disposition': Download.disposition(Download.Kind.Inline, filename),
      /** A feed is per member and must never be held by anything between them and the server. */
      'cache-control': 'private, no-store',
    };
  }

  /**
   * One event, as a file to keep rather than a feed to follow. It is the other half of subscribing:
   * a member who wants tonight in their own calendar and nothing else double-clicks this, and every
   * calendar app on every platform knows what to do with it without anybody pasting a url.
   */
  export function file(event: Event, club: Club, now: Date = new Date()): string {
    return calendar([event], club, now);
  }

  /** What a saved single event is called, and the header that saves it under that name. */
  export function attachment(title: string): Record<string, string> {
    const filename = Download.name(title, EXTENSION, FALLBACK);
    return {
      'content-type': TYPE,
      'content-disposition': Download.disposition(
        Download.Kind.Attachment,
        filename,
        `${title}.${EXTENSION}`,
      ),
      'cache-control': 'private, no-store',
    };
  }

  function vevent(event: Event, club: Club, now: Date): string[] {
    const ends = event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT);
    return [
      'BEGIN:VEVENT',
      `UID:${event.id}@${Brand.STEM}`,
      `DTSTAMP:${When.basic(now)}`,
      `DTSTART:${When.basic(event.startsAt)}`,
      `DTEND:${When.basic(ends)}`,
      `SUMMARY:${quote(event.title)}`,
      `STATUS:${STATUS[event.state]}`,
      `CATEGORIES:${quote(event.kind)}`,
      ...(event.location ? [`LOCATION:${quote(event.location)}`] : []),
      ...(event.description ? [`DESCRIPTION:${quote(event.description)}`] : []),
      `ORGANIZER;CN=${param(club.name)}:mailto:noreply@${Brand.STEM}`,
      'END:VEVENT',
    ];
  }

  /**
   * A property value, per RFC 5545 §3.3.11. Control characters are dropped rather than escaped: a
   * lone carriage return in a title somebody typed would otherwise end the line, and everything
   * after it would be read as further iCal content.
   */
  export function quote(text: string): string {
    return text
      .replaceAll(/\r?\n/g, BREAK)
      .replaceAll(CONTROL, '')
      .replaceAll('\\', '\\\\')
      .replaceAll(';', '\\;')
      .replaceAll(',', '\\,')
      .replaceAll(BREAK, '\\n');
  }

  /**
   * A *parameter* value, per §3.2, which has different rules: backslash is not an escape there, so
   * a club called `Rowing, Zürich` has to be quoted rather than escaped, and a name carrying a
   * colon could otherwise close the parameter and forge the property's own value.
   */
  export function param(text: string): string {
    const safe = text.replaceAll(/[\r\n"]/g, '').replaceAll(CONTROL, '');
    return /[:;,]/.test(safe) ? `"${safe}"` : safe;
  }

  /**
   * Folds a line to 75 octets, continuing with a leading space. Octets rather than characters:
   * a title full of accents is longer on the wire than it looks in an editor.
   */
  export function fold(line: string): string {
    const encoder = new TextEncoder();
    if (encoder.encode(line).length <= FOLD) return line;

    const out: string[] = [];
    let taken = 0;
    let first = true;

    for (const char of line) {
      const size = encoder.encode(char).length;
      /** A continued line spends one octet on the leading space, so it carries one less. */
      const limit = first ? FOLD : FOLD - CONTINUE.length;
      if (taken + size > limit) {
        out.push(EOL + CONTINUE);
        taken = 0;
        first = false;
      }
      out.push(char);
      taken += size;
    }
    return out.join('');
  }
}
