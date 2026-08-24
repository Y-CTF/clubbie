export type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Levels and their order. A logger keeps records whose level is at least its threshold, so the
 * comparison is a number lookup and never a chain of string tests.
 */
export namespace Level {
  export const ORDER: Record<Level, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
  };

  export const ALL: readonly Level[] = ['trace', 'debug', 'info', 'warn', 'error'];
  /** The width a level column aligns to, derived rather than counted by hand. */
  export const WIDTH = Math.max(...ALL.map((level) => level.length));
  export const DEFAULT: Level = 'info';
  /** The variable a deployment turns the volume with. */
  export const ENV = 'LOG_LEVEL';

  export function at(level: Level, threshold: Level): boolean {
    return ORDER[level] >= ORDER[threshold];
  }

  /** An unknown name falls back rather than throwing: a typo must not stop a server booting. */
  export function parse(value: string | undefined, fallback: Level = DEFAULT): Level {
    const name = value?.toLowerCase() as Level | undefined;
    return name && name in ORDER ? name : fallback;
  }
}
