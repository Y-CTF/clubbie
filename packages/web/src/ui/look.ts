/**
 * What a pressable thing looks like, in one place, because two of them are not both `<button>`.
 *
 * "Edit" and "attendance" sitting next to each other as two pieces of muted text read as one
 * phrase, "edit attendance", and a row of four of them reads as a sentence nobody wrote. So every
 * action carries a shape: padding, a rounded box, and a surface that separates it from the action
 * beside it. Which action is which is then a matter of looking, not of parsing.
 */
export const LOOKS = {
  /** The one thing this screen is for. */
  solid: 'bg-accent text-paper hover:opacity-90',
  /** The one thing on this screen that cannot be undone. */
  danger: 'bg-declined text-paper hover:opacity-90',
  /** An ordinary action, outlined. */
  quiet: 'border border-line hover:border-accent hover:text-accent',
  /** A secondary action: quieter than `quiet`, still unmistakably a control. */
  plain: 'bg-sunk text-muted hover:text-ink',
} as const;

export type Look = keyof typeof LOOKS;

/**
 * Shared by every look, so a link and a button of the same look are the same size. The press is
 * here too: a control that gives nothing back under the finger is the difference between a page
 * and an app, and it costs one transform.
 */
export const SHAPE =
  'inline-flex items-center justify-center gap-2 rounded-lg transition active:scale-[0.98]';

/**
 * Two heights, and only two.
 *
 * `ROW` is an action in a list or a header. `FIELD` is an action standing next to a text box, and
 * it matches what `Input` and `Select` are: a button half the height of the field beside it reads
 * as an afterthought, and the two edges not lining up is the thing that makes a form look
 * unfinished.
 */
export const ROW = 'px-3 py-1.5 text-sm';
export const FIELD = 'px-4 py-2.5 text-base';

/** The classes for one look, for an `<a>` that acts as a button. `Button` uses the same. */
export function look(name: Look = 'quiet', field = false): string {
  return `${SHAPE} ${field ? FIELD : ROW} ${LOOKS[name]}`;
}
