import { beforeEach, describe, expect, test } from 'bun:test';
import { Club, type KindId } from '@clubbie/core';
import { MIGRATIONS, type Profile, Store } from '../src/index.ts';
import { Fixture } from './harness.ts';

const NOW = new Date('2026-03-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function profile(name: string, provider = 'github'): Profile {
  return {
    provider,
    subject: `${provider}-${name}`,
    email: `${name}@example.org`,
    name,
    avatar: null,
  };
}

/** Whatever `TEST_DATABASE_URL` names, so this suite proves both dialects rather than only SQLite. */
async function open(): Promise<Store> {
  return Fixture.open();
}

describe('Store', () => {
  let store: Store;

  beforeEach(async () => {
    store = await open();
  });

  test('a fresh database is migrated to the newest schema', async () => {
    expect(await store.version).toBe(Store.latest);
    await expect(store.ping()).resolves.toBeUndefined();
  });

  test('migrating twice applies nothing the second time', async () => {
    expect(await store.migrate()).toEqual([]);
  });

  /**
   * `Lock.club` holds this row so two first-ever sign-ins cannot both come out the founder, and a
   * `for update` over a table with no rows waits for nobody. The row existing is the whole lock.
   */
  test('a fresh database already holds the club row the enrolment lock is taken on', async () => {
    const rows = await store.db.selectFrom('club').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(await store.club.read()).toEqual(Club.default((await store.club.read()).updatedAt));
  });

  /**
   * The one migration that rewrites data rather than shape. A club that named its universities
   * before any other provider could name an organisation must keep exactly the door it had, with
   * every entry now saying whose organisation it is.
   */
  test('an organisation written before there was a second provider keeps its meaning', async () => {
    await store.club.update({ organisations: ['eduid:ethz.ch'] });

    /** Put the column back the way version 14 held it, then run the migration over it. */
    const bare = MIGRATIONS.find((one) => one.version === 15);
    await store.db.updateTable('club').set({ organisations: 'ethz.ch,unil.ch' }).execute();
    await bare?.up(store.db);

    expect((await store.club.read()).organisations).toEqual(['eduid:ethz.ch', 'eduid:unil.ch']);
  });

  test('and qualifying one twice does not double the qualifier', async () => {
    const migration = MIGRATIONS.find((one) => one.version === 15);
    await store.club.update({ organisations: ['github:acme'] });

    await migration?.up(store.db);
    expect((await store.club.read()).organisations).toEqual(['github:acme']);
  });

  test('a url naming no dialect is a diagnostic, not a driver error', async () => {
    expect(Store.kind('mysql://host/db')).toBe('unknown');
    await expect(Store.open('mysql://host/db')).rejects.toMatchObject({ code: 'store.url' });
  });
});

describe('Members', () => {
  let store: Store;

  beforeEach(async () => {
    store = await open();
  });

  test('the first member to sign in is an admin, the rest are not', async () => {
    const first = await store.members.enroll(profile('ada'), NOW);
    const second = await store.members.enroll(profile('alan'), NOW);

    expect(first.role).toBe('admin');
    expect(second.role).toBe('member');
    expect(second.status).toBe('pending');
  });

  test('signing in again is the same member, not a second one', async () => {
    const first = await store.members.enroll(profile('ada'), NOW);
    const again = await store.members.enroll(profile('ada'), NOW);

    expect(again.id).toBe(first.id);
    expect(await store.members.count()).toBe(1);
  });

  /**
   * The takeover this used to allow.
   *
   * It joined the two: one person, two providers, one member. What it could not tell apart was
   * that person and anybody else who could get a second provider to hand us the same verified
   * address, who then arrived as them, with their role. A club with two providers configured had
   * two doors to every account and no way to see it.
   */
  test('a second provider claiming the same address is refused rather than joined', async () => {
    const github = await store.members.enroll(profile('ada', 'github'), NOW);

    expect(store.members.enroll(profile('ada', 'eduid'), NOW)).rejects.toThrow();
    expect(await store.members.count()).toBe(1);
    expect((await store.members.byId(github.id))?.email).toBe('ada@example.org');
  });

  test('signing in again refreshes what the provider says about them', async () => {
    const first = await store.members.enroll(
      { ...profile('ada'), name: 'Ada L', organisation: 'ethz.ch' },
      NOW,
    );
    const again = await store.members.enroll(
      { ...profile('ada'), name: 'Ada Lovelace', organisation: 'unil.ch' },
      NOW,
    );

    expect(again.id).toBe(first.id);
    expect(again.name).toBe('Ada Lovelace');
    /** Kept rather than only checked: a roster that says which faculty is a roster worth reading. */
    expect(again.organisation).toBe('unil.ch');
  });

  test('a patch touches only what it names', async () => {
    const member = await store.members.enroll(profile('ada'), NOW);
    const updated = await store.members.update(member.id, { status: 'alumni' });

    expect(updated?.status).toBe('alumni');
    expect(updated?.name).toBe(member.name);
    expect(updated?.role).toBe(member.role);
  });
});

