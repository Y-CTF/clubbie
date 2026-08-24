import type { Id } from './id.ts';

/**
 * What kind of thing an event is: a competition, a rehearsal, a general assembly, an apéro.
 *
 * It is a row rather than a union because it is the club's vocabulary, not the app's. A choir and a
 * CTF team share every other concept in here and share none of these words, and a fixed list means
 * every club that is not the one this was written for files its evenings under "other".
 *
 * The id is a slug the club never sees and the label is what it typed. They are separate so that
 * renaming "social" to "apéro" is one row, not an update over every event ever recorded: the id is
 * what an event stores, and the label is only ever read.
 */
export type KindId = Id<'kind'>;

export interface KindFields {
  readonly id: KindId;
  readonly label: string;
  /** Where it sits in a menu. A club puts the thing it does every week at the top. */
  readonly position: number;
}

/** The fields are declared once, in `KindFields`; the class carries them by declaration merging. */
export interface Kind extends KindFields {}

export class Kind {
  /** Lower case, digits and single hyphens: a slug in a url and a value in a column. */
  static readonly SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  static readonly LENGTH = 32;
  static readonly LABEL = 60;
  /** How many a club may have. Past this it is not a vocabulary, it is a tagging system. */
  static readonly LIMIT = 24;
  static readonly STEP = 10;

  /**
   * What a club starts with, and what migration 9 writes for a club that already has events. The
   * ids are exactly the values the app used to accept as a union, so every event ever stamped
   * still points at something.
   */
  static readonly DEFAULTS: readonly { id: string; label: string }[] = [
    { id: 'competition', label: 'competition' },
    { id: 'workshop', label: 'workshop' },
    { id: 'meeting', label: 'meeting' },
    { id: 'social', label: 'social' },
    { id: 'conference', label: 'conference' },
    { id: 'other', label: 'other' },
  ];

  constructor(fields: KindFields) {
    Object.assign(this, fields);
  }

  static is(value: string): value is KindId {
    return value.length > 0 && value.length <= Kind.LENGTH && Kind.SLUG.test(value);
  }

  /**
   * A label as a slug: lower case, accents folded, everything else a hyphen. It is a suggestion,
   * not a rule, and it can come back empty for a label with no latin letters in it at all, which
   * is why a caller falls back rather than trusting it.
   */
  static slug(label: string): string {
    return label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, Kind.LENGTH)
      .replace(/-+$/g, '');
  }
}
