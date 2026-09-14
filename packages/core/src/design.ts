/**
 * What a club may change about how its site looks.
 *
 * Two kinds of choice live here and they are different on purpose. A *name* is a choice with no
 * middle: a serif face is not seventy percent of a sans one, and a forced dark palette is not a
 * degree of the system one, so those stay closed lists with a word in every language. A *measure*
 * is a choice that does have a middle: how round a corner is, how much air a page has, how cold
 * the greys are. Those used to be three-word lists too, and a committee that wanted corners a
 * little rounder than "soft" had to want a fork instead. They are numbers now, with a range and a
 * default owned here, so the settings page can offer the whole scale rather than three points on
 * it.
 *
 * A name means nothing without the stylesheet that reads it; a measure means what it says. Both
 * are stored, so a deployment is styled by its committee rather than by a rebuild.
 */
export const PALETTES = ['system', 'light', 'dark'] as const;
export type Palette = (typeof PALETTES)[number];

/** Three faces, all of them stacks that end in something every machine already has. */
export const FONTS = ['sans', 'serif', 'mono'] as const;
export type Font = (typeof FONTS)[number];

/** How wide the column of content is allowed to get on a large screen. */
export const WIDTHS = ['narrow', 'normal', 'wide'] as const;
export type Width = (typeof WIDTHS)[number];

/**
 * A link a club puts in its own navigation: its wiki, its chat, the university page it belongs to.
 *
 * A club is not only this app, and the app pretending otherwise is what makes people keep a
 * bookmark folder instead. Five is the cap because a sixth is a menu, and a menu is a website.
 */
export interface Shortcut {
  readonly label: string;
  readonly url: string;
}

/** A measure: what a slider may offer, and where it starts. Every bound is enforced on write. */
export interface Range {
  readonly min: number;
  readonly max: number;
  /** The smallest move worth making, so a slider does not offer differences nobody can see. */
  readonly step: number;
  readonly value: number;
}

export interface DesignFields {
  readonly accent: string;
  /**
   * The page's background, when the club names one. Null is the mixed neutral, which follows the
   * hue, the strength and the reader's light or dark setting; a colour here replaces it in both.
   *
   * It is nullable for that reason: an explicit colour is one colour, and a club that wants its
   * site to follow the reader wants the mix, not a light green that stays light green at night.
   */
  readonly paper: string | null;
  readonly palette: Palette;
  readonly font: Font;
  /** The face headings are set in, which is where a club's character actually shows. */
  readonly display: Font;
  readonly width: Width;
  /** How round every corner in the app is, in pixels. Zero is square. */
  readonly corner: number;
  /** How much vertical air the page has, as a percentage of the default rhythm. */
  readonly space: number;
  /** The hue every neutral is mixed from, in degrees: cold greys, warm greys, or none at all. */
  readonly hue: number;
  /** How much colour those neutrals carry. Zero is a true grey. */
  readonly tint: number;
  /** The size of the base text, as a percentage. A club reading rosters on a projector wants more. */
  readonly scale: number;
  /** Whether the app animates at all. A reader who finds movement distracting turns it off here. */
  readonly motion: boolean;
  /** The club's own links, in the navigation beside the app's own pages. */
  readonly links: readonly Shortcut[];
  /** A wide image for the top of the public page. Null is the plain heading. */
  readonly banner: string | null;
  /** A paragraph under the tagline, for the club that has more than one line to say. */
  readonly blurb: string | null;
  /** A line at the foot of every page: a contact address, a room number, a licence. */
  readonly footer: string | null;
}

/** The fields are declared once, in `DesignFields`; the class carries them by declaration merging. */
export interface Design extends DesignFields {}

export class Design {
  static readonly PALETTES = PALETTES;
  static readonly FONTS = FONTS;
  static readonly WIDTHS = WIDTHS;

  /** The one colour a deployment names outright, as a CSS colour the SPA sets a token from. */
  static readonly ACCENT = '#4f46e5';
  /** What the colour box shows before a club has picked a paper of its own. */
  static readonly PAPER = '#ffffff';
  /** What `space`, `tint` and `scale` are out of: they are stored as whole percents. */
  static readonly PERCENT = 100;
  /** How much ink is mixed into the paper to get the surface a card or a field sits on. */
  static readonly SUNK = 4;
  static readonly PALETTE: Palette = 'system';
  static readonly FONT: Font = 'sans';
  static readonly DISPLAY: Font = 'sans';
  static readonly WIDTH: Width = 'normal';
  static readonly MOTION = true;
  /** How many links a club may add, and how long each may be. */
  static readonly LINKS = 5;
  static readonly LABEL = 24;

