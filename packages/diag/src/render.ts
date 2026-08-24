import { Markup, Paint } from '@clubbie/term';
import type { Diag } from './diag.ts';
import { type Line, type Piece, Report } from './report.ts';

/**
 * A diagnostic as a person reads it:
 *
 * ```text
 * error[season.range]: a season ends after it starts
 *   ,-[environment:2:11]
 * 2 | BASE_URL=not a url
 *   : ^^^^^^^^^ this is not an absolute url
 *   `-
 *   help: write the origin members reach, such as `https://clubbie.example.org`
 * ```
 *
 * The layout is `Report`; this walks it. Styling is applied per piece and markup spans inside a
 * piece are resolved by `Markup`, so nothing here writes an escape sequence or decides a colour.
 */
export namespace Render {
  export const BREAK = '\n';

  export function text(diag: Diag, paint: Paint = Paint.plain): string {
    return Report.lines(diag)
      .map((line) => render(line, paint))
      .join(BREAK);
  }

  /** One line, for a sink that owns its own line breaks. */
  export function render(line: Line, paint: Paint): string {
    return line.pieces.map((piece) => one(piece, paint)).join('');
  }

  /** The plain rendering, markers resolved and nothing styled. What a JSON field carries. */
  export function plain(diag: Diag): string {
    return text(diag, Paint.plain);
  }

  function one(piece: Piece, paint: Paint): string {
    const body = piece.kind === 'markup' ? Markup.render(piece.text, paint) : piece.text;
    return piece.style ? paint.style(piece.style, body) : body;
  }
}
