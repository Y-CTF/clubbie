import type { KindId } from '@clubbie/core';
import { api, unwrap } from './api.ts';
import { Query } from './query.svelte.ts';

type Vocabulary = Awaited<ReturnType<typeof read>>;

async function read() {
  return unwrap(await api.kinds.$get());
}

/**
 * What this club calls its events, loaded once and read everywhere.
 *
 * It is data rather than a catalogue entry, which is the whole point: a kind is the club's word,
 * not the app's, so it is not translated and not compiled in. A page that wanted to render one
 * asks here for the label, and gets the id back when the club has since deleted it, which is the
 * only honest answer for an event filed under a word nobody kept.
 */
export class Vocabularies {
  private readonly query = new Query<Vocabulary>(read);

  /**
   * Reads the vocabulary, once.
   *
   * Five pages ask for it, and two of them ask from an effect that also depends on a filter and a
   * search term, so it was refetched on every settled keystroke. It changes when a committee
   * edits it, which is what `force` is for.
   */
  async load(force = false): Promise<void> {
    if (this.query.data !== null && !force) return;
    await this.query.load();
  }

  get all(): Vocabulary {
    return this.query.data ?? [];
  }

  get ids(): KindId[] {
    return this.all.map((kind) => kind.id as KindId);
  }

  /** What to show for a kind. An id that is no longer a kind shows as itself rather than blank. */
  label(id: string): string {
    return this.all.find((kind) => kind.id === id)?.label ?? id;
  }

  /** What a new event starts as: the club's first kind, which is the one it does most often. */
  get first(): KindId | null {
    return (this.all[0]?.id as KindId | undefined) ?? null;
  }
}

/** One vocabulary for the app, so every menu and every listing reads the same words. */
export const kinds = new Vocabularies();