  /** The measures. Each carries its own bounds, so nothing else has to know what is sensible. */
  static readonly CORNER: Range = { min: 0, max: 24, step: 1, value: 8 };
  static readonly SPACE: Range = { min: 70, max: 160, step: 5, value: 100 };
  static readonly HUE: Range = { min: 0, max: 360, step: 5, value: 260 };
  static readonly TINT: Range = { min: 0, max: 6, step: 1, value: 2 };
  static readonly SCALE: Range = { min: 90, max: 125, step: 5, value: 100 };

  /** How long a blurb may be: a paragraph, not a constitution. */
  static readonly BLURB = 600;
  /** How long the footer line may be: a line. */
  static readonly FOOTER = 200;

  constructor(fields: DesignFields) {
    Object.assign(this, fields);
  }

  /** What a site looks like before anybody has opened the design page. */
  static default(): Design {
    return new Design({
      accent: Design.ACCENT,
      paper: null,
      palette: Design.PALETTE,
      font: Design.FONT,
      display: Design.DISPLAY,
      width: Design.WIDTH,
      corner: Design.CORNER.value,
      space: Design.SPACE.value,
      hue: Design.HUE.value,
      tint: Design.TINT.value,
      scale: Design.SCALE.value,
      motion: Design.MOTION,
      links: [],
      banner: null,
      blurb: null,
      footer: null,
    });
  }

  static palette(value: string | null): Palette {
    return Design.one(PALETTES, value, Design.PALETTE);
  }

  static font(value: string | null): Font {
    return Design.one(FONTS, value, Design.FONT);
  }

  static width(value: string | null): Width {
    return Design.one(WIDTHS, value, Design.WIDTH);
  }

  /**
   * The club's links as they were stored: one JSON column, read back defensively.
   *
   * A column is not a schema. It holds what some release wrote, and this one is not entitled to
   * throw a page away because a shape changed, so anything that is not a label and a url is
   * dropped and what is left is capped at what a navigation can carry.
   */
  static links(raw: string | null): Shortcut[] {
    if (!raw) return [];

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((one): one is Shortcut => Design.shortcut(one))
        .slice(0, Design.LINKS)
        .map((one) => ({ label: one.label.slice(0, Design.LABEL), url: one.url }));
    } catch {
      return [];
    }
  }

  private static shortcut(value: unknown): value is Shortcut {
    if (typeof value !== 'object' || value === null) return false;

    const { label, url } = value as Partial<Shortcut>;
    return typeof label === 'string' && label !== '' && typeof url === 'string' && Design.reachable(url);
  }

  /**
   * A link the browser may follow: somewhere else over TLS, or somewhere in this app.
   *
   * `//host/x` starts with a slash and is not in this app: it is another origin over whatever
   * scheme the page happens to be on. It read as internal, so it was offered as an in-app link
   * and rendered without `rel="noopener noreferrer"` while the browser navigated off-site.
   */
  static reachable(url: string): boolean {
    return url.startsWith('https://') || (url.startsWith('/') && !url.startsWith('//'));
  }

  /**
   * A stored measure, brought back inside its range.
   *
   * The same reasoning as `one`: the column holds whatever was written into it, by this release
   * or another, and a corner radius of nine hundred is a page nobody can read. Out of range is
   * clamped rather than refused, because the nearest legal value is what was meant.
   */
  static measure(range: Range, value: number | null): number {
    if (value === null || !Number.isFinite(value)) return range.value;
    return Math.min(range.max, Math.max(range.min, Math.round(value)));
  }

  /**
   * A stored name this release recognises, or the default. A column holds whatever an older or
   * newer release wrote into it, and a page rendered with `font: banana` is worse than one
   * rendered with the default.
   */
  private static one<T extends string>(known: readonly T[], value: string | null, fallback: T): T {
    return value !== null && (known as readonly string[]).includes(value) ? (value as T) : fallback;
  }
}
