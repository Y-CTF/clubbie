import { beforeEach, describe, expect, test } from 'bun:test';
import type { KindId, Member } from '@clubbie/core';
import { Search, type Store } from '../src/index.ts';
import { Fixture } from './harness.ts';

const NOW = new Date('2026-03-01T12:00:00Z');

let store: Store;

async function member(name: string, email = `${name.toLowerCase()}@example.org`): Promise<Member> {
  return store.members.enroll({ provider: 'test', subject: email, email, name, avatar: null }, NOW);
}

beforeEach(async () => {
  store = await Fixture.open();
  await Fixture.empty(store);
});

/**
 * Searching, which is the one query in the app whose behaviour differs between the two dialects by
 * default. Every case here fails on Postgres, or on SQLite, if `Search` stops naming the escape
 * character or stops folding the case itself.
 */
describe('finding a member', () => {
  test('ignores case, on whichever dialect this is running against', async () => {
    await member('Ada Lovelace');
    await member('Alan Turing');

    expect((await store.members.list({ query: 'ADA' })).map((one) => one.name)).toEqual(['Ada Lovelace']);
    expect((await store.members.list({ query: 'lovelace' })).map((one) => one.name)).toEqual([
      'Ada Lovelace',
    ]);
  });

  /**
   * The case that made `Search` dialect-aware.
   *
   * `lower()` in SQLite folds `A-Z` and leaves every other letter alone, so a member called Émile
   * was findable by typing `émile` on Postgres and findable by nobody on SQLite, which is the
   * default deployment. A club in a French- or German-speaking place has a roster full of these.
   */
  test('folds a letter that is not ascii, on whichever dialect this is running against', async () => {
    await member('Émile Zola', 'emile@example.org');
    await member('Ölberg Öhler', 'olberg@example.org');

    for (const typed of ['émile', 'Émile', 'ÉMILE', 'mile zola']) {
      expect((await store.members.list({ query: typed })).map((one) => one.name)).toEqual(['Émile Zola']);
    }
    expect((await store.members.list({ query: 'öhler' })).map((one) => one.name)).toEqual(['Ölberg Öhler']);
  });

  /**
   * An address is searchable only for a caller the answer would show it to. Anyone else searching
   * one gets nothing: `Wire.peer` strips the column, and a filter that matched it anyway would
   * hand the address back a character at a time.
   */
  test('matches an address only for a caller that may read addresses', async () => {
    await member('Ada Lovelace', 'ada@babbage.example');
    await member('Alan Turing');

    expect(await store.members.list({ query: 'babbage' })).toHaveLength(0);
    expect((await store.members.list({ query: 'babbage', emails: true })).map((one) => one.name)).toEqual([
      'Ada Lovelace',
    ]);
  });

  test('treats a wildcard as a character, so a typed % finds nobody rather than everybody', async () => {
    await member('Ada Lovelace');
    await member('Alan Turing');

    expect(await store.members.list({ query: '%' })).toHaveLength(0);
    expect(await store.members.list({ query: '_' })).toHaveLength(0);
  });

  test('finds the escape character itself when somebody types it', async () => {
    await member(`Ada ${Search.ESCAPE} Lovelace`);

    expect(await store.members.list({ query: Search.ESCAPE })).toHaveLength(1);
  });

  test('a filter and a word narrow together', async () => {
    const ada = await member('Ada Lovelace');
    await store.members.update(ada.id, { status: 'alumni' });
    await member('Ada Byron');

    expect(await store.members.list({ query: 'ada' })).toHaveLength(2);
    expect(await store.members.list({ query: 'ada', status: 'alumni' })).toHaveLength(1);
  });
});

/** Every event here is published: a draft belongs to its organiser and a listing never has one. */
describe('finding an event', () => {
  test('reads the title, the room and the description', async () => {
    const ada = await member('Ada Lovelace');
    await store.events.create(
      {
        title: 'Capture the flag',
        kind: 'competition' as KindId,
        state: 'published',
        location: 'HG F 30',
        startsAt: NOW,
      },
      ada.id,
      NOW,
    );
    await store.events.create(
      {
        title: 'Committee',
        kind: 'meeting' as KindId,
        state: 'published',
        description: 'budget for the flag night',
        startsAt: NOW,
      },
      ada.id,
      NOW,
    );

    expect(await store.events.list({ query: 'flag' })).toHaveLength(2);
    expect((await store.events.list({ query: 'hg f' })).map((one) => one.event.title)).toEqual([
      'Capture the flag',
    ]);
  });

  test('a null column never matches, rather than throwing or matching everything', async () => {
    const ada = await member('Ada Lovelace');
    await store.events.create(
      { title: 'Committee', kind: 'meeting' as KindId, state: 'published', startsAt: NOW },
      ada.id,
      NOW,
    );

    expect(await store.events.list({ query: 'committee' })).toHaveLength(1);
    expect(await store.events.list({ query: 'anywhere' })).toHaveLength(0);
  });
});
