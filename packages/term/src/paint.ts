import { Ansi } from './ansi.ts';
import type { Style } from './style.ts';

/**
 * Whether output is styled, decided once for the process, and every styling call in the
 * codebase. A module that reached for an escape sequence itself would be the one place that
 * ignores `NO_COLOR`, so none does.
 */
export class Paint {
  static readonly OFF = 'NO_COLOR';
  static readonly ON = 'FORCE_COLOR';

  private constructor(readonly enabled: boolean) {}

  static readonly plain = new Paint(false);

  /**
   * `NO_COLOR` wins over everything, then `FORCE_COLOR`, then whether stdout is a terminal.
   * A pipe gets no styling, which is what makes `clubbie ... | grep` readable.
   */
  static detect(env: Record<string, string | undefined> = globalThis.process?.env ?? {}): Paint {
    if (env[Paint.OFF]) return Paint.plain;
    if (env[Paint.ON]) return new Paint(true);
    return new Paint(Boolean(globalThis.process?.stdout?.isTTY));
  }

  style(style: Style, text: string): string {
    return this.enabled ? Ansi.wrap(style, text) : text;
  }

  bold = (text: string): string => this.style('bold', text);
  dim = (text: string): string => this.style('dim', text);
  italic = (text: string): string => this.style('italic', text);
  underline = (text: string): string => this.style('underline', text);
  red = (text: string): string => this.style('red', text);
  green = (text: string): string => this.style('green', text);
  yellow = (text: string): string => this.style('yellow', text);
  blue = (text: string): string => this.style('blue', text);
  magenta = (text: string): string => this.style('magenta', text);
  cyan = (text: string): string => this.style('cyan', text);
  grey = (text: string): string => this.style('grey', text);
}
