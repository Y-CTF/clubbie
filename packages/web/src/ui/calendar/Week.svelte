<script lang="ts">
import { Calendar } from '../../lib/calendar/calendar.svelte.ts';
import { Grid } from '../../lib/calendar/grid.ts';
import { Layout } from '../../lib/calendar/layout.ts';
import { Format } from '../../lib/format.ts';
import { words } from '../../lib/words/index.svelte.ts';
import Bands from './Bands.svelte';
import Piece from './Piece.svelte';
import { Shape } from './piece.ts';

/**
 * The time grid: one column per day, twenty four hours tall.
 *
 * The week and the day are the same component because they are the same thing with a different
 * number of columns, and two of them would be two places to fix the overlap arithmetic.
 *
 * Everything below the header scrolls together, and it opens somewhere near the morning rather than
 * at midnight: nobody's club meets at four in the morning, and a grid that opens on the six hours
 * where nothing ever happens looks broken.
 */
let {
  calendar,
  create,
}: {
  calendar: Calendar;
  create: ((at: Date) => string) | null;
} = $props();

const t = $derived(words.t);
const days = $derived(calendar.days);
const bars = $derived(Layout.bars(calendar.moments, days));
const lanes = $derived(Layout.lanes(bars));

let scroller = $state<HTMLElement | null>(null);
/** Whether the column has already been put where the morning is. */
let woken = false;

/**
 * Opens on the morning, once, and the flag is what makes "once" a fact rather than an intention: a
 * member who has scrolled down to the evening and then stepped to the next week meant to stay
 * there, and an effect that ran again would drag them back up.
 */
$effect(() => {
  const element = scroller;
  if (!element || woken) return;

  woken = true;
  element.scrollTop = (element.scrollHeight * Calendar.WAKING) / Grid.HOURS;
});

/** Where an event goes, as percentages of a day column, so the stylesheet owns the height. */
function box(block: { top: number; height: number; column: number; columns: number }): string {
  const width = 100 / block.columns;
  return [
    `top: ${block.top * 100}%`,
    `height: ${block.height * 100}%`,
    `inset-inline-start: ${block.column * width}%`,
    `width: ${width}%`,
  ].join('; ');
}
</script>

<div class="calendar overflow-hidden rounded-lg border border-line">
  <!-- The gutter is a column of its own so the hour labels and the columns cannot drift apart. -->
  <div class="flex border-b border-line bg-sunk">
    <div class="w-14 shrink-0 border-e border-line"></div>
    {#each days as day (day.getTime())}
      {@const today = Grid.same(day, calendar.now)}
      <button
        type="button"
        class="min-w-0 flex-1 border-e border-line px-1 py-1.5 text-center last:border-e-0
               hover:bg-paper"
        onclick={() => calendar.open(day)}
      >
        <span class="block truncate text-xs text-muted">{Format.weekday(day)}</span>
        <span
          class="mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-sm
                 {today ? 'bg-accent text-paper' : ''}"
        >
          {Format.dayOfMonth(day)}
        </span>
      </button>
    {/each}
  </div>

  {#if lanes > 0}
    <div class="flex border-b border-line">
      <div class="flex w-14 shrink-0 items-start justify-end border-e border-line pe-2 pt-1 text-xs text-muted">
        {t.calendar.spanning}
      </div>
      <div class="relative flex-1" style="height: calc({lanes} * var(--band-club) + 0.25rem)">
        <Bands
          {bars}
          columns={days.length}
          now={calendar.now}
          onopen={(moment, anchor) => calendar.peek(moment, anchor)}
          top="0.125rem"
        />
      </div>
    </div>
  {/if}

  <div bind:this={scroller} class="max-h-[70vh] overflow-y-auto">
    <div class="flex" style="height: calc({Grid.HOURS} * var(--hour-club))">
      <div class="w-14 shrink-0 border-e border-line">
        {#each Grid.hours(days[0] ?? calendar.cursor) as hour, index (hour.getTime())}
          <!-- The label sits above its own line, so midnight is not written off the top edge. -->
          <div class="h-(--hour-club) pe-2 text-end text-xs text-muted">
            {#if index > 0}<span class="relative -top-1.5">{Format.hour(hour)}</span>{/if}
          </div>
        {/each}
      </div>

      {#each days as day (day.getTime())}
        {@const today = Grid.same(day, calendar.now)}
        <div class="hours relative min-w-0 flex-1 border-e border-line last:border-e-0">
          {#if create}
            {#each Grid.hours(day) as hour (hour.getTime())}
              <a
                href={create(hour)}
                class="slot block h-(--hour-club)"
                aria-label={t.calendar.add(`${Format.date(day)} ${Format.hour(hour)}`)}
              >&nbsp;</a>
            {/each}
          {/if}

          {#each Layout.place(calendar.moments, day) as block (block.moment.id)}
            <div class="absolute p-px" style={box(block)}>
              <Piece
                moment={block.moment}
                shape={Shape.Block}
                now={calendar.now}
                onopen={(one, anchor) => calendar.peek(one, anchor)}
              />
            </div>
          {/each}

          {#if today}
            <div class="now-line" style="top: {Grid.fraction(calendar.now, day) * 100}%"></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>