describe('Rsvps', () => {
  let store: Store;

  beforeEach(async () => {
    store = await open();
  });

  async function fixture() {
    const organiser = await store.members.enroll(profile('ada'), NOW);
    const member = await store.members.enroll(profile('alan'), NOW);
    const event = await store.events.create(
      {
        title: 'Meeting',
        kind: 'meeting' as KindId,
        state: 'published',
        startsAt: new Date(NOW.getTime() + DAY),
      },
      organiser.id,
      NOW,
    );
    return { organiser, member, event };
  }

  test('answering twice replaces the answer rather than adding one', async () => {
    const { member, event } = await fixture();

    await store.rsvps.answer(event.id, member.id, 'going', NOW);
    await store.rsvps.answer(event.id, member.id, 'declined', NOW);

    expect((await store.rsvps.byMember(event.id, member.id))?.answer).toBe('declined');
    expect(await store.rsvps.seated(event.id)).toBe(0);
  });

  test('attendance survives a later change of answer', async () => {
    const { member, event } = await fixture();

    await store.rsvps.attend(event.id, member.id, true, NOW);
    await store.rsvps.answer(event.id, member.id, 'maybe', NOW);

    const rsvp = await store.rsvps.byMember(event.id, member.id);
    expect(rsvp?.attended).toBe(true);
    expect(rsvp?.answer).toBe('maybe');
  });

  test('a sheet counts the same way a listing does', async () => {
    const { member, organiser, event } = await fixture();

    await store.rsvps.answer(event.id, member.id, 'going', NOW);
    await store.rsvps.answer(event.id, organiser.id, 'maybe', NOW);

    const [listed] = await store.events.list({ state: 'published' });
    const counted = (await import('../src/index.ts')).Rsvps.tally(event, await store.rsvps.sheet(event.id));

    expect(listed?.going).toBe(counted.going);
    expect(listed?.maybe).toBe(counted.maybe);
    expect(counted.going).toBe(1);
  });

  test('an upcoming filter excludes what has already ended', async () => {
    const { organiser } = await fixture();
    await store.events.create(
      {
        title: 'Last week',
        kind: 'social' as KindId,
        state: 'published',
        startsAt: new Date(NOW.getTime() - 7 * DAY),
        endsAt: new Date(NOW.getTime() - 7 * DAY + DAY),
      },
      organiser.id,
      NOW,
    );

    const upcoming = await store.events.list({ state: 'published', upcoming: NOW });
    expect(upcoming.map((tally) => tally.event.title)).toEqual(['Meeting']);
  });
});

