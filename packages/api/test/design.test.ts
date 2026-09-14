import { beforeEach, describe, expect, test } from 'bun:test';
import { Asset, Design } from '@clubbie/core';
import { type Harness, harness, refusal } from './harness.ts';

/**
 * What a club may change about its own site, and what it may not.
 *
 * A design value is either a name from a closed list or a measure with a range, so the interesting
 * cases are the ones outside: a page rendered with `font: banana` is a page that does not render,
 * a corner radius of nine hundred is one nobody can read, and an image field that accepted any
 * string at all is how a logo becomes a `javascript:` url.
 */
describe('the design a club chooses', () => {
  let h: Harness;
  let admin: string;

  beforeEach(async () => {
    h = await harness();
    admin = await h.signIn(await h.member('ada', 'active', 'admin'));
  });

  const patch = (body: Record<string, unknown>, cookie = admin) =>
    h.call('/club', { method: 'PATCH', cookie, body: JSON.stringify(body) });

  test('is stored and comes back on the club, whoever asks', async () => {
    const written = await patch({
      accent: '#112233',
      palette: 'dark',
      font: 'serif',
      display: 'mono',
      width: 'wide',
      corner: 0,
      space: 135,
      hue: 90,
      scale: 110,
      motion: false,
      blurb: 'we break things on wednesdays.',
      footer: 'room b12, wednesdays at seven',
    });
    expect(written.status).toBe(200);

    /** A signed-out visitor gets the whole look: the sign-in page is the club's page too. */
    const seen = (await (await h.call('/club')).json()) as { design: Record<string, unknown> };
    expect(seen.design).toMatchObject({
      accent: '#112233',
      palette: 'dark',
      font: 'serif',
      display: 'mono',
      width: 'wide',
      corner: 0,
      space: 135,
      hue: 90,
      scale: 110,
      motion: false,
      footer: 'room b12, wednesdays at seven',
    });
  });

  test('refuses a name that is not on the list', async () => {
    for (const body of [{ palette: 'neon' }, { font: 'comic' }, { display: 'comic' }, { width: 'huge' }]) {
      expect((await patch(body)).status).toBe(422);
    }
  });

  test('refuses a measure outside the range it published', async () => {
    for (const body of [
      { corner: Design.CORNER.max + 1 },
      { corner: -1 },
      { space: Design.SPACE.min - 5 },
      { hue: 400 },
      { scale: 500 },
      { corner: 4.5 },
    ]) {
      expect((await patch(body)).status).toBe(422);
    }

    /** Both ends of every range are legal, which is what a slider will actually send. */
    for (const range of [Design.CORNER, Design.SPACE, Design.HUE, Design.TINT, Design.SCALE] as const) {
      expect((await patch({ corner: Design.CORNER.value })).status).toBe(200);
      expect(range.min).toBeLessThan(range.max);
    }
  });

  test("keeps the club's own links, and refuses one a browser would run", async () => {
    const written = await patch({
      links: [
        { label: 'wiki', url: 'https://wiki.example/club' },
        { label: 'members', url: '/members' },
      ],
    });
    expect(written.status).toBe(200);

    const seen = (await (await h.call('/club')).json()) as {
      design: { links: { label: string; url: string }[] };
    };
    expect(seen.design.links).toEqual([
      { label: 'wiki', url: 'https://wiki.example/club' },
      { label: 'members', url: '/members' },
    ]);

    for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'http://plain.example']) {
      expect((await patch({ links: [{ label: 'x', url }] })).status).toBe(422);
    }

    /** Five is the cap: a sixth is a menu, and a menu is a website. */
    const many = Array.from({ length: Design.LINKS + 1 }, (_, index) => ({
      label: `l${index}`,
      url: `https://example.org/${index}`,
    }));
    expect((await patch({ links: many })).status).toBe(422);
  });

  test('refuses an image url a browser would run', async () => {
    for (const logo of ['javascript:alert(1)', 'data:text/html,<script>', 'http://plain.example/x.png']) {
      expect((await patch({ logo })).status).toBe(422);
    }

    expect((await patch({ logo: 'https://club.example/logo.png' })).status).toBe(200);
    expect((await patch({ logo: `${Asset.PATH}/01ABC` })).status).toBe(200);
  });

  test('a stored value this release does not know reads back as the default', async () => {
    /** The row migration 16 created, as a release that knew a palette this one does not would hold it. */
    await h.store.db
      .updateTable('club')
      .set({ name: 'Polytech', palette: 'neon', updatedAt: Date.now() })
      .where('id', '=', 'club')
      .execute();

    const club = await h.store.club.read();
    expect(club.design.palette).toBe(Design.PALETTE);
  });

  test('an unrelated edit leaves a column this release cannot read alone', async () => {
    await h.store.db
      .updateTable('club')
      .set({ name: 'Polytech', locale: 'it', updatedAt: Date.now() })
      .where('id', '=', 'club')
      .execute();

    await h.store.club.update({ name: 'Polytech CTF' });

    const row = await h.store.db.selectFrom('club').selectAll().executeTakeFirstOrThrow();
    expect(row.locale).toBe('it');
  });

  test('an ordinary member changes none of it', async () => {
    const theirs = await h.signIn(await h.member('alan'));
    expect((await patch({ accent: '#000000' }, theirs)).status).toBe(403);
  });
});

describe('an image a club uploads', () => {
  let h: Harness;
  let admin: string;

  /** A one-pixel png, which is a real png and small enough to write out. */
  const Png = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
    (char) => char.charCodeAt(0),
  );

  beforeEach(async () => {
    h = await harness();
    admin = await h.signIn(await h.member('ada', 'active', 'admin'));
  });

  const upload = (body: BodyInit, type: string, cookie = admin) =>
    h.call('/assets', { method: 'POST', cookie, body, headers: { 'content-type': type } });

  test('goes in, comes back out byte for byte, and is readable without a session', async () => {
    const answer = await upload(Png, 'image/png');
    expect(answer.status).toBe(201);

    const { url, bytes } = (await answer.json()) as { url: string; bytes: number };
    expect(bytes).toBe(Png.byteLength);
    expect(url.startsWith(`${Asset.PATH}/`)).toBe(true);

    /** The route is mounted under `/api`, and the harness calls it without that prefix. */
    const read = await h.call(url.replace('/api', ''));
    expect(read.status).toBe(200);
    expect(read.headers.get('content-type')).toBe('image/png');
    expect(read.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(Png);
  });

  test('refuses a type that is not an image, whatever the bytes are', async () => {
    const answer = await upload('<script>alert(1)</script>', 'text/html');
    expect(answer.status).toBe(422);
    expect(String((await refusal(answer)).diag.code)).toBe('asset.type');
  });

  test('refuses one that would live in every backup', async () => {
    const answer = await upload(new Uint8Array(Asset.LIMIT + 1), 'image/png');
    expect(answer.status).toBe(422);
    expect(String((await refusal(answer)).diag.code)).toBe('asset.size');
  });

  test('is an admin act, in both directions, and is recorded', async () => {
    const theirs = await h.signIn(await h.member('alan'));
    expect((await upload(Png, 'image/png', theirs)).status).toBe(403);

    const { id } = (await (await upload(Png, 'image/png')).json()) as { id: string };
    expect((await h.call(`/assets/${id}`, { method: 'DELETE', cookie: theirs })).status).toBe(403);
    expect((await h.call(`/assets/${id}`, { method: 'DELETE', cookie: admin })).status).toBe(200);

    const trail = await h.store.audit.list();
    expect(trail.map((entry) => entry.act).sort()).toEqual(['asset.add', 'asset.remove']);
  });
});
