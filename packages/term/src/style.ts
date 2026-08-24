/**
 * A style, as the pair of SGR parameters that turn it on and off.
 *
 * The *off* parameter is always the narrow one (`39` for a colour, `22` for bold), never `0`.
 * A full reset would also drop whatever styling encloses the span, which is how a coloured word
 * inside a red diagnostic line turns the rest of that line white.
 */
export interface Sgr {
  readonly on: number;
  readonly off: number;
}

const STYLES = {
  bold: { on: 1, off: 22 },
  dim: { on: 2, off: 22 },
  italic: { on: 3, off: 23 },
  underline: { on: 4, off: 24 },
  red: { on: 31, off: 39 },
  green: { on: 32, off: 39 },
  yellow: { on: 33, off: 39 },
  blue: { on: 34, off: 39 },
  magenta: { on: 35, off: 39 },
  cyan: { on: 36, off: 39 },
  grey: { on: 90, off: 39 },
} as const satisfies Record<string, Sgr>;

export type Style = keyof typeof STYLES;

export namespace Style {
  export const ALL = Object.keys(STYLES) as Style[];

  export function sgr(style: Style): Sgr {
    return STYLES[style];
  }
}
