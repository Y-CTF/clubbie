import { Download } from './download.ts';

/**
 * CSV, for the committee report nobody escapes. It is a second rendering of the objects `Wire`
 * already describes, so a column is added here and nowhere else.
 *
 * Everything is quoted rather than only what needs it: the rule "quote every field, double every
 * quote" has no edge case, and a spreadsheet reads it identically.
 */
export namespace Csv {
  export const SEP = ',';
  /** CRLF, because that is what RFC 4180 says and what Excel opens without asking questions. */
  export const EOL = '\r\n';
  export const QUOTE = '"';
  export const TYPE = 'text/csv; charset=utf-8';
  /**
   * A field starting with one of these is read as a formula by spreadsheet software, so a member
   * called `=cmd` cannot become one. Prefixing an apostrophe is the fix every exporter uses.
   *
   * The tab and the carriage return are on the list because Excel and LibreOffice skip leading
   * whitespace before deciding, so `\t=cmd` is the same formula with one character in front of
   * it. A member's name is not typed here: it comes from whatever their provider holds.
   */
  export const FORMULA = ['=', '+', '-', '@', '\t', '\r'];
  export const GUARD = "'";
  /** What a title made entirely of characters a header cannot carry falls back to. */
  export const FALLBACK = 'export';
  export const EXTENSION = 'csv';

  export type Cell = string | number | boolean | Date | null | undefined;

  export function of(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
    return [header, ...rows].map(line).join(EOL) + EOL;
  }

  /** How a flag reads in a spreadsheet, since `true` is a word a spreadsheet may reinterpret. */
  export function yes(flag: boolean): string {
    return flag ? 'yes' : 'no';
  }

  /** A filename from a title somebody typed. `Download` owns what a saved file is called. */
  export function filename(stem: string): string {
    return Download.name(stem, EXTENSION, FALLBACK);
  }

  /** What a browser needs to save the answer as a file rather than show it. */
  export function headers(filename: string, title = filename): Record<string, string> {
    return {
      'content-type': TYPE,
      'content-disposition': Download.disposition(Download.Kind.Attachment, filename, title),
    };
  }

  function line(row: readonly Cell[]): string {
    return row.map(field).join(SEP);
  }

  function field(cell: Cell): string {
    const text = cell instanceof Date ? cell.toISOString() : String(cell ?? '');
    const safe = FORMULA.includes(text.slice(0, 1)) ? GUARD + text : text;
    return QUOTE + safe.replaceAll(QUOTE, QUOTE + QUOTE) + QUOTE;
  }
}
