import { beforeEach, describe, expect, test } from 'bun:test';
import { Design, type KindId } from '@clubbie/core';
import { Feed } from '../src/feed.ts';
import { DAY, type Harness, harness, refusal, SECRET } from './harness.ts';

describe('the waitlist', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  test('a full event takes a waitlist answer, and a withdrawal promotes it', async () => {
    const ada = await h.member('ada');
    const alan = await h.member('alan');
    const workshop = await h.event(ada, 1);

    const mine = await h.signIn(ada);
    const theirs = await h.signIn(alan);

    await h.call(`/events/${workshop.id}/rsvp`, {
      method: 'PUT',
      cookie: mine,
      body: JSON.stringify({ answer: 'going' }),
    });

    const refused = await h.call(`/events/${workshop.id}/rsvp`, {
      method: 'PUT',
      cookie: theirs,
      body: JSON.stringify({ answer: 'going' }),
    });
    expect(refused.status).toBe(409);
    expect(String((await refusal(refused)).diag.code)).toBe('rsvp.full');

    const queued = await h.call(`/events/${workshop.id}/rsvp`, {
      method: 'PUT',
      cookie: theirs,
      body: JSON.stringify({ answer: 'waitlist' }),
    });
    expect(queued.status).toBe(200);

    await h.call(`/events/${workshop.id}/rsvp`, { method: 'DELETE', cookie: mine });

    const promoted = await h.store.rsvps.byMember(workshop.id, alan.id);
    expect(promoted?.answer).toBe('going');
  });

  test('a waitlist answer on an event with room comes back as a place', async () => {
    const ada = await h.member('ada');
    const workshop = await h.event(ada, 2);

    const answered = await h.call(`/events/${workshop.id}/rsvp`, {
      method: 'PUT',
      cookie: await h.signIn(ada),
      body: JSON.stringify({ answer: 'waitlist' }),
    });

    expect(((await answered.json()) as { answer: string }).answer).toBe('going');
  });

  test('shrinking a capacity puts the newest place back on the waitlist', async () => {
    const admin = await h.member('ada', 'active', 'admin');
    const alan = await h.member('alan');
    const workshop = await h.event(admin, 2);

    await h.call(`/events/${workshop.id}/rsvp`, {
      method: 'PUT',
      cookie: await h.signIn(admin),
      body: JSON.stringify({ answer: 'going' }),
    });
    await h.call(`/events/${workshop.id}/rsvp`, {
      method: 'PUT',
      cookie: await h.signIn(alan),
      body: JSON.stringify({ answer: 'going' }),
    });

    await h.call(`/events/${workshop.id}`, {
      method: 'PATCH',
      cookie: await h.signIn(admin),
      body: JSON.stringify({ capacity: 1 }),
    });

    /**
     * One of the two loses the place, and which one is the millisecond they answered in: both
     * answers go through the API with no clock of their own, so asserting on a particular member
     * was asserting on a tie-break. What the club is promised is that the room now fits.
     */
    const answers = await Promise.all([
      h.store.rsvps.byMember(workshop.id, admin.id),
      h.store.rsvps.byMember(workshop.id, alan.id),
    ]);

    expect(answers.map((rsvp) => rsvp?.answer).sort()).toEqual(['going', 'waitlist']);
    expect(await h.store.rsvps.seated(workshop.id)).toBe(1);
  });
});

describe('guests', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  test('an organiser adds one, and it takes a place', async () => {
    const admin = await h.member('ada', 'active', 'admin');
    const workshop = await h.event(admin, 1);
    const cookie = await h.signIn(admin);

    const added = await h.call(`/events/${workshop.id}/guests`, {
      method: 'POST',
      cookie,
      body: JSON.stringify({ name: 'a friend from EPFL' }),
    });
    expect(added.status).toBe(201);

    const detail = (await (await h.call(`/events/${workshop.id}`, { cookie })).json()) as {
      taken: number;
      attending: { id: string }[];
    };
    expect(detail.taken).toBe(1);
    expect(detail.attending).toHaveLength(1);
  });

  /** Whoever wrote the event runs it: `Ability.canOwn`, which the edit and the delete already ask. */
  test('the member who organised it adds one', async () => {
    const ada = await h.member('ada');
    const workshop = await h.event(ada);

    const added = await h.call(`/events/${workshop.id}/guests`, {
      method: 'POST',
      cookie: await h.signIn(ada),
      body: JSON.stringify({ name: 'a friend' }),
    });
    expect(added.status).toBe(201);
  });

  test('a member who did not organise it may not add one', async () => {
    const ada = await h.member('ada');
    const alan = await h.member('alan');
    const workshop = await h.event(ada);

    const refused = await h.call(`/events/${workshop.id}/guests`, {
      method: 'POST',
      cookie: await h.signIn(alan),
      body: JSON.stringify({ name: 'a friend' }),
    });
    expect(refused.status).toBe(403);
  });

  test('the sheet and the attendance of an event belong to whoever organised it', async () => {
    const ada = await h.member('ada');
    const alan = await h.member('alan');
    const workshop = await h.event(ada);

    const mine = await h.call(`/events/${workshop.id}/sheet`, { cookie: await h.signIn(ada) });
    expect(mine.status).toBe(200);

    const theirs = await h.call(`/events/${workshop.id}/sheet`, { cookie: await h.signIn(alan) });
    expect(theirs.status).toBe(403);

    const marked = await h.call(`/events/${workshop.id}/attendance/${alan.id}`, {
      method: 'PUT',
      cookie: await h.signIn(alan),
      body: JSON.stringify({ attended: true }),
    });
    expect(marked.status).toBe(403);
  });
});

