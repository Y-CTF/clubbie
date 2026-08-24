import { type Language, LOCALES, Locale } from '@clubbie/core';
import type { Catalogue } from './catalogue.ts';
import { de } from './de.ts';
import { en } from './en.ts';
import { fr } from './fr.ts';

/**
 * The language the app is being read in, and the words that go with it.
 *
 * One lookup, reached as `words.t.events.upcoming`. It is a getter over reactive state rather than
 * a function, so a component that reads it re-renders when the language changes and no page has to
 * subscribe to anything.
 *
 * Which language is the club's decision when it has made one, and the browser's otherwise: a
 * committee that runs in German writes its events in German, and a page half in each is worse for
 * everybody than a page in the wrong one. The region is kept separately from the language, because
 * `de-CH` writes a date differently from `de-DE` while reading the same catalogue.
 */
export class Words {
  /** Each language's name in itself, which is the only way to write a language picker. */
  static readonly NAMES: Record<Language, string> = {
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
  };

  static readonly LANGUAGES = LOCALES;

  private static readonly CATALOGUES: Record<Language, Catalogue> = { en, de, fr };

  language = $state<Language>(Locale.DEFAULT);
  /** The full BCP 47 tag `Intl` is given: the club's language with the reader's own region. */
  private region = $state<string | null>(null);

  get t(): Catalogue {
    return Words.CATALOGUES[this.language];
  }

  /** What `Intl` is handed. Undefined lets the browser decide, which is right before the club has. */
  get tag(): string | undefined {
    return this.region ?? this.language;
  }

  /**
   * Settles on a language. The club's choice wins; without one, the first of the browser's
   * languages this app is written in does, and English is the floor.
   *
   * The tag handed to `Intl` keeps the reader's region when it agrees with the chosen language, so
   * a Swiss reader of a German club gets Swiss dates rather than German ones.
   */
  choose(club: Language | null): void {
    const offered = typeof navigator === 'undefined' ? [] : navigator.languages;
    this.language = club ?? Locale.pick(...offered);
    this.region = offered.find((tag) => Locale.language(tag) === this.language) ?? null;

    /**
     * The document says which language it is in, which is what a screen reader picks its
     * pronunciation from and what a browser's own translation offer reads.
     */
    if (typeof document !== 'undefined') document.documentElement.lang = this.language;
  }
}

/** One language for the app, so every page and every date reads the same way. */
export const words = new Words();

/**
 * Settled before anything renders, from what the browser already knows. The club's own answer
 * arrives a request later and refines it; without this, a German reader gets an English first
 * paint and a flicker, for no reason other than that nobody asked `navigator` first.
 */
words.choose(null);
