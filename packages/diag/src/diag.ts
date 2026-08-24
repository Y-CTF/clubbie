import { markup } from '@clubbie/term';
import { Code } from './code.ts';
import { Source, type Span } from './source.ts';

export const Severity = {
  error: { label: 'error', style: 'red' },
  warning: { label: 'warning', style: 'yellow' },
  advice: { label: 'advice', style: 'cyan' },
} as const;

export type Severity = keyof typeof Severity;

/** A span with something to say about it. The primary one is what the message is really about. */
export interface Label {
  readonly span: Span;
  readonly text: string;
  readonly primary: boolean;
}

/** Codes `diag` itself raises, for anything that reaches it without one of its own. */
export const Internal = Code.group('internal', ['unknown', 'invalid']);

/**
 * A diagnostic, modelled on Rust's miette: a stable code, one sentence, the spans of the input it
 * is about, and what to do next.
 *
 * Everything that reads input a person wrote (config, a request body, a chat command) reports
 * failures this way rather than throwing a bare `Error`, because a message alone forces the
 * reader to go and find what it meant. Internal invariants may still throw: nobody outside the
 * codebase can act on those.
 *
 * Every message is markup (`` `code` ``, `*bold*`) and every value in one is interpolated through
 * the `markup` template, so a title a member typed can never carry styling of its own.
 */
export class Diag extends Error {
  readonly labels: Label[] = [];
  readonly notes: string[] = [];
  helpText: string | null = null;
  source: Source | null = null;

  private constructor(
    readonly code: Code,
    message: string,
    readonly severity: Severity = 'error',
  ) {
    super(message);
    this.name = 'Diag';
  }

  static error(code: Code, message: string): Diag {
    return new Diag(code, message, 'error');
  }

  static warning(code: Code, message: string): Diag {
    return new Diag(code, message, 'warning');
  }

  static advice(code: Code, message: string): Diag {
    return new Diag(code, message, 'advice');
  }

  /** Anything thrown, as a diagnostic. A `Diag` passes through so a rethrow keeps its labels. */
  static of(error: unknown, code: Code = Internal.unknown): Diag {
    if (error instanceof Diag) return error;

    const diag = Diag.error(code, error instanceof Error ? markup`${error.message}` : markup`${error}`);
    if (error instanceof Error && error.stack) diag.stack = error.stack;
    if (error instanceof Error && error.cause) diag.note(markup`caused by: ${error.cause}`);
    return diag;
  }

  /** The text the labels point into. A label without a source degrades to a plain line. */
  over(name: string, text: string): this {
    this.source = new Source(name, text);
    return this;
  }

  label(span: Span, text: string, primary = true): this {
    this.labels.push({ span, text, primary });
    return this;
  }

  /** Points at the first occurrence of a substring, for input that has no offsets of its own. */
  at(needle: string, text: string, primary = true): this {
    const start = this.source?.text.indexOf(needle) ?? -1;
    if (start >= 0) this.label({ start, end: start + needle.length }, text, primary);
    else this.note(text);
    return this;
  }

  help(text: string): this {
    this.helpText = text;
    return this;
  }

  note(text: string): this {
    this.notes.push(text);
    return this;
  }

  get primary(): Label | null {
    return this.labels.find((label) => label.primary) ?? this.labels[0] ?? null;
  }

  /** The machine-readable form, which is what a structured log and an HTTP body carry. */
  toJSON() {
    return {
      code: this.code,
      severity: this.severity,
      message: this.message,
      ...(this.source && { source: this.source.name }),
      labels: this.labels.map((label) => ({
        ...label.span,
        text: label.text,
        primary: label.primary,
        ...(this.source && { at: this.source.locate(label.span.start) }),
      })),
      ...(this.helpText && { help: this.helpText }),
      ...(this.notes.length > 0 && { notes: this.notes }),
    };
  }
}
