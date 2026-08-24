import { Grid } from './grid.ts';
import { Moment } from './moment.ts';

/** One event as a block in a day's column: where it starts, how tall, and who it shares with. */
export interface Block {
  readonly moment: Moment;
  /** Fractions of the day, so a column can be any height the stylesheet likes. */
  readonly top: number;
  readonly height: number;
  /** Which of the columns this cluster was split into it holds, and how many there are. */
  readonly column: number;
  readonly columns: number;
}

/** One event as a bar across a row of days: where it enters the row and where it leaves. */
export interface Bar {
  readonly moment: Moment;
  /** The index of the first day of the row it covers, and how many days it covers there. */
  readonly start: number;
  readonly span: number;
  /** Which stripe of the row it sits on, so two overlapping bars are not drawn on each other. */
  readonly lane: number;
  /** Whether it really begins and ends here, or was cut off by the edge of the row. */
  readonly opens: boolean;
  readonly closes: boolean;
}

/** A block being placed, before it is told which column it holds. */
interface Box {
  readonly moment: Moment;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Where the events of a day go once there is more than one of them.
 *
 * Two rules, and both are what a calendar is judged on. Anything overlapping in time is split into
 * columns, so a member can see that two things clash rather than one hiding the other. Anything
 * crossing a midnight is a bar across the days it covers rather than a block in each of them,
 * because a weekend away is one thing and drawing it as two is a lie about the Saturday night.
 */
export namespace Layout {
  /**
   * The shortest a block may be drawn, as a fraction of a day: about twenty minutes. A quarter of
   * an hour is four pixels of a day-tall column, which is a line nobody can read or tap.
   */
  export const MIN = 1 / 72;

  /** The blocks of one day, in the order they should be drawn. */
  export function place(moments: readonly Moment[], day: Date): Block[] {
    const boxes: Box[] = moments
      .filter((moment) => !moment.spanning && moment.covers(day))
      .sort(Moment.order)
      .map((moment) => {
        const top = Grid.fraction(moment.startsAt, day);
        const bottom = Math.max(Grid.fraction(moment.endsAt, day), top + MIN);
        return { moment, top, bottom };
      });

    const out: Block[] = [];
    /** The cluster being built: one column per lane of overlap, each holding what it has taken. */
    let columns: Box[][] = [];

    for (const box of boxes) {
      /** Nothing in the cluster is still open at this point, so it is finished and drawn. */
      if (columns.length > 0 && columns.every((column) => ends(column) <= box.top)) {
        out.push(...spread(columns));
        columns = [];
      }

      const free = columns.find((column) => ends(column) <= box.top);
      if (free) free.push(box);
      else columns.push([box]);
    }
    out.push(...spread(columns));
    return out;
  }

  /** When the last box of a column finishes, which is what decides whether another fits under it. */
  function ends(column: readonly Box[]): number {
    return column[column.length - 1]?.bottom ?? 0;
  }

  /** A finished cluster: every box in it knows how many ways the width was split. */
  function spread(columns: readonly (readonly Box[])[]): Block[] {
    return columns.flatMap((column, index) =>
      column.map((box) => ({
        moment: box.moment,
        top: box.top,
        height: box.bottom - box.top,
        column: index,
        columns: columns.length,
      })),
    );
  }

  /**
   * The bars of one row of days. Longest first, then earliest, so the thing crossing the whole week
   * takes the top stripe and the two-day trip sits under it rather than pushing it around.
   */
  export function bars(moments: readonly Moment[], days: readonly Date[]): Bar[] {
    const first = days[0];
    const last = days[days.length - 1];
    if (!first || !last) return [];

    const spanning = moments
      .filter((moment) => moment.spanning && days.some((day) => moment.covers(day)))
      .sort((a, b) => width(b) - width(a) || Moment.order(a, b));

    /** Which days of the row each stripe has already spent, so a bar takes the first one free. */
    const lanes: boolean[][] = [];
    const out: Bar[] = [];

    for (const moment of spanning) {
      const start = Math.max(
        0,
        days.findIndex((day) => Grid.same(day, moment.first)),
      );
      const end = days.findIndex((day) => Grid.same(day, moment.last));
      const span = (end === -1 ? days.length - 1 : end) - start + 1;

      const lane = free(lanes, start, span);
      const taken = lanes[lane] ?? [];
      for (let index = start; index < start + span; index++) taken[index] = true;
      lanes[lane] = taken;

      out.push({
        moment,
        start,
        span,
        lane,
        opens: moment.first >= first,
        closes: moment.last <= last,
      });
    }
    return out;
  }

  /** How many days a moment covers, which is what decides which bar gets the top stripe. */
  function width(moment: Moment): number {
    return moment.last.getTime() - moment.first.getTime();
  }

  /** The first stripe with room for a bar of this width, adding one when every stripe is busy. */
  function free(lanes: readonly (readonly boolean[])[], start: number, span: number): number {
    const fits = (lane: readonly boolean[]): boolean => {
      for (let index = start; index < start + span; index++) if (lane[index]) return false;
      return true;
    };

    const found = lanes.findIndex(fits);
    return found === -1 ? lanes.length : found;
  }

  /** How many stripes a row of bars needs, which is what the day cells under them make room for. */
  export function lanes(bars: readonly Bar[]): number {
    return bars.reduce((most, bar) => Math.max(most, bar.lane + 1), 0);
  }
}
