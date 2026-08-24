/**
 * The one place a stored column becomes a domain value. Instants are epoch milliseconds and flags
 * are 0 or 1 (see `schema.ts`), so every repo converts through here and nothing above the store
 * ever sees either representation.
 */
export namespace Row {
  export const TRUE = 1;
  export const FALSE = 0;

  export function at(ms: number): Date {
    return new Date(Number(ms));
  }

  export function atOrNull(ms: number | null): Date | null {
    return ms === null ? null : at(ms);
  }

  export function ms(date: Date): number {
    return date.getTime();
  }

  export function msOrNull(date: Date | null | undefined): number | null {
    return date ? ms(date) : null;
  }

  export function flag(bit: number): boolean {
    return bit === TRUE;
  }

  export function bit(flag: boolean): number {
    return flag ? TRUE : FALSE;
  }
}
