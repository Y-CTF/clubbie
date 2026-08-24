/**
 * The languages the app is written in. A Swiss student club is the deployment this was built for,
 * which is why the list is what it is; adding one is a catalogue in `web` and one in `notify`, and
 * the type is what makes the compiler ask for both.
 */
export const LOCALES = ['en', 'de', 'fr'] as const;
export type Language = (typeof LOCALES)[number];

/**
 * Which language a page or a notice is written in.
 *
 * A club chooses one, in its settings, and it applies to everybody: a committee that meets in
 * German writes its events in German, and a per-member language would only mean half the club
 * reading a machine translation of the other half's prose.
 *
 * A tag is negotiated rather than matched exactly, because a browser says `de-CH` and a catalogue
 * is written for `de`. Anything unknown falls through to English rather than being refused: a page
 * in the wrong language beats a page that will not render.
 */
export namespace Locale {
  export const LANGUAGES = LOCALES;
  export const DEFAULT: Language = 'en';
  /** What separates a language from its region in a tag, as BCP 47 writes it. */
  export const SEP = '-';

  export function is(value: string): value is Language {
    return (LOCALES as readonly string[]).includes(value);
  }

  /** The language part of a tag, lowercased: `de-CH` and `DE` are both German. */
  export function language(tag: string): string {
    return (tag.split(SEP)[0] ?? '').toLowerCase();
  }

  /**
   * The first tag in `wanted` this app is written in, or English. Nulls are skipped, so a caller
   * passes the club's setting and the browser's list in one call and lets preference decide.
   */
  export function pick(...wanted: readonly (string | null | undefined)[]): Language {
    for (const tag of wanted) {
      if (!tag) continue;
      const short = language(tag);
      if (is(short)) return short;
    }
    return DEFAULT;
  }
}
