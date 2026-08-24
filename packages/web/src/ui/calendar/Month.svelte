<script lang="ts">
import { Calendar } from '../../lib/calendar/calendar.svelte.ts';
import { Grid } from '../../lib/calendar/grid.ts';
import { Layout } from '../../lib/calendar/layout.ts';
import type { Moment } from '../../lib/calendar/moment.ts';
import { Format } from '../../lib/format.ts';
import { words } from '../../lib/words/index.svelte.ts';
import Bands from './Bands.svelte';
import Piece from './Piece.svelte';
import { Shape } from './piece.ts';

/**
 * The month: five or six rows of seven days.
 *
 * A cell holds as much as a cell holds. What does not fit is counted rather than cut off silently,
 * and the count opens the day, because "and three more" is only useful if it takes you to them.
 */
let {
  calendar,
  create,
}: {
  calendar: Calendar;
  /** Where an empty stretch of a day leads, for a member who may write one. Null for everyone else. */
  create: ((at: Date) => string) | null;
} = $props();

/** How many chips a cell shows before it starts counting. Below this a cell cannot hold a line. */
const SHOWN = 4;
/** The cell's own padding, which the bars laid over the row have to start below. */
const PAD = '0.25rem';

const t = $derived(words.t);
/**
 * The grid, laid out once per answer rather than once per render.
 *
 * The bars were computed inside the loop, which meant sorting every event in the month six times
 * over on every redraw, and the clock redraws this page every minute.
 */
const weeks = $derived(
  Array.from({ length: calendar.days.length / Grid.WEEK }, (_, row) =>
    calendar.days.slice(row * Grid.WEEK, (row + 1) * Grid.WEEK),
  ),
);

const rows = $derived(
  weeks.map((week) => {
    const bars = Layout.bars(calendar.moments, week);
    return { week, bars, lanes: Layout.lanes(bars) };
  }),
);

/** The chips of one day: everything on it that is not already a bar over it. */
function chips(day: Date): Moment[] {
  return calendar.on(day).filter((moment) => !moment.spanning);
}

/** Which month the grid is about, so the days either side of it can be drawn as the guests they are. */
const shown = $derived(calendar.cursor.getMonth());
</script>

<div class="calendar overflow-hidden rounded-lg border border-line">
  <div class="grid grid-cols-7 border-b border-line bg-sunk">
    {#each weeks[0] ?? [] as day (day.getTime())}
      <div class="truncate px-2 py-1.5 text-center text-xs text-muted">{Format.weekday(day)}</div>
    {/each}
  </div>

  {#each rows as { week, bars, lanes } (week[0]?.getTime())}
    <div class="relative grid grid-cols-7 border-b border-line last:border-b-0">
      <Bands
        {bars}
        columns={Grid.WEEK}
        now={calendar.now}
        onopen={(moment, anchor) => calendar.peek(moment, anchor)}
        top="calc(var(--date-club) + {PAD})"
      />

      {#each week as day (day.getTime())}
        {@const today = Grid.same(day, calendar.now)}
        {@const listed = chips(day)}
        {@const room = listed.length > SHOWN ? SHOWN - 1 : SHOWN}
        <div
          class="flex min-h-36 min-w-0 flex-col border-e border-line last:border-e-0"
          style="padding: {PAD}"
        >
          <div class="flex h-(--date-club) items-center justify-center">
            <button
              type="button"
              class="flex size-6 items-center justify-center rounded-full text-xs transition-colors
                     {today ? 'bg-accent text-paper' : 'hover:bg-sunk'}
                     {day.getMonth() === shown ? '' : 'text-muted'}"
              aria-label={Format.date(day)}
              onclick={() => calendar.open(day)}
            >
              {Format.dayOfMonth(day)}
            </button>
          </div>

          <!-- The bars are drawn over the row, so the cell keeps exactly their height clear. -->
          <div style="height: calc({lanes} * var(--band-club))"></div>

          <div class="flex min-h-0 flex-col gap-px">
            {#each listed.slice(0, room) as moment (moment.id)}
              <Piece
                {moment}
                shape={Shape.Chip}
                now={calendar.now}
                onopen={(one, anchor) => calendar.peek(one, anchor)}
              />
            {/each}

            {#if listed.length > room}
              <button
                type="button"
                class="px-1 text-start text-xs text-muted hover:text-ink"
                onclick={() => calendar.open(day)}
              >
                {t.calendar.more(listed.length - room)}
              </button>
            {/if}
          </div>

          <!--
            The rest of the cell is the way to write something on that day. It shows nothing until
            it is pointed at: a month of visible buttons is not a calendar.
          -->
          {#if create}
            <a
              href={create(Calendar.slot(day, Calendar.WAKING))}
              class="slot mt-px min-h-4 flex-1 rounded"
              aria-label={t.calendar.add(Format.date(day))}
            >&nbsp;</a>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</div>
