declare const brand: unique symbol;

/**
 * A diagnostic's stable identifier, `namespace.name`. It is what a client switches on and what a
 * reader searches the codebase for, so it may never be written as a literal at a throw site: a
 * package declares its codes once with `Code.group`, and a bare string does not typecheck.
 */
export type Code = string & { readonly [brand]: 'code' };

export namespace Code {
  export const SEP = '.';

  export function of(namespace: string, name: string): Code {
    return `${namespace}${SEP}${name}` as Code;
  }

  /**
   * Declares every code a package can raise, in one place:
   *
   * ```ts
   * export const Rsvp = Code.group('rsvp', ['closed', 'full', 'state']);
   * throw Fail.because(Answer.Closed, Rsvp.closed, ...);
   * ```
   */
  export function group<const Names extends readonly string[]>(
    namespace: string,
    names: Names,
  ): { readonly [Name in Names[number]]: Code } {
    const codes = {} as { [Name in Names[number]]: Code };
    for (const name of names) codes[name as Names[number]] = of(namespace, name);
    return codes;
  }

  /** A code read back from the wire or a log, where it arrives as a plain string. */
  export function parse(raw: string): Code {
    return raw as Code;
  }

  export function namespace(code: Code): string {
    return code.split(SEP)[0] ?? code;
  }
}
