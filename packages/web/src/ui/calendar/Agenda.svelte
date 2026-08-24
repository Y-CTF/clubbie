<script lang="ts">
import type { Calendar } from '../../lib/calendar/calendar.svelte.ts';
import { Grid } from '../../lib/calendar/grid.ts';
import { Format } from '../../lib/format.ts';
import { session } from '../../lib/session.svelte.ts';
import { words } from '../../lib/words/index.svelte.ts';
import Piece from './Piece.svelte';
import { Shape } from './piece.ts';

/**
 * The list: every day that has something on it, and nothing else.
 *
 * It is the view a phone gets and the one a search answers with, for the same reason: neither has
 * any use for an empty Tuesday. It is also the only view where there is room to say more than a
 * title, so it says where, what kind, and how many.
 *
 * The date is furniture rather than prose. A column of `Wednesday, 26 August` is a ragged left
 * margin and reads as a paragraph nobody wrote; a column of numerals with the weekday over each is
 * a spine the events hang off, and it is what makes the times line up in a second column beside it.
 */
let { calendar }: { calendar: Calendar } = $props();

const t = $derived(words.t);

/** Where a new month begins, so a list running past the end of one says which one it is now in. */
function opens(day: Date, index: number): boolean {
  const before = calendar.listed[index - 1];
  return !before || before.getMonth() !== day.getMonth();
}
</script>

<div class="calendar">
  {#each calendar.listed as day, index (day.getTime())}
    {@const today = Grid.same(day, calendar.now)}

    {#if opens(day, index)}
      <h2 class="mt-8 mb-1 border-b border-line pb-2 first:mt-0 text-muted">{Format.month(day)}</h2>
    {/if}

    <section class="flex gap-4 border-t border-line py-3 first-of-type:border-t-0 sm:gap-6">
      <div class="w-12 shrink-0 pt-0.5 text-end {today ? 'text-accent' : ''}">
        <div class="weekday {today ? '' : 'text-muted'}">{Format.weekday(day)}</div>
        <div class="numeral">{Format.dayOfMonth(day)}</div>
      </div>

      <ul class="min-w-0 flex-1 divide-y divide-line">
        {#each calendar.on(day) as moment (moment.id)}
          <li>
            <Piece
              {moment}
              shape={Shape.Row}
              now={calendar.now}
              onopen={(one, anchor) => calendar.peek(one, anchor)}
            />
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if calendar.listed.length === 0 && calendar.query.ready}
    <p class="text-sm text-muted">
      {#if calendar.searching}
        {t.events.noMatch(calendar.typed.settled)}
      {:else}
        {session.can('event:create') ? t.events.emptyOrganiser : t.events.empty}
      {/if}
    </p>
  {/if}
</div>
