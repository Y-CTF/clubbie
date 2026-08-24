<script lang="ts">
import { Action } from '../../lib/action.svelte.ts';
import { api, unwrap } from '../../lib/api.ts';
import type { Calendar } from '../../lib/calendar/calendar.svelte.ts';
import { Format } from '../../lib/format.ts';
import { Query } from '../../lib/query.svelte.ts';
import { Router } from '../../lib/router.svelte.ts';
import { words } from '../../lib/words/index.svelte.ts';
import Alert from '../Alert.svelte';
import Button from '../Button.svelte';
import { look } from '../look.ts';
import Panel from '../Panel.svelte';

/**
 * The rules behind the repeating nights on the grid.
 *
 * There is no page of repeats any more, and there should not be: a repeat is an event that happens
 * again, it is written on the same form, and every night it produces is already on the calendar.
 * What a rule still needs is a way back to itself once its nights have all been stamped, which is
 * this list, and a way to top it up when a term has run past what was materialised.
 */
let { calendar }: { calendar: Calendar } = $props();

const repeats = new Query(async () => unwrap(await api.schedules.$get()));
const action = new Action();
const t = $derived(words.t);

/** How many of the coming dates are worth showing to recognise a rule by. */
const NEXT = 3;

$effect(() => {
  repeats.load();
});

async function fill(id: string): Promise<void> {
  if (await action.run(async () => unwrap(await api.schedules[':id'].expand.$post({ param: { id } })))) {
    await Promise.all([repeats.load(), calendar.query.load()]);
  }
}
</script>

<Panel query={repeats}>
  {#if action.error}<div class="mb-3"><Alert error={action.error} /></div>{/if}

  <ul class="divide-y divide-line">
    {#each repeats.data ?? [] as repeat (repeat.id)}
      <li class="py-3 text-sm">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="font-medium">{repeat.title}</span>
          <span class="font-mono text-xs text-muted">
            {t.schedules.rule(repeat.interval, repeat.freq, repeat.count)}
          </span>
        </div>

        <p class="mt-1 text-xs text-muted">
          {repeat.next.length
            ? t.schedules.next(
                repeat.next
                  .slice(0, NEXT)
                  .map((at) => Format.day(at))
                  .join(' · '),
              )
            : t.schedules.nothingNext}
        </p>

        <div class="mt-2 flex flex-wrap gap-2">
          <a href={Router.to('Repeat', { id: repeat.id })} class={look('plain')}>{t.common.edit}</a>
          <Button look="plain" disabled={action.busy} onclick={() => fill(repeat.id)}>
            {t.schedules.fill}
          </Button>
        </div>
      </li>
    {/each}
  </ul>

  {#if repeats.data?.length === 0}
    <p class="text-sm text-muted">{t.schedules.empty}</p>
  {/if}
</Panel>
