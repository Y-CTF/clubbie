import { beforeEach, describe, expect, test } from 'bun:test';
import { type Harness, harness } from './harness.ts';

let h: Harness;

beforeEach(async () => {
  h = await harness();
});

async function widget(): Promise<Response> {
  return await h.call('/embed/events');
}

describe('the events widget another site embeds', () => {
  /**
   * A browser asks which origins may frame a page, not whether. A club that has named nobody is
   * framed by nobody, because the alternative default is any site passing its events off as theirs.
   */
  test('is framed by nobody until the club names somebody', async () => {
    expect((await widget()).headers.get('content-security-policy')).toContain("frame-ancestors 'none'");

    await h.store.club.update({ embeds: ['https://yctf.ch'] });
    expect((await widget()).headers.get('content-security-policy')).toContain(
      'frame-ancestors https://yctf.ch',
    );
  });

  test('says there is nothing to list rather than repeating the club name', async () => {
    expect(await (await widget()).text()).toContain('<p class="none">no upcoming events</p>');

    await h.store.club.update({ locale: 'fr' });
    expect(await (await widget()).text()).toContain('aucun événement à venir');
  });

  test('shows the events a signed-out visitor may see, and no others', async () => {
    const ada = await h.member('ada', 'active', 'admin');
    await h.store.club.update({ listed: true });

    await h.event(ada);
    const hidden = await h.event(ada);
    await h.store.events.update(hidden.id, { title: 'Committee only', listed: false });

    const body = await (await widget()).text();
    expect(body).toContain('Workshop');
    expect(body).not.toContain('Committee only');
  });

  test('a title a member typed cannot write markup into the page', async () => {
    const ada = await h.member('ada', 'active', 'admin');
    const event = await h.event(ada);
    await h.store.events.update(event.id, { title: '<script>alert(1)</script>' });

    const body = await (await widget()).text();
    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).toContain('&lt;script&gt;');
  });

  test('is a whole document, served as html and never sniffed', async () => {
    const response = await widget();

    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toStartWith('<!doctype html>');
  });

  /** No script anywhere in it, so the page it is framed by has nothing to be wary of. */
  test('runs no script of its own', async () => {
    const policy = (await widget()).headers.get('content-security-policy') ?? '';
    expect(policy).toContain("default-src 'none'");
  });
});
