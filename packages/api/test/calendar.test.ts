import { beforeEach, describe, expect, test } from 'bun:test';
import type { KindId } from '@clubbie/core';
import { type Harness, harness, refusal } from './harness.ts';

/**
 * What a calendar asks the API for: a stretch of the clock rather than a page of what is next, the
 * caller's own answer beside every night, and one event as a file.
 */

let h: Harness;

beforeEach(async () => {
  h = await harness();
});

/** A night with a start and an end, so a window can be asked about both ends of it. */
async function night(title: string, from: string, to: string | null = null) {
  const organiser = await h.member(`organiser-${title}`, 'active', 'admin');
  return h.store.events.create(
    {
      title,
      kind: 'meeting' as KindId,
      state: 'published',
      startsAt: new Date(from),
      endsAt: to ? new Date(to) : null,
    },
    organiser.id,
  );
}

async function titles(path: string, cookie: string): Promise<string[]> {
  const listing = (await (await h.call(path, { cookie })).json()) as { title: string }[];
  return listing.map((one) => one.title);
}

describe('a window', () => {
  const March = 'from=2026-03-01T00:00:00.000Z&to=2026-04-01T00:00:00.000Z';

  test('answers with everything that touches it, and nothing that misses it', async () => {
    const cookie = await h.signIn(await h.member('ada', 'active'));

    await night('February', '2026-02-10T18:00:00Z', '2026-02-10T20:00:00Z');
    /** Begins before the window and runs into it: the reason this is an overlap, not a comparison. */
    await night('Across the first', '2026-02-28T18:00:00Z', '2026-03-01T02:00:00Z');
    await night('Mid March', '2026-03-15T18:00:00Z');
    /** Begins on the last evening and finishes in April, which is March's business too. */
    await night('Across the last', '2026-03-31T22:00:00Z', '2026-04-01T01:00:00Z');
    await night('April', '2026-04-10T18:00:00Z');

    expect(await titles(`/events?${March}`, cookie)).toEqual([
      'Across the first',
      'Mid March',
      'Across the last',
    ]);
  });

  /**
   * A grid showing last March is asking for last March. Without this it would be answered with an
   * empty month, because the default scope is "upcoming" and every night in it has happened.
   */
  test('outranks the scope, so the past can be drawn without asking for the past', async () => {
    const cookie = await h.signIn(await h.member('ada', 'active'));
    await night('Long over', '2020-06-10T18:00:00Z', '2020-06-10T20:00:00Z');

    const window = 'from=2020-06-01T00:00:00.000Z&to=2020-07-01T00:00:00.000Z';
    expect(await titles(`/events?${window}`, cookie)).toEqual(['Long over']);
  });

  /** Half a window is what a client that dropped one of the two parameters sends. */
  test('needs both ends, and says so rather than drawing a wrong month', async () => {
    const cookie = await h.signIn(await h.member('ada', 'active'));

    const half = await h.call('/events?from=2026-03-01T00:00:00.000Z', { cookie });
    expect(half.status).toBe(422);
    expect((await refusal(half)).refusal).toBe('invalid');

    const backwards = await h.call('/events?from=2026-04-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z', {
      cookie,
    });
    expect(backwards.status).toBe(422);
  });
});

describe('the listing', () => {
  test("carries the caller's own answer, and nobody else's", async () => {
    const ada = await h.member('ada', 'active', 'admin');
    const alan = await h.member('alan', 'active');
    const event = await h.event(ada);

    await h.store.rsvps.answer(event.id, ada.id, 'going');
    await h.store.rsvps.answer(event.id, alan.id, 'maybe');

    const read = async (cookie: string) =>
      ((await (await h.call('/events', { cookie })).json()) as { yours: string | null }[])[0]?.yours;

    expect(await read(await h.signIn(ada))).toBe('going');
    expect(await read(await h.signIn(alan))).toBe('maybe');
    expect(await read(await h.signIn(await h.member('grace', 'active')))).toBeNull();
  });
});

describe('one event as a file', () => {
  test('is an iCalendar attachment named after the event', async () => {
    const ada = await h.member('ada', 'active', 'admin');
    const event = await h.event(ada);

    const response = await h.call(`/events/${event.id}/event.ics`, { cookie: await h.signIn(ada) });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/calendar');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('content-disposition')).toContain('filename="Workshop-Z-rich.ics"');

    const body = await response.text();
    expect(body).toContain('BEGIN:VEVENT');
    /** A comma in a title is escaped, which is what stops a client reading the rest as a field. */
    expect(body).toContain('SUMMARY:Workshop\\, Zürich');
    expect(body).toContain(`UID:${event.id}@`);
  });

  test('is refused for an event the caller cannot see', async () => {
    const ada = await h.member('ada', 'active', 'admin');
    const draft = await h.store.events.create(
      { title: 'Committee vote', kind: 'meeting' as KindId, state: 'draft', startsAt: new Date() },
      ada.id,
    );

    const cookie = await h.signIn(await h.member('alan', 'active'));
    const response = await h.call(`/events/${draft.id}/event.ics`, { cookie });
    expect(response.status).toBe(404);
  });
});
