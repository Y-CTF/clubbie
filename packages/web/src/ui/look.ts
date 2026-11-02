/**
 * What a pressable thing looks like, in one place, because not all of them are `<button>`.
 *
 * Four looks and two sizes, and that is the whole vocabulary. A look says how much the action
 * matters (`solid` is the one thing the screen is for, `quiet` an ordinary action, `plain` a
 * secondary one, `danger` the one that cannot be undone); a size says where it stands (`ROW` in
 * a header or a list, `FIELD` beside a text box, so the two edges line up).
 *
 * The `btn` class is the hook the stylesheet uses to raise the height on a touch screen.
 */
export const LOOKS = {
  solid: 'bg-accent text-paper hover:opacity-90',
  danger: 'bg-declined text-paper hover:opacity-90',
  quiet: 'border border-line bg-paper hover:border-muted',
  plain: 'bg-sunk text-ink hover:bg-line',
} as const;

export type Look = keyof typeof LOOKS;

export const SHAPE =
  'btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition active:scale-[0.98]';

export const ROW = 'h-9 px-3.5 text-sm';
export const FIELD = 'h-10 px-4 text-sm';

/** The classes for one look, for an `<a>` that acts as a button. `Button` uses the same. */
export function look(name: Look = 'quiet', field = false): string {
  return `${SHAPE} ${field ? FIELD : ROW} ${LOOKS[name]}`;
}
