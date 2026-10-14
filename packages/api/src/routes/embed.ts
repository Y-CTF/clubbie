import { Cache, Club, Event, type Language, Locale, Stamp } from '@clubbie/core';
import { Markup } from '@clubbie/term';
import { Hono } from 'hono';
import type { Env } from '../context.ts';

/**
 * The club's next few events, as a page another site may put in a frame.
 *
 * It is HTML rather than JSON because the point is that the club's own website embeds it without
 * writing any code: a website nobody maintains is the normal case for a volunteer club, and "paste
 * this one line" is the only integration that survives that.
 *
 * Which sites may frame it is the club's own list. A browser does not ask whether a page may be
 * framed, it asks by whom, so a club that has named nobody is framed by nobody: the default here
 * is a refusal rather than `*`, which would let any site pass the club's events off as its own.
 */
export const embed = new Hono<Env>().get('/events', async (c) => {
  const store = c.get('store');
  const club = await store.club.read();

  const listing = await store.events.list({
    state: Event.LIVE,
    listed: true,
    upcoming: new Date(),
    limit: Club.WINDOW,
  });

  const rows = listing
    .map(({ event }) => event)
    .filter((event) => event.public())
    .map(
      (event) => `<li>
        <time datetime="${Markup.attr(event.startsAt.toISOString())}">${Markup.html(Stamp.at(event.startsAt, club))}</time>
        <span class="title">${Markup.html(event.title)}</span>
        ${event.location ? `<span class="where">${Markup.html(event.location)}</span>` : ''}
      </li>`,
    )
    .join('');

  return c.html(Embed.page(club, rows, c.get('options').baseUrl), 200, {
    'content-security-policy': Embed.policy(club),
    /** Framed or not, it is public and unchanging for a minute: a website may hit it every load. */
    'cache-control': Cache.FRESH,
    ...Cache.SNIFF,
  });
});

export namespace Embed {
  /** What the widget says when there is nothing to list. Keyed by `Language`, so a new one must write it. */
  export const NONE: Readonly<Record<Language, string>> = {
    en: 'no upcoming events',
    de: 'keine anstehenden Veranstaltungen',
    fr: 'aucun événement à venir',
  };

  /**
   * Who may frame this. `frame-ancestors 'none'` for a club that has named nobody, which is the
   * safe default and the one a deployment starts in.
   */
  export function policy(club: Club): string {
    const ancestors = club.embeds.length > 0 ? club.embeds.join(' ') : "'none'";
    return `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors ${ancestors}`;
  }

  /**
   * One document, with its styling inline. The club's accent and corner cross so the widget looks
   * like the club rather than like this app, and nothing else does: a frame inherits no stylesheet
   * and must not need one.
   */
  export function page(club: Club, rows: string, base: string): string {
    const accent = Markup.attr(club.design.accent);
    return `<!doctype html>
<html lang="${Markup.attr(Locale.pick(club.locale))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${Markup.html(club.name)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { display: flex; flex-wrap: wrap; gap: .25rem .75rem; padding: .75rem 0; border-top: 1px solid rgb(128 128 128 / .25); }
  li:first-child { border-top: 0; }
  time { font-variant-numeric: tabular-nums; opacity: .7; min-width: 10rem; }
  .title { font-weight: 600; }
  .where { opacity: .7; }
  .none { opacity: .7; padding: .75rem 0; }
  a { color: ${accent}; }
</style>
</head>
<body>
${rows ? `<ul>${rows}</ul>` : `<p class="none">${Markup.html(Embed.NONE[Locale.pick(club.locale)])}</p>`}
<p><a href="${Markup.attr(base)}" target="_blank" rel="noopener">${Markup.html(club.name)}</a></p>
</body>
</html>`;
  }
}
