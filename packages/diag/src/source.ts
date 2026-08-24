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
 */
export class Source {
  /** Where each line starts, in offsets. */
  private readonly starts: number[];

  constructor(
    readonly name: string,
    readonly text: string,
  ) {
    this.starts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') this.starts.push(i + 1);
    }
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
