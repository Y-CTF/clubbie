import { Style } from './style.ts';

/**
 * The escape sequences, and the only place one is written. Anything that wants styling goes
 * through `Paint`, which decides whether these are emitted at all.
 */
export namespace Ansi {
  export const CSI = '\u001b[';
  export const SGR = 'm';
  /**
   * Any SGR sequence, which is what stripping and measuring both need. Built from `CSI` rather
   * than written as a literal, so the escape character appears in the source exactly once.
   */
  export const PATTERN = new RegExp(`${CSI.replace('[', '\\[')}[0-9;]*${SGR}`, 'g');

  export function sgr(parameter: number): string {
    return `${CSI}${parameter}${SGR}`;
  }

  export function on(style: Style): string {
    return sgr(Style.sgr(style).on);
  }

  /** Narrow, never a full reset: see `Sgr`. */
  export function off(style: Style): string {
    return sgr(Style.sgr(style).off);
  }

  export function wrap(style: Style, text: string): string {
    return `${on(style)}${text}${off(style)}`;
  }

  export function strip(text: string): string {
    return text.replace(PATTERN, '');
  }

  /** Visible width, so alignment survives styling. Wide glyphs are out of scope here. */
  export function width(text: string): number {
    return [...strip(text)].length;
  }
}
