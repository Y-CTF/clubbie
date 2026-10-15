<script lang="ts">
import { untrack } from 'svelte';
import { Calendar } from '../lib/calendar/calendar.svelte.ts';
import { View } from '../lib/calendar/grid.ts';
import { kinds } from '../lib/kinds.svelte.ts';
import type { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Agenda from '../ui/calendar/Agenda.svelte';
import Month from '../ui/calendar/Month.svelte';
import Peek from '../ui/calendar/Peek.svelte';
import Repeats from '../ui/calendar/Repeats.svelte';
import Subscribe from '../ui/calendar/Subscribe.svelte';
import Toolbar from '../ui/calendar/Toolbar.svelte';
import Week from '../ui/calendar/Week.svelte';
import Dialog from '../ui/Dialog.svelte';
import Panel from '../ui/Panel.svelte';
import Starter from '../ui/Starter.svelte';

/**
 * The club's calendar.
 *
 * The page owns almost nothing: `Calendar` holds what is being looked at and `Grid` decides which
 * days that is, so the four views are four renderings of one window rather than four pages. What
 * is here is the wiring a browser needs and a class should not have: which component draws which
 * view, where the keyboard goes, and the two dialogs.
 */
let { router }: { router: Router } = $props();

/** The address as it was when the page opened. What it says from here on is this page's doing. */
const calendar = new Calendar(untrack(() => router.current.query));

let subscribing = $state(false);
let repeating = $state(false);
let box = $state<HTMLElement | null>(null);

const t = $derived(words.t);
/** Only somebody who may write an event is offered the empty half of a day as a place to. */
const create = $derived(session.can('event:create') ? (at: Date) => Calendar.compose(at) : null);

$effect(() => {
  kinds.load();
});

/**
 * The window is the unit of loading: a changed view, day, filter or search is a new question.
 *
 * The key is read here and the load is untracked, so this effect depends on the question and not on
 * the answer. Reading anything the load writes would make it its own trigger.
 */
$effect(() => {
  const key = calendar.key;
  /**
   * Out of the flush entirely. `untrack` keeps the load's reads from being counted as this
   * effect's; queueing it keeps its writes from landing inside the same run, which is the other
   * half of the same rule and the one that makes an update loop through here impossible rather
   * than merely unlikely.
   */
  queueMicrotask(() => void untrack(() => calendar.load(key)));
});

/**
 * What is being looked at goes in the address, so the week can be sent to somebody.
 *
 * Queued for the same reason the load is. Writing the address replaces the router's match, which
 * every page on the shell reads, so doing it inside the flush puts a write to shared state in the
 * middle of a render that may still be settling. Out here it is what it actually is: something the
 * page does to the browser once the page has been drawn.
 */
$effect(() => {
  const address = calendar.address;
  queueMicrotask(() => router.replace('Events', {}, address));
});

/** The line across today has to move on its own, or it is a line across whenever the page loaded. */
$effect(() => {
  const timer = setInterval(() => (calendar.now = new Date()), Calendar.TICK);
  return () => clearInterval(timer);
});
</script>

<svelte:window
  onkeydown={(event) =>
    calendar.press(
      event,
      () => box?.querySelector('input')?.focus(),
      () => router.go('Compose'),
    )}
/>

<Starter />

<Toolbar
  {calendar}
  bind:box
  onsubscribe={() => (subscribing = true)}
  onrepeats={() => (repeating = true)}
/>

<div class="mt-4" aria-live="polite">
  <Panel query={calendar.query}>
    <!--
      Keyed on the view alone. Keying it on the window too would rebuild the week grid every time
      somebody stepped a week, which throws away where they had scrolled to in the day.
    -->
    {#key calendar.view}
      <div class="rise">
        {#if calendar.searching || calendar.view === View.Agenda}
          <Agenda {calendar} />
        {:else if calendar.view === View.Month}
          <Month {calendar} {create} />
        {:else}
          <Week {calendar} {create} />
        {/if}
      </div>
    {/key}
  </Panel>
</div>

<Peek {calendar} />

<!--
  Both are built when they are opened rather than with the page. A dialog renders its children
  whether it is showing them or not, so every visit to the calendar was fetching a feed url and a
  list of repeats that nobody had asked to see.
-->
<Dialog open={subscribing} title={t.calendar.subscribe} onclose={() => (subscribing = false)}>
  {#if subscribing}<Subscribe />{/if}
</Dialog>

<Dialog open={repeating} title={t.calendar.repeats} onclose={() => (repeating = false)}>
  {#if repeating}<Repeats {calendar} />{/if}
</Dialog>
