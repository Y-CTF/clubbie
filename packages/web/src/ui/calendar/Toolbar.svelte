<script lang="ts">
import { Calendar } from '../../lib/calendar/calendar.svelte.ts';
import { VIEWS, View } from '../../lib/calendar/grid.ts';
import { kinds } from '../../lib/kinds.svelte.ts';
import { session } from '../../lib/session.svelte.ts';
import { words } from '../../lib/words/index.svelte.ts';
import Button from '../Button.svelte';
import { look } from '../look.ts';
import Search from '../Search.svelte';
import Select from '../Select.svelte';

/**
 * Everything above the grid: where you are, how to move, and what you are looking at.
 *
 * The order is the one every calendar has settled on, and it is worth keeping: today and the
 * arrows on the left, because that is where a hand goes, and the views on the right, because that
 * is a setting rather than a movement.
 */
let {
  calendar,
  box = $bindable(null),
  onsubscribe,
  onrepeats,
}: {
  calendar: Calendar;
  /** The search box, so the page can put the cursor in it when somebody presses `/`. */
  box?: HTMLElement | null;
  onsubscribe: () => void;
  onrepeats: () => void;
} = $props();

const t = $derived(words.t);
const organiser = $derived(session.can('event:manage'));
</script>

<header class="flex flex-wrap items-center gap-x-3 gap-y-2">
  <h1 class="me-1 font-semibold">{t.pages.Events}</h1>

  <div class="flex items-center gap-1">
    <Button look="plain" onclick={() => calendar.today()}>{t.calendar.today}</Button>
    <button
      type="button"
      class="rounded-lg px-2 py-1.5 text-muted hover:text-ink"
      aria-label={t.calendar.previous}
      onclick={() => calendar.step(-1)}
    >
      ‹
    </button>
    <button
      type="button"
      class="rounded-lg px-2 py-1.5 text-muted hover:text-ink"
      aria-label={t.calendar.next}
      onclick={() => calendar.step(1)}
    >
      ›
    </button>
  </div>

  <p class="min-w-0 truncate text-sm" aria-live="polite">{calendar.title}</p>

  <div class="ms-auto flex flex-wrap items-center gap-1">
    {#each VIEWS as view (view)}
      <button
        type="button"
        class="rounded-lg px-2.5 py-1.5 text-sm transition-colors
               {calendar.view === view ? 'bg-sunk text-ink' : 'text-muted hover:text-ink'}"
        aria-pressed={calendar.view === view}
        title={t.calendar.shortcut(t.calendar.views[view], Calendar.shortcut(view))}
        onclick={() => calendar.show(view)}
      >
        {t.calendar.views[view]}
      </button>
    {/each}
  </div>
</header>

<div class="mt-3 flex flex-wrap items-center gap-2">
  <div bind:this={box} class="min-w-56 flex-1">
    <Search
      typed={calendar.typed}
      placeholder={t.events.find}
      onstart={() => calendar.show(View.Agenda)}
    />
  </div>

  <div class="w-44">
    <Select
      bind:value={calendar.kind}
      options={kinds.ids}
      name={(option) => kinds.label(option)}
      empty={t.calendar.everyKind}
      label={t.compose.kind}
    />
  </div>

  <!-- Field-sized, not row-sized: they stand beside the search box and the menu, not in a list. -->
  <Button look="plain" field onclick={onsubscribe}>{t.calendar.subscribe}</Button>

  {#if organiser}
    <Button look="plain" field onclick={onrepeats}>{t.calendar.repeats}</Button>
  {/if}

  {#if session.can('event:create')}
    <a href={Calendar.compose()} class={look('solid', true)}>{t.common.new}</a>
  {/if}
</div>
