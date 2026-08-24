<script lang="ts">
import type { Bar } from '../../lib/calendar/layout.ts';
import type { Moment } from '../../lib/calendar/moment.ts';
import Piece from './Piece.svelte';
import { Shape } from './piece.ts';

/** A bar that carries on past the row it is drawn in has no corner on that side. */
const CUT_START = 'border-start-start-radius: 0; border-end-start-radius: 0;';
const CUT_END = 'border-start-end-radius: 0; border-end-end-radius: 0;';

/**
 * The bars of everything that crosses a midnight, laid over a row of days.
 *
 * They are positioned rather than placed in the grid because they belong to the row and not to any
 * one cell: a weekend away is one bar over two columns, and there is no cell that owns it. The
 * offset it starts at is a token rather than a measurement, so nothing here reads the layout back
 * out of the browser.
 */
let {
  bars,
  columns,
  now,
  onopen,
  top = '0px',
}: {
  bars: readonly Bar[];
  /** How many days the row holds, which is what a bar's width is a fraction of. */
  columns: number;
  now: Date;
  onopen: (moment: Moment, anchor: DOMRect) => void;
  /** Where the stripes begin, under whatever the row puts above them. */
  top?: string;
} = $props();
</script>

<div class="pointer-events-none absolute inset-x-0 z-10" style="top: {top}">
  {#each bars as bar (bar.moment.id)}
    <div
      class="pointer-events-auto absolute px-px"
      style="inset-inline-start: {(bar.start / columns) * 100}%; width: {(bar.span / columns) * 100}%;
             top: calc({bar.lane} * var(--band-club)); height: var(--band-club)"
    >
      <!-- A bar cut off by the edge of the row loses that corner, so it reads as continuing. -->
      <Piece
        moment={bar.moment}
        shape={Shape.Bar}
        {now}
        {onopen}
        clock={bar.opens}
        style="{bar.opens ? '' : CUT_START} {bar.closes ? '' : CUT_END}"
      />
    </div>
  {/each}
</div>
