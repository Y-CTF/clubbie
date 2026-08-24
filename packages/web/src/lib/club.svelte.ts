import { Design } from '@clubbie/core';
import { api, unwrap } from './api.ts';
import { Query } from './query.svelte.ts';
import { words } from './words/index.svelte.ts';

type Identity = Awaited<ReturnType<typeof read>>;

async function read() {
  return unwrap(await api.club.$get());
}

/**
 * The club's own name and look, loaded once and applied to the page.
 *
 * The API answers this for a signed-out caller too, so the sign-in page can already say whose
 * club it is: a member arriving at a link should recognise where they are before they are asked
 * to prove who they are. The whole design crosses for the same reason. A visitor who saw the
 * default palette for a second before the club's arrived would watch the site change under them.
 */
export class Identified {
  /**
   * A choice with no middle travels as a data attribute, because each one selects a *block* of
   * tokens in `app.css` (a palette is five colours, a face is a stack) and a stylesheet is the
   * right place for that, not a script.
   */
  static readonly MARKS = ['palette', 'font', 'display', 'width', 'motion'] as const;

  /**
   * A measure travels as the custom property it is, in the unit the stylesheet expects.
   *
   * The accent is here for the same reason it always was: it is a colour somebody picked, not one
   * of three. The rest joined it when the three-word scales became numbers, and the neutrals are
   * now built from `--hue-club` and `--tint-club` rather than from a hue written into every
   * `oklch()` in the file.
   */
  static readonly TOKENS = {
    '--color-accent': (design: Identity['design']) => design.accent,
    '--corner-club': (design: Identity['design']) => `${design.corner}px`,
    '--space-club': (design: Identity['design']) => String(design.space / 100),
    '--hue-club': (design: Identity['design']) => String(design.hue),
    '--tint-club': (design: Identity['design']) => String(design.tint / 100),
    '--scale-club': (design: Identity['design']) => `${design.scale}%`,
  } as const;

  private readonly query = new Query<Identity>(read);

  async load(): Promise<void> {
    await this.query.load();
    this.paint();
    /** The club's language, if it has chosen one; the reader's browser decides until then. */
    words.choose(this.query.data?.locale ?? null);
  }

  get name(): string {
    return this.query.data?.name ?? '';
  }

  get tagline(): string | null {
    return this.query.data?.tagline ?? null;
  }

  get logo(): string | null {
    return this.query.data?.logo ?? null;
  }

  get banner(): string | null {
    return this.query.data?.design.banner ?? null;
  }

  get blurb(): string | null {
    return this.query.data?.design.blurb ?? null;
  }

  get footer(): string | null {
    return this.query.data?.design.footer ?? null;
  }

  /** The club's own links, for the navigation. Empty for a club that has not added any. */
  get links(): Identity['design']['links'] {
    return this.query.data?.design.links ?? [];
  }

  get listed(): boolean {
    return this.query.data?.listed ?? false;
  }

  /** Names as attributes, measures as properties: the whole theme is derived from them in `app.css`. */
  private paint(): void {
    const design = this.query.data?.design;
    if (!design) return;

    const root = document.documentElement;
    for (const [token, of] of Object.entries(Identified.TOKENS)) root.style.setProperty(token, of(design));
    for (const mark of Identified.MARKS) root.dataset[mark] = String(design[mark]);

    /**
     * A named paper replaces the mixed neutral, and the surface under a card is mixed from it so
     * the two never drift apart. Null takes both back off, which is what clearing the field does:
     * the stylesheet's own mix returns, hue, strength, light and dark included.
     */
    root.style.removeProperty('--color-paper');
    root.style.removeProperty('--color-sunk');
    if (design.paper === null) return;

    root.style.setProperty('--color-paper', design.paper);
    root.style.setProperty(
      '--color-sunk',
      `color-mix(in oklch, var(--color-ink) ${Design.SUNK}%, ${design.paper})`,
    );
  }
}

/** One identity for the app, so every page reads the same name. */
export const club = new Identified();
