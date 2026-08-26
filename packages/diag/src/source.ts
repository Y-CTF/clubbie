/** A byte offset range into a `Source`, half-open: `[start, end)`. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Where {
  /** One-based, because that is what an editor and a stack trace both say. */
  readonly line: number;
  readonly column: number;
}

/**
 * The text a diagnostic points into, plus the line index that turns an offset into a position.
 * The index is built once per source, so underlining twenty labels costs one scan, not twenty.
 *
 * What is pointed into is untrusted: the environment as it was read, a connection string, a body
 * a caller sent. It is tamed on the way in rather than on the way out, because `Report` emits a
 * line as plain text and a `Render` writes it as it stands. One character for one character, so
 * every offset a caller already holds still lands under what it meant.
 */
export class Source {
  /** What a control character is shown as. A dot, because a caret has to point at something. */
  static readonly DOT = '\u00b7';

  /** Where each line starts, in offsets. */
  private readonly starts: number[];
  readonly text: string;

  constructor(
    readonly name: string,
    text: string,
  ) {
    this.text = Source.tame(text);
    this.starts = [0];
    for (let i = 0; i < this.text.length; i++) {
      if (this.text[i] === '\n') this.starts.push(i + 1);
    }
  }

  /**
   * Every control character but the newline replaced, one for one. A tab would put the caret in
   * the wrong column, and an escape sequence would reach the terminal and restyle the rest of the
   * report, which is exactly what `Markup.text` refuses to let a value do.
   */
  private static tame(text: string): string {
    let out = '';
    for (const char of text) {
      const code = char.codePointAt(0) ?? 0;
      const control = code < 0x20 || (code >= 0x7f && code <= 0x9f);
      out += char === '\n' || !control ? char : Source.DOT.repeat(char.length);
    }
    return out;
  }

  get lines(): number {
    return this.starts.length;
  }

  /** The position of an offset, clamped into the text so a stale span cannot throw. */
  locate(offset: number): Where {
    const at = Math.max(0, Math.min(offset, this.text.length));
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((this.starts[middle] ?? 0) <= at) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: at - (this.starts[low] ?? 0) + 1 };
  }

  /** One line's text, without its newline. `line` is one-based. */
  line(line: number): string {
    const start = this.starts[line - 1];
    if (start === undefined) return '';
    const end = this.starts[line] ?? this.text.length + 1;
    return this.text.slice(start, Math.max(start, end - 1)).replace(/\r$/, '');
  }

  /** The offset a line starts at, which is what turns a position back into a caret column. */
  start(line: number): number {
    return this.starts[line - 1] ?? 0;
  }
}
