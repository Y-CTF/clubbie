import { Render } from '@clubbie/diag';
import { Markup, Paint, Rows, When } from '@clubbie/term';
import { Level } from './level.ts';
import type { Record } from './record.ts';

export interface Sink {
  write(record: Record): void;
}

/**
 * Where records end up. Three of them: a console for a person, JSON lines for a log collector,
 * and memory for tests, which assert against records rather than against formatted strings.
 */
export namespace Sink {
  const TINT: globalThis.Record<Level, (paint: Paint, text: string) => string> = {
    trace: (paint, text) => paint.grey(text),
    debug: (paint, text) => paint.grey(text),
    info: (paint, text) => paint.blue(text),
    warn: (paint, text) => paint.yellow(text),
    error: (paint, text) => paint.red(text),
  };

  /**
   * A person's sink: one aligned line per record, with any diagnostic drawn under it. A message
   * is markup, so `` `code` `` and `*bold*` in it are styled here and nowhere else.
   */
  export class Console implements Sink {
    constructor(
      private readonly paint: Paint = Paint.detect(),
      private readonly out: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
    ) {}

    write(record: Record): void {
      const time = When.clock(record.at);
      const level = TINT[record.level](this.paint, record.level.padEnd(Level.WIDTH));
      const scope = this.paint.grey(record.scope);
      const took = record.took === undefined ? '' : this.paint.grey(` ${Math.round(record.took)}ms`);

      const message = Markup.render(record.message, this.paint);
      this.out(`${this.paint.grey(time)} ${level} ${scope} ${message}${took}${this.fields(record)}`);
      if (record.diag) this.out(Render.text(record.diag, this.paint));
    }

    private fields(record: Record): string {
      const entries = Object.entries(record.fields);
      if (entries.length === 0) return '';
      return ` ${entries.map(([key, value]) => this.paint.grey(`${key}=`) + format(value)).join(' ')}`;
    }
  }

  /**
   * One JSON object per line, which is what a collector reads. Markers are resolved out of the
   * message: a machine reading the log should not have to know what a backtick means here.
   *
   * The fields go in first so the envelope always wins. Spread last, a field called `level` or
   * `message` replaced the one a collector filters on, and the two sinks then disagreed about the
   * same record.
   */
  export class Json implements Sink {
    constructor(private readonly out: (line: string) => void = (line) => process.stdout.write(`${line}\n`)) {}

    write(record: Record): void {
      this.out(
        JSON.stringify({
          ...record.fields,
          at: record.at.toISOString(),
          level: record.level,
          scope: record.scope,
          message: Markup.bare(record.message),
          ...(record.took !== undefined && { took: record.took }),
          ...(record.diag && { diag: record.diag.toJSON() }),
        }),
      );
    }
  }

  /** Keeps every record, so a test asserts on structure instead of parsing output. */
  export class Memory implements Sink {
    readonly records: Record[] = [];

    write(record: Record): void {
      this.records.push(record);
    }

    at(level: Level): Record[] {
      return this.records.filter((record) => record.level === level);
    }

    /** The rendered table a failing test prints, so the whole log is readable in one place. */
    render(): string {
      const rows = new Rows(['left', 'left', 'left']);
      for (const record of this.records) rows.push(record.level, record.scope, record.message);
      return rows.render();
    }

    clear(): void {
      this.records.length = 0;
    }
  }

  function format(value: unknown): string {
    if (typeof value === 'string') return value.includes(' ') ? JSON.stringify(value) : value;
    if (value instanceof Date) return value.toISOString();
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
