import { describe, expect, test } from 'bun:test';
import { Ansi, Markup, markup, Paint } from '../src/index.ts';

const COLOUR = Paint.detect({ FORCE_COLOR: '1' });
const ESC = '\u001b';

describe('Markup', () => {
  test('a code span is styled and its delimiters are consumed', () => {
    const rendered = Markup.render('run `clubbie serve`', COLOUR);
    expect(Ansi.strip(rendered)).toBe('run clubbie serve');
    expect(rendered).not.toBe('run clubbie serve');
  });

  test('without colour the delimiters are written back out', () => {
    expect(Markup.render('run `clubbie`', Paint.plain)).toBe('run `clubbie`');
  });

  test('the parser is total: an unpaired or empty span is literal', () => {
    for (const source of ['a ` b', 'a * b', '*', '``', '` `']) {
      expect(Markup.strip(source)).toBe(source);
    }
  });

  test('a span never runs past a line break', () => {
    expect(Markup.strip('`open\nclosed`')).toBe('`open\nclosed`');
  });

  test('an escaped delimiter is literal and loses its backslash', () => {
    expect(Markup.strip('a \\`b\\` c')).toBe('a `b` c');
  });

  test('interpolated values cannot open a span', () => {
    const evil = '`code` and *bold*';
    expect(Markup.strip(markup`title: ${evil}`)).toBe(`title: ${evil}`);
    expect(Ansi.strip(Markup.render(markup`title: ${evil}`, COLOUR))).toBe(`title: ${evil}`);
  });

  test('interpolated values cannot carry an escape sequence', () => {
    const rendered = Markup.render(markup`name: ${`${ESC}[31mred`}`, COLOUR);
    expect(rendered).toBe('name: [31mred');
  });

  test('styling closes narrowly, so an enclosing style survives', () => {
    const inner = COLOUR.style('cyan', 'x');
    expect(inner).not.toContain(Ansi.sgr(0));
    expect(inner.endsWith(Ansi.off('cyan'))).toBe(true);
  });

  test('a plain painter is what strip renders through', () => {
    expect(Markup.strip(markup`*${'Ada'}* is going`)).toBe('*Ada* is going');
  });
});

describe('Markup as html', () => {
  test('each kind becomes its own tag', () => {
    expect(Markup.html('run `clubbie serve` *now*')).toBe('run <code>clubbie serve</code> <b>now</b>');
  });

  test('the parser is as total as it is anywhere else', () => {
    for (const source of ['a ` b', 'a * b', '*', '``', '` `']) {
      expect(Markup.html(source)).toBe(source);
    }
  });

  /** The whole point of escaping the entities first: a title cannot open a tag of its own. */
  test('a value carrying html arrives as the text it was typed as', () => {
    const evil = '<b>bold</b> & <a href="x">link</a>';
    expect(Markup.html(markup`title: ${evil}`)).toBe(
      'title: &lt;b&gt;bold&lt;/b&gt; &amp; &lt;a href="x"&gt;link&lt;/a&gt;',
    );
  });

  test('a value cannot open a span either, exactly as on a terminal', () => {
    expect(Markup.html(markup`title: ${'*bold*'}`)).toBe('title: *bold*');
  });
});
