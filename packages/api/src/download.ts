/**
 * What a file the API hands back is called, and how the header says so.
 *
 * It is one module because the rules are the same whatever is inside the file and getting either
 * of them wrong is invisible until somebody downloads a Cyrillic title: a `content-disposition`
 * value has to be Latin-1, so the readable name travels beside the ASCII one rather than instead
 * of it, and a name made entirely of characters the header cannot carry falls back to a word.
 */
export namespace Download {
  /** How long a generated name may be before it is cut. */
  export const LIMIT = 60;

  export const Kind = {
    /** Saved to disk, under the name below. */
    Attachment: 'attachment',
    /** Shown where it is, which is what a calendar client wants of a feed. */
    Inline: 'inline',
  } as const;

  export type Kind = (typeof Kind)[keyof typeof Kind];

  /** A filename from a title somebody typed, as ASCII, with its extension on the end. */
  export function name(stem: string, extension: string, fallback: string): string {
    const safe = stem.replaceAll(/[^A-Za-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');
    return `${safe.slice(0, LIMIT) || fallback}.${extension}`;
  }

  /**
   * What a browser needs to save the answer as a file. Both forms of the name go out: the ASCII
   * one every client understands, and the RFC 5987 one that keeps the accents.
   */
  export function disposition(kind: Kind, filename: string, title: string = filename): string {
    return `${kind}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(title)}`;
  }
}
