/**
 * The colour an event is drawn in, which is its kind's.
 *
 * A calendar without colour is a wall of identical grey boxes, and the thing a member is scanning
 * for is "which of these is training". So a kind needs a colour, and a club that types in a new
 * kind is not going to be asked to pick one: nobody wants a colour picker in the middle of naming
 * the thing they do on Tuesdays.
 *
 * So the colour is derived rather than chosen. The kind's own slug decides its hue, which makes it
 * stable across reloads, across members and across a reordering of the list, and only the two
 * numbers that keep every hue readable are a decision. Those live in `app.css` with the rest of
 * the palette, once for the light page and once for the dark one, so this file never says how
 * bright anything is.
 */
export namespace Hues {
  export const TURN = 360;
  /** FNV-1a, for a hue that scatters near-identical slugs rather than clustering them. */
  export const OFFSET = 2_166_136_261;
  export const PRIME = 16_777_619;

  /**
   * The css colour for a kind, as `oklch` over the two tokens the stylesheet owns.
   *
   * Kept once per kind. A club has a handful of them and a month grid asks for the same few colours
   * a hundred times over, once per event drawn, on a page that redraws every minute.
   */
  const COLOURS = new Map<string, string>();

  export function of(kind: string): string {
    const known = COLOURS.get(kind);
    if (known) return known;

    const colour = `oklch(var(--kind-lightness) var(--kind-chroma) ${angle(kind)})`;
    COLOURS.set(kind, colour);
    return colour;
  }

  /** The custom property a chip is painted through, which is the same one a badge uses. */
  export function tint(kind: string): string {
    return `--tint: ${of(kind)}`;
  }

  export function angle(kind: string): number {
    let hash = OFFSET;
    /** `imul` rather than `*`: the product of two 32-bit numbers is past what a double holds
     * exactly, and rounding it would make the hue depend on the engine. */
    for (const char of kind) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), PRIME);
    return (hash >>> 0) % TURN;
  }
}
