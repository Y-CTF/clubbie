import type { Style } from '@clubbie/term';
import { type Diag, type Label, Severity } from './diag.ts';
import type { Source } from './source.ts';

/**
 * A rendered diagnostic, as a structure rather than as a string being spliced together.
 *
 * A piece says what it *is* (a gutter, a caret, a label, a snippet of the source), never what it
 * looks like. The renderer decides that once, so the same report can be drawn in colour, drawn
 * plain, or measured, and a new destination is a new walk over this structure rather than a
 * second copy of the layout.
 */
export const Piece = {
  /** Literal text, styled by role. Nothing in it is parsed. */
  plain: (text: string, style?: Style): Piece => ({ kind: 'plain', text, ...(style && { style }) }),
  /** Text written in markup: `` `code` `` and `*bold*` are spans the renderer resolves. */
  markup: (text: string, style?: Style): Piece => ({ kind: 'markup', text, ...(style && { style }) }),
} as const;

export type Piece =
  | { readonly kind: 'plain'; readonly text: string; readonly style?: Style }
  | { readonly kind: 'markup'; readonly text: string; readonly style?: Style };

export interface Line {
  readonly pieces: readonly Piece[];
}

/** What the frame around a snippet is drawn with. */
export const Glyph = {
  open: ',-[',
  close: '`-',
  bar: '|',
  dots: ':',
  caret: '^',
  space: ' ',
} as const;

export const Word = {
  help: 'help',
  note: 'note',
  at: 'at',
} as const;

export namespace Report {
  /** The whole diagnostic as lines of pieces, in the order they are printed. */
  export function lines(diag: Diag): Line[] {
    const out: Line[] = [
      {
        pieces: [
          Piece.plain(`${Severity[diag.severity].label}[${diag.code}]`, Severity[diag.severity].style),
          Piece.plain(': '),
          Piece.markup(diag.message),
        ],
      },
    ];

    if (diag.source && diag.labels.length > 0) out.push(...snippet(diag, diag.source));
    else for (const label of diag.labels) out.push(loose(label));

    for (const note of diag.notes) {
      out.push({
        pieces: [Piece.plain('  '), Piece.plain(Word.note, 'blue'), Piece.plain(': '), Piece.markup(note)],
      });
    }

    if (diag.helpText) {
      out.push({
        pieces: [
          Piece.plain('  '),
          Piece.plain(Word.help, 'green'),
          Piece.plain(': '),
          Piece.markup(diag.helpText),
        ],
      });
    }

    return out;
  }

  /** A label with no source to point into still says its piece, one indented line. */
  function loose(label: Label): Line {
    return {
      pieces: [Piece.plain('  '), Piece.plain(Word.at, 'grey'), Piece.plain(' '), Piece.markup(label.text)],
    };
  }

  /**
   * The framed snippet. Labels are grouped by line so a line is printed once however many spans
   * land on it, and the frame's position is the primary label's, which is what the reader is
   * being sent to.
   */
  function snippet(diag: Diag, source: Source): Line[] {
    const byLine = new Map<number, Label[]>();
    for (const label of diag.labels) {
      const line = source.locate(label.span.start).line;
      byLine.set(line, [...(byLine.get(line) ?? []), label]);
    }

    const anchor = diag.primary ? source.locate(diag.primary.span.start) : { line: 1, column: 1 };
    const width = String(Math.max(...byLine.keys())).length;
    const pad = (value: string) => Piece.plain(value.padStart(width), 'grey');
    const style = Severity[diag.severity].style;

    const out: Line[] = [
      {
        pieces: [
          Piece.plain(Glyph.space.repeat(width + 1)),
          Piece.plain(Glyph.open, 'grey'),
          Piece.plain(`${source.name}:${anchor.line}:${anchor.column}]`, 'grey'),
        ],
      },
    ];

    for (const line of [...byLine.keys()].sort((a, b) => a - b)) {
      out.push({
        pieces: [pad(String(line)), Piece.plain(` ${Glyph.bar} `, 'grey'), Piece.plain(source.line(line))],
      });

      for (const label of byLine.get(line) ?? []) {
        out.push({
          pieces: [
            pad(''),
            Piece.plain(` ${Glyph.dots} `, 'grey'),
            Piece.plain(carets(source, line, label), style),
            Piece.plain(' '),
            Piece.markup(label.text, style),
          ],
        });
      }
    }

    out.push({
      pieces: [Piece.plain(Glyph.space.repeat(width + 1)), Piece.plain(Glyph.close, 'grey')],
    });
    return out;
  }

  /** Carets under one label, clipped to its line so a multi-line span underlines its first. */
  function carets(source: Source, line: number, label: Label): string {
    const start = source.start(line);
    const text = source.line(line);
    const from = Math.max(0, label.span.start - start);
    const to = Math.min(text.length, Math.max(from + 1, label.span.end - start));
    return Glyph.space.repeat(from) + Glyph.caret.repeat(to - from);
  }
}