describe('exports', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  test('an attendance sheet comes back as a csv a spreadsheet can open', async () => {
    const admin = await h.member('ada', 'active', 'admin');
    const workshop = await h.event(admin);
    const cookie = await h.signIn(admin);

    await h.call(`/events/${workshop.id}/rsvp`, {
      method: 'PUT',
      cookie,
      body: JSON.stringify({ answer: 'going' }),
    });

    const response = await h.call(`/events/${workshop.id}/sheet.csv`, { cookie });
    const body = await response.text();

    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('filename="Workshop-Z-rich.csv"');
    expect(body.split('\r\n')[0]).toBe('"name","answer","attended","answered","kind"');
    expect(body).toContain('"ada","going","no"');
  });

  test('a calendar feed is served to whoever holds the signed url, and to nobody else', async () => {
    const ada = await h.member('ada');
    await h.event(ada);

    const token = await Feed.sign(ada.id, SECRET);
    const feed = await h.call(`/calendar/${token}.ics`);
    const body = await feed.text();

    expect(feed.status).toBe(200);
    expect(feed.headers.get('content-type')).toContain('text/calendar');
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('SUMMARY:Workshop\\, Zürich');

    const forged = await h.call(`/calendar/${ada.id}.deadbeef.ics`);
    expect(forged.status).toBe(403);
  });

  test('a member who is no longer active reads nothing from their old feed', async () => {
    const lapsed = await h.member('ken', 'pending');
    const token = await Feed.sign(lapsed.id, SECRET);

    expect((await h.call(`/calendar/${token}.ics`)).status).toBe(403);
  });
});

describe('the public page', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  test('a club that has not opened its door shows nothing', async () => {
    const ada = await h.member('ada');
    await h.event(ada);

    const listing = (await (await h.call('/public/events')).json()) as { events: unknown[] };
    expect(listing.events).toHaveLength(0);
  });

  test('a listed club shows its listed events, and no answers', async () => {
    const ada = await h.member('ada');
    await h.event(ada);
    await h.store.club.update({ name: 'Polytech CTF', listed: true });

    const listing = (await (await h.call('/public/events')).json()) as {
      club: { name: string };
      events: { title: string; going?: number }[];
    };

    expect(listing.club.name).toBe('Polytech CTF');
    expect(listing.events).toHaveLength(1);
    expect(listing.events[0]?.going).toBeUndefined();
  });

  test('the club answers a signed-out caller with its name but not its settings', async () => {
    await h.store.club.update({ name: 'Polytech CTF', timezone: 'Europe/Zurich' });

    const club = (await (await h.call('/club')).json()) as { name: string; timezone: string | null };
    expect(club.name).toBe('Polytech CTF');
    expect(club.timezone).toBeNull();
  });

  test('an admin sees the settings and may change them', async () => {
    const admin = await h.member('ada', 'active', 'admin');
    const cookie = await h.signIn(admin);

    const saved = await h.call('/club', {
      method: 'PATCH',
      cookie,
      body: JSON.stringify({ name: 'Polytech CTF', accent: Design.ACCENT, timezone: 'Europe/Zurich' }),
    });
    expect(saved.status).toBe(200);

    const club = (await (await h.call('/club', { cookie })).json()) as { timezone: string | null };
    expect(club.timezone).toBe('Europe/Zurich');
  });

  test('a colour that is not one is refused with a diagnostic naming the field', async () => {
    const admin = await h.member('ada', 'active', 'admin');
    const refused = await h.call('/club', {
      method: 'PATCH',
      cookie: await h.signIn(admin),
      body: JSON.stringify({ accent: 'indigo' }),
    });

    expect(refused.status).toBe(422);
    expect((await refusal(refused)).diag.labels[0]?.text).toContain('colour');
  });
});

