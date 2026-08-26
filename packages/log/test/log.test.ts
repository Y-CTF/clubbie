import { describe, expect, test } from 'bun:test';
import { Level, Logger, Sink } from '../src/index.ts';

/** A sink that keeps the lines instead of writing them, so a test reads what a collector would. */
function lines(): { out: (line: string) => void; written: string[] } {
  const written: string[] = [];
  return { out: (line) => written.push(line), written };
}

describe('levels', () => {
  test('a typo falls back rather than throwing: a bad variable must not stop a boot', () => {
    expect(Level.parse('LOUD')).toBe(Level.DEFAULT);
    expect(Level.parse(undefined)).toBe(Level.DEFAULT);
    expect(Level.parse('warn')).toBe('warn');
    expect(Level.parse('WARN')).toBe('warn');
  });

  test('the order is what a threshold compares, in both directions', () => {
    expect(Level.at('error', 'info')).toBe(true);
    expect(Level.at('debug', 'info')).toBe(false);
    expect(Level.at('info', 'info')).toBe(true);
  });
});

describe('a logger', () => {
  test('keeps what is at its threshold and drops what is under it', () => {
    const sink = new Sink.Memory();
    const log = Logger.create('clubbie', sink, 'warn');

    log.debug('quiet');
    log.error('loud');

    expect(sink.records.map((record) => record.message)).toEqual(['loud']);
  });

  test("a child carries its parent's scope and fields down every line below it", () => {
    const sink = new Sink.Memory();
    const log = Logger.create('clubbie', sink, 'trace').child('api', { requestId: 'abc' });

    log.info('answered', { status: 200 });

    expect(sink.records[0]?.scope).toBe(`clubbie${Logger.SEP}api`);
    expect(sink.records[0]?.fields).toEqual({ requestId: 'abc', status: 200 });
  });
});

describe('the json sink', () => {
  test('resolves the markup out, so a collector never reads a delimiter', () => {
    const { out, written } = lines();
    new Sink.Json(out).write({
      at: new Date('2026-03-01T12:00:00Z'),
      level: 'info',
      scope: 'clubbie',
      message: 'ran `migrate` and it was *fine*',
      fields: {},
    });

    expect(JSON.parse(written[0] ?? '{}').message).toBe('ran migrate and it was fine');
  });

  /** A field is a caller's word; the envelope is the collector's. The envelope wins. */
  test('a field cannot overwrite the envelope it travels in', () => {
    const { out, written } = lines();
    new Sink.Json(out).write({
      at: new Date('2026-03-01T12:00:00Z'),
      level: 'error',
      scope: 'clubbie',
      message: 'the real message',
      fields: { level: 'trace', message: 'the forged one', kept: 1 },
    });

    const record = JSON.parse(written[0] ?? '{}');
    expect(record.level).toBe('error');
    expect(record.message).toBe('the real message');
    expect(record.kept).toBe(1);
  });
});
