import { Ansi } from './ansi.ts';
import type { Paint } from './paint.ts';
import type { Style } from './style.ts';

/**
 * The inline markup every message is written in: `` `code` `` for a path, a key, a command or a
 * url, and `*bold*` for emphasis. `\` escapes a delimiter and itself.
 *
 * A message is written once and rendered per destination: styled on a terminal, tagged where a
 * destination reads html, delimiters left in place everywhere else. No module builds an escape
 * sequence of its own, so a diagnostic reads the same in a log line, an HTTP body and a chat reply.
 *
 * Each kind names its terminal style and the tag that says the same thing to anything that renders
 * markup instead of colour. Both come out of this one table, so a third kind is one line here.
 */
export const Kind = {
  code: { delimiter: '`', style: 'cyan', tag: 'code' },
  bold: { delimiter: '*', style: 'bold', tag: 'b' },
} as const satisfies Record<string, { delimiter: string; style: Style; tag: string }>;

export type Kind = keyof typeof Kind;

export namespace Markup {
  export const ESCAPE = '\\';
  export const KINDS = Object.keys(Kind) as Kind[];
  export const DELIMITERS = KINDS.map((kind) => Kind[kind].delimiter);

  export function of(char: string): Kind | null {
    return KINDS.find((kind) => Kind[kind].delimiter === char) ?? null;
  }

  export function special(char: string): boolean {
    return char === ESCAPE || of(char) !== null;
  }

  /**
   * A value interpolated as literal text: every delimiter escaped, every control character
   * dropped. A member's own event title is untrusted input, and one holding `[31m` would
   * otherwise close the span it sits in and restyle the rest of the terminal.
   */
  export function text(value: unknown): string {
    let out = '';
    for (const char of String(value)) {
      if (isControl(char)) continue;
      if (special(char)) out += ESCAPE;
      out += char;
    }
    return out;
  }

  /** `text`, inside a code span: the one way a message names a path, a key or a command. */
  export function code(value: unknown): string {
    const delimiter = Kind.code.delimiter;
    return `${delimiter}${text(value)}${delimiter}`;
  }

  /**
   * Renders marked-up text. With a painter that colours, a span is styled and its delimiters are
   * consumed; without one, the delimiters are written back out.
   *
   * The parser is total: an unpaired delimiter, an empty span, or one that would run past a line
   * break renders as the literal character. Nothing a caller can write makes this throw.
   */
  export function render(source: string, paint: Paint): string {
    let out = '';
    let index = 0;

    while (index < source.length) {
      const char = source[index] as string;

      if (char === ESCAPE) {
        out += source[index + 1] ?? ESCAPE;
        index += 2;
        continue;
      }

      const kind = of(char);
      if (!kind) {
        out += char;
        index += 1;
        continue;
      }

      const body = span(source, index + 1, char);
      if (body === null) {
        out += char;
        index += 1;
        continue;
      }

      out += style(kind, unescaped(body), paint);
      index += 1 + body.length + 1;
    }

    return out;
  }

  /** The same text with the markers resolved but never styled, for anywhere ANSI cannot go. */
  export function strip(source: string): string {
    return Ansi.strip(render(source, PLAIN));
  }

  /** The three characters that mean something to an html parser and nothing to this one. */
  export const ENTITIES: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
  };

  /**
   * The same text as html: `<b>` and `<code>` where a terminal would have colour.
   *
   * It exists because a chat is neither a terminal nor a plain text file. Stripping the markup was
   * honest and made every notice arrive as flat text with the emphasis simply gone; writing the
   * delimiters out would have arrived as literal asterisks. This is the third rendering the
   * vocabulary was always for.
   *
   * The entities are escaped *before* the markup is parsed, which is safe because none of the
   * three is a delimiter and none is produced by one: a member whose event is called `<b>` gets
   * their title back, not a span they opened in somebody else's chat.
   */
  export function html(source: string): string {
    return render(entities(source), TAGGED);
  }

  function entities(text: string): string {
    return text.replaceAll(/[&<>]/g, (char) => ENTITIES[char] ?? char);
  }

  /** The quote an attribute is delimited by, which the three body entities do not cover. */
  export const QUOTE: Readonly<Record<string, string>> = { '"': '&quot;', "'": '&#39;' };

  /**
   * A value inside an html attribute: a url in an `href`, a colour in a `style`. It is a separate
   * function from `html` because the two escape different characters, and a url carrying a quote
   * would otherwise close the attribute it sits in and write markup of its own into an email.
   */
  export function attr(value: unknown): string {
    let out = '';
    for (const char of String(value)) {
      if (isControl(char)) continue;
      out += QUOTE[char] ?? ENTITIES[char] ?? char;
    }
    return out;
  }

  /**
   * The body of the span opening at `from`, or null when it does not close on this line, is
   * empty, or is padded with whitespace (`a * b` is arithmetic, not emphasis).
   */
  function span(source: string, from: number, delimiter: string): string | null {
    for (let index = from; index < source.length; index++) {
      const char = source[index];
      if (char === ESCAPE) {
        index += 1;
        continue;
      }
      if (char === '\n') return null;
      if (char !== delimiter) continue;

      const body = source.slice(from, index);
      return body.length > 0 && body.trim() === body ? body : null;
    }
    return null;
  }

  function style(kind: Kind, body: string, paint: Paint): string {
    if (!paint.enabled) {
      const delimiter = Kind[kind].delimiter;
      return `${delimiter}${body}${delimiter}`;
    }
    return paint.style(Kind[kind].style, body);
  }

  function unescaped(body: string): string {
    let out = '';
    for (let index = 0; index < body.length; index++) {
      if (body[index] === ESCAPE && index + 1 < body.length) index += 1;
      out += body[index];
    }
    return out;
  }

  function isControl(char: string): boolean {
    const code = char.codePointAt(0) ?? 0;
    if (char === '\n' || char === '\t') return false;
    return code < 0x20 || code === 0x7f;
  }

  /** The tag for a span, by the style it would have worn on a terminal. Derived, so it cannot drift. */
  const TAGS: Partial<Record<Style, string>> = Object.fromEntries(
    KINDS.map((kind) => [Kind[kind].style, Kind[kind].tag]),
  );

  /** A painter that writes tags instead of escape sequences, so one parser serves `html` too. */
  const TAGGED = {
    enabled: true,
    style: (style: Style, body: string) => {
      const tag = TAGS[style];
      return tag ? `<${tag}>${body}</${tag}>` : body;
    },
  } as Pick<Paint, 'enabled' | 'style'> as Paint;

  /** A painter that never styles, used by `strip` so one parser serves both renderings. */
  const PLAIN = { enabled: false, style: (_: Style, body: string) => body } as Pick<
    Paint,
    'enabled' | 'style'
  > as Paint;
}

/**
 * The way a message with values in it is written:
 *
 * ```ts
 * throw Diag.error(Code.SeasonRange, markup`${season.name} ends before it starts`);
 * ```
 *
 * Every interpolation goes through `Markup.text`, so a value can never open a span, close one, or
 * carry an escape sequence. Markup a caller means is written in the literal part of the template,
 * which is the only part not escaped.
 */
export function markup(parts: TemplateStringsArray, ...values: unknown[]): string {
  return parts.reduce((out, part, index) => {
    const value = index < values.length ? Markup.text(values[index]) : '';
    return out + part + value;
  }, '');
}