describe('Links', () => {
  let store: Store;

  beforeEach(async () => {
    store = await open();
  });

  test('a code links a chat once, and is spent', async () => {
    const member = await store.members.enroll(profile('ada'), NOW);
    const { token } = await store.links.issue(member.id, NOW);

    expect((await store.links.redeem(token, '42', 'ada', NOW))?.id).toBe(member.id);
    expect(await store.links.redeem(token, '43', 'mallory', NOW)).toBeNull();
    expect((await store.links.byChat('42'))?.id).toBe(member.id);
  });

  test('an expired code links nothing', async () => {
    const member = await store.members.enroll(profile('ada'), NOW);
    const { token } = await store.links.issue(member.id, NOW);

    const later = new Date(NOW.getTime() + 2 * DAY);
    expect(await store.links.redeem(token, '42', null, later)).toBeNull();
  });
});

describe('Seasons', () => {
  let store: Store;

  beforeEach(async () => {
    store = await open();
  });

  test('promoting a season demotes the one that was current', async () => {
    const first = await store.seasons.create(
      { name: '25/26', startsAt: NOW, endsAt: new Date(NOW.getTime() + 300 * DAY), current: true },
      NOW,
    );
    const second = await store.seasons.create(
      { name: '26/27', startsAt: NOW, endsAt: new Date(NOW.getTime() + 600 * DAY) },
      NOW,
    );

    await store.seasons.promote(second.id);
    const current = await store.seasons.current();

    expect(current?.id).toBe(second.id);
    expect((await store.seasons.byId(first.id))?.current).toBe(false);
  });

  /** Two admins saving different sections at once: the later save must not revert the earlier. */
  test('a club patch writes the columns it names and leaves the rest as the column held them', async () => {
    await store.club.update({ name: 'Choir', domains: ['ethz.ch'] });
    const after = await store.club.update({ tagline: 'we sing' });

    expect(after.name).toBe('Choir');
    expect(after.domains).toEqual(['ethz.ch']);
    expect(after.tagline).toBe('we sing');
  });

  test('a member is found by an address typed in any case, because one shape is stored', async () => {
    const member = await store.members.enroll(profile('Ada'), NOW);

    expect((await store.members.byEmail('  ADA@example.org '))?.id).toBe(member.id);
    expect(member.email).toBe('ada@example.org');
  });

  /**
   * The references from an event, a repeat and a guest do not cascade on purpose, so the delete
   * used to reach the driver as a foreign key violation and the member as a 500.
   */
  test('removing a member who organised something refuses, and says what to do instead', async () => {
    const ada = await store.members.enroll(profile('ada'), NOW);
    await store.events.create(
      { title: 'Workshop', kind: 'workshop' as KindId, state: 'published', startsAt: NOW },
      ada.id,
      NOW,
    );

    expect(store.members.remove(ada.id)).rejects.toThrow();
    expect(await store.members.byId(ada.id)).not.toBeNull();
  });

  test('a member who wrote nothing is removed', async () => {
    const ada = await store.members.enroll(profile('ada'), NOW);
    await store.members.remove(ada.id);

    expect(await store.members.byId(ada.id)).toBeNull();
  });

  /** Two patches of different switches: the later one must not revert the earlier one. */
  test('a preference patch writes the switches it names and no others', async () => {
    const ada = await store.members.enroll(profile('ada'), NOW);

    await store.prefs.update(ada.id, { telegram: false });
    const after = await store.prefs.update(ada.id, { reminders: false });

    expect(after.telegram).toBe(false);
    expect(after.reminders).toBe(false);
    expect(after.email).toBe(true);
  });

  test('joining twice leaves one membership', async () => {
    const member = await store.members.enroll(profile('ada'), NOW);
    const season = await store.seasons.create(
      { name: '25/26', startsAt: NOW, endsAt: new Date(NOW.getTime() + 300 * DAY) },
      NOW,
    );

    await store.seasons.join(member.id, season.id, NOW);
    await store.seasons.join(member.id, season.id, NOW);

    expect(await store.seasons.roster(season.id)).toHaveLength(1);
  });
});
