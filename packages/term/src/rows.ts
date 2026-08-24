import { Ansi } from './ansi.ts';

export type Align = 'left' | 'right';

/**
 * Column alignment, measured on visible width so a coloured cell lines up with a plain one.
 * Anything printing more than one column builds it here rather than padding at the call site.
 */
export class Rows {
  static readonly GAP = '  ';

  private readonly rows: string[][] = [];

  constructor(private readonly align: Align[] = []) {}

  push(...cells: string[]): this {
    this.rows.push(cells);
    return this;
  }

  get empty(): boolean {
    return this.rows.length === 0;
  }

  render(gap: string = Rows.GAP): string {
    const widths = this.widths();
    return this.rows
      .map((row) =>
        row
          .map((cell, column) => this.pad(cell, widths[column] ?? 0, column))
          .join(gap)
          .trimEnd(),
      )
      .join('\n');
  }

  private widths(): number[] {
    const widths: number[] = [];
    for (const row of this.rows) {
      row.forEach((cell, column) => {
        widths[column] = Math.max(widths[column] ?? 0, Ansi.width(cell));
      });
    }
    return widths;
  }

  private pad(cell: string, width: number, column: number): string {
    const padding = ' '.repeat(Math.max(0, width - Ansi.width(cell)));
    return this.align[column] === 'right' ? padding + cell : cell + padding;
  }
}
