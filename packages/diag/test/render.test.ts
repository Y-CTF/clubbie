import { describe, expect, test } from 'bun:test';
import { Ansi, Paint } from '@clubbie/term';
import { Code, Diag, Render, Source } from '../src/index.ts';

const Codes = Code.group('test', ['range', 'missing']);
const ENV = 'DATABASE_URL=sqlite:club.db\nBASE_URL=not a url\nPORT=99999';

describe('Diag', () => {
  test('a label under a line puts carets beneath the value', () => {
    const diag = Diag.error(Codes.range, 'this is not an absolute url')
      .over('environment', ENV)
      .at('BASE_URL=not a url', 'this is not an absolute url')
      .help('write an origin, such as `https://clubbie.example.org`');

    const text = Render.text(diag, Paint.plain);
    const lines = text.split('\n');

    expect(lines[0]).toBe('error[test.range]: this is not an absolute url');
    expect(text).toContain('environment:2:1');
    expect(text).toContain('BASE_URL=not a url');
    expect(lines.some((line) => line.includes('^^^^'))).toBe(true);
    expect(text).toContain('help: write an origin');
  });

  test('a diagnostic with no source degrades to plain lines', () => {
    const diag = Diag.error(Codes.missing, 'no such member').note('nobody has signed in yet');
    expect(Render.text(diag, Paint.plain)).toBe(
      'error[test.missing]: no such member\n  note: nobody has signed in yet',
    );
  });

  test('rendering in colour changes only the styling', () => {
    const diag = Diag.error(Codes.missing, 'no such member').help('sign in at `/`');
    const colour = Render.text(diag, Paint.detect({ FORCE_COLOR: '1' }));
    expect(colour).not.toBe(Render.text(diag, Paint.plain));
    expect(Ansi.strip(colour)).toBe(Render.text(diag, Paint.plain).replaceAll('`', ''));
  });

  test('anything thrown becomes a diagnostic, and a diagnostic passes through', () => {
    const original = Diag.error(Codes.range, 'kept');
    expect(Diag.of(original)).toBe(original);
    expect(Diag.of(new Error('lost')).message).toBe('lost');
    expect(String(Diag.of(new Error('lost')).code)).toBe('internal.unknown');
  });

  test('toJSON carries the code, the labels and their positions', () => {
    const json = Diag.error(Codes.range, 'bad').over('environment', ENV).at('PORT=99999', 'too big').toJSON();

    expect(String(json.code)).toBe('test.range');
    expect(json.labels[0]?.at).toEqual({ line: 3, column: 1 });
  });
});

describe('Source', () => {
  test('locate is one-based and clamps an out-of-range offset', () => {
    const source = new Source('x', 'ab\ncd');
    expect(source.locate(0)).toEqual({ line: 1, column: 1 });
    expect(source.locate(3)).toEqual({ line: 2, column: 1 });
    expect(source.locate(999)).toEqual({ line: 2, column: 3 });
  });

  test('a line comes back without its newline', () => {
    expect(new Source('x', 'ab\ncd').line(1)).toBe('ab');
  });
});
