import { Diag } from '@clubbie/diag';
import { Level } from './level.ts';
import type { Fields } from './record.ts';
import { Sink } from './sink.ts';

/**
 * A layered, structured logger. `child` adds a namespace and fields that every record below it
 * carries, so a request's id is attached once and appears on everything the request does.
 *
 * There is one sink per tree, shared by every child: switching a process to JSON is one call at
 * the root, not a decision each component makes.
 */
export class Logger {
  static readonly SEP = '.';

  private constructor(
    readonly scope: string,
    private readonly sink: Sink,
    private threshold: Level,
    private readonly fields: Fields,
  ) {}

  static create(scope = 'clubbie', sink: Sink = new Sink.Console(), level: Level = Level.DEFAULT): Logger {
    return new Logger(scope, sink, level, {});
  }

  /** A logger that keeps everything in memory. What a test asserts against. */
  static memory(scope = 'test'): { log: Logger; sink: Sink.Memory } {
    const sink = new Sink.Memory();
    return { log: new Logger(scope, sink, 'trace', {}), sink };
  }

  child(scope: string, fields: Fields = {}): Logger {
    return new Logger(`${this.scope}${Logger.SEP}${scope}`, this.sink, this.threshold, {
      ...this.fields,
      ...fields,
    });
  }

  /** The same logger with more context, for a scope that has not changed. */
  with(fields: Fields): Logger {
    return new Logger(this.scope, this.sink, this.threshold, { ...this.fields, ...fields });
  }

  get level(): Level {
    return this.threshold;
  }

  set level(level: Level) {
    this.threshold = level;
  }

  trace = (message: string, fields?: Fields): void => this.record('trace', message, fields);
  debug = (message: string, fields?: Fields): void => this.record('debug', message, fields);
  info = (message: string, fields?: Fields): void => this.record('info', message, fields);
  warn = (message: string, fields?: Fields): void => this.record('warn', message, fields);

  /**
   * Errors are always logged as diagnostics: whatever is thrown becomes a `Diag`, so a console
   * sink can draw its labels and a JSON sink keeps its code. A caller never formats one itself.
   */
  error(message: string, error?: unknown, fields?: Fields): void {
    this.record('error', message, fields, error === undefined ? undefined : Diag.of(error));
  }

  /**
   * Times a piece of work and logs its outcome once: `debug` when it succeeds, `error` when it
   * throws. The failure is rethrown, so a span never swallows what it reports.
   */
  async span<T>(name: string, work: (log: Logger) => Promise<T>, fields: Fields = {}): Promise<T> {
    const log = this.with(fields);
    const started = performance.now();
    try {
      const result = await work(log);
      log.record('debug', name, fields, undefined, performance.now() - started);
      return result;
    } catch (error) {
      log.record('error', name, fields, Diag.of(error), performance.now() - started);
      throw error;
    }
  }

  private record(level: Level, message: string, fields?: Fields, diag?: Diag, took?: number): void {
    if (!Level.at(level, this.threshold)) return;
    this.sink.write({
      at: new Date(),
      level,
      scope: this.scope,
      message,
      fields: { ...this.fields, ...fields },
      ...(diag && { diag }),
      ...(took !== undefined && { took }),
    });
  }
}
