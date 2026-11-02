<script lang="ts">
import { Calendar } from '../../lib/calendar/calendar.svelte.ts';
import { VIEWS, View } from '../../lib/calendar/grid.ts';
import { kinds } from '../../lib/kinds.svelte.ts';
import { session } from '../../lib/session.svelte.ts';
import { words } from '../../lib/words/index.svelte.ts';
import Button from '../Button.svelte';
import Icon from '../Icon.svelte';
import Menu from '../Menu.svelte';
import PageHeader from '../PageHeader.svelte';
import Search from '../Search.svelte';
import Segmented from '../Segmented.svelte';
import Select from '../Select.svelte';

/**
 * Everything above the grid, in three tiers of decreasing weight.
 *
 * The page header carries the one primary action (a new event) and puts the rest (subscribe,
 * repeating events) behind a menu, because they are things you do once. The second row is
 * movement and view: arrows and "today" on the left, where a hand goes, and the view switch on
 * the right, because that is a setting rather than a movement. The third is what you are looking
 * for. Each row is one line at desktop width and wraps cleanly at phone width.
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

const entries = $derived([
  { label: t.calendar.subscribe, onselect: onsubscribe },
  ...(organiser ? [{ label: t.calendar.repeats, onselect: onrepeats }] : []),
]);
</script>

<div class="stack">
  <PageHeader title={t.pages.Events}>
    {#snippet actions()}
      <Menu {entries} />
      {#if session.can('event:create')}
        <Button look="solid" href={Calendar.compose()}>
          <Icon name="plus" size={16} />{t.common.new}
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
    <div class="flex min-w-0 items-center gap-2">
      <button
        type="button"
        class="btn grid size-9 place-content-center rounded-lg border border-line bg-paper text-muted hover:border-muted hover:text-ink"
        aria-label={t.calendar.previous}
        onclick={() => calendar.step(-1)}
      >
        <Icon name="back" size={18} />
      </button>
      <button
        type="button"
        class="btn grid size-9 place-content-center rounded-lg border border-line bg-paper text-muted hover:border-muted hover:text-ink"
        aria-label={t.calendar.next}
        onclick={() => calendar.step(1)}
      >
        <Icon name="forward" size={18} />
      </button>
      <Button look="quiet" onclick={() => calendar.today()}>{t.calendar.today}</Button>
      <p class="ms-1 min-w-0 truncate font-medium" aria-live="polite">{calendar.title}</p>
    </div>

    <Segmented
      value={calendar.view}
      options={VIEWS}
      name={(view) => t.calendar.views[view]}
      title={(view) => t.calendar.shortcut(t.calendar.views[view], Calendar.shortcut(view))}
      onselect={(view) => calendar.show(view)}
    />
  </div>

  <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
    <div bind:this={box}>
      <Search
        typed={calendar.typed}
        placeholder={t.events.find}
        onstart={() => calendar.show(View.Agenda)}
      />
    </div>

    <Select
      bind:value={calendar.kind}
      options={kinds.ids}
      name={(option) => kinds.label(option)}
      empty={t.calendar.everyKind}
      label={t.compose.kind}
    />
  </div>
</div>
