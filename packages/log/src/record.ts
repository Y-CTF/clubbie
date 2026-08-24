import type { Diag } from '@clubbie/diag';
import type { Level } from './level.ts';

/** Spelled out rather than `Record<string, unknown>`, which this file shadows with its own type. */
export type Fields = { [key: string]: unknown };

/**
 * One log line, before a sink decides what it looks like. The diagnostic is kept as an object
 * rather than flattened into the message, so a console sink can draw its carets and a JSON sink
 * can keep its structure.
 */
export interface Record {
  readonly at: Date;
  readonly level: Level;
  /** Dotted namespace of the logger that emitted it: `api.events`, `store.migrate`. */
  readonly scope: string;
  readonly message: string;
  readonly fields: Fields;
  readonly diag?: Diag | undefined;
  /** Set on the record that closes a span, in milliseconds. */
  readonly took?: number | undefined;
}