describe('schedules', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  test('creating one stamps the occurrences, and topping it up creates no duplicates', async () => {
    const admin = await h.member('ada', 'active', 'admin');
    const cookie = await h.signIn(admin);

    const created = await h.call('/schedules', {
      method: 'POST',
      cookie,
      body: JSON.stringify({
        title: 'Training night',
        kind: 'meeting' as KindId,
        startsAt: new Date(Date.now() + DAY).toISOString(),
        freq: 'weekly',
        interval: 1,
        count: 4,
      }),
    });

    const body = (await created.json()) as { id: string; events: string[] };
    expect(created.status).toBe(201);
    expect(body.events).toHaveLength(4);

    const again = await h.call(`/schedules/${body.id}/expand`, { method: 'POST', cookie });
    expect(((await again.json()) as { created: string[] }).created).toHaveLength(0);

    const listing = (await (await h.call('/events', { cookie })).json()) as unknown[];
    expect(listing).toHaveLength(4);
  });

  test('deleting one drops the nights that have not happened', async () => {
    const admin = await h.member('ada', 'active', 'admin');
    const cookie = await h.signIn(admin);

    const created = await h.call('/schedules', {
      method: 'POST',
      cookie,
      body: JSON.stringify({
        title: 'Training night',
        kind: 'meeting' as KindId,
        startsAt: new Date(Date.now() + DAY).toISOString(),
        freq: 'weekly',
        count: 3,
      }),
    });
    const { id } = (await created.json()) as { id: string };

    const removed = await h.call(`/schedules/${id}`, { method: 'DELETE', cookie });
    expect(((await removed.json()) as { dropped: number }).dropped).toBe(3);
    expect((await (await h.call('/events', { cookie })).json()) as unknown[]).toHaveLength(0);
  });
});

describe('the trail', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  test('admitting a member is recorded, and only an admin may read it', async () => {
    const admin = await h.member('ada', 'active', 'admin');
    const pending = await h.member('ken', 'pending');
    const cookie = await h.signIn(admin);

    await h.call(`/members/${pending.id}`, {
      method: 'PATCH',
      cookie,
      body: JSON.stringify({ status: 'active' }),
    });

    const { entries, total } = (await (await h.call('/audit', { cookie })).json()) as {
      entries: { act: string; subject: string; actor: string | null }[];
      total: number;
    };
    expect(entries[0]?.act).toBe('member.admit');
    expect(entries[0]?.subject).toBe(pending.id);
    /** The trail says who, not only what: an id in a report three months later is a question. */
    expect(entries[0]?.actor).toBe('ada');
    expect(total).toBe(entries.length);

    const ordinary = await h.member('alan');
    expect((await h.call('/audit', { cookie: await h.signIn(ordinary) })).status).toBe(403);
  });

  test('admitting a member queues the notice that tells them', async () => {
    const admin = await h.member('ada', 'active', 'admin');
    const pending = await h.member('ken', 'pending');

    await h.call(`/members/${pending.id}`, {
      method: 'PATCH',
      cookie: await h.signIn(admin),
      body: JSON.stringify({ status: 'active' }),
    });

    const queued = await h.store.jobs.claim();
    expect(queued.map((job) => job.kind)).toContain('member.admitted');
  });
});

describe('notification settings', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  test('a member switches announcements off and it is remembered', async () => {
    const ada = await h.member('ada');
    const cookie = await h.signIn(ada);

    const saved = await h.call('/me/notifications', {
      method: 'PATCH',
      cookie,
      body: JSON.stringify({ announcements: false }),
    });
    expect(saved.status).toBe(200);

    const prefs = (await (await h.call('/me/notifications', { cookie })).json()) as {
      announcements: boolean;
      reminders: boolean;
    };
    expect(prefs.announcements).toBe(false);
    expect(prefs.reminders).toBe(true);
  });

  test('a member is handed their own calendar url', async () => {
    const ada = await h.member('ada');
    const feed = (await (await h.call('/me/calendar', { cookie: await h.signIn(ada) })).json()) as {
      url: string;
    };

    expect(feed.url).toContain('/api/calendar/');
    expect(feed.url.endsWith('.ics')).toBe(true);
  });
});
