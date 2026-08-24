<script lang="ts">
import type { Dated, Moment } from '../../lib/calendar/moment.ts';
import { Calendars, ELSEWHERE, Elsewhere } from '../../lib/elsewhere.ts';
import { words } from '../../lib/words/index.svelte.ts';
import Mark from './Mark.svelte';

/**
 * One event, on its way into whatever calendar the member actually uses.
 *
 * Three links and no integration. Google and Outlook take a filled-in compose page of their own;
 * everything else takes the `.ics` the API writes, which is also what somebody on a desktop wants.
 * All three are marked external: they leave this app, and the router must not swallow them.
 *
 * They are marks rather than names because three product names in a row reads as a sentence, and
 * this is a choice of three doors. The name is on the link for whoever hovers it or hears it read.
 */
let { moment }: { moment: Moment<Dated> } = $props();

const t = $derived(words.t);
</script>

<div class="flex flex-wrap items-center gap-1.5 text-xs">
  <span class="me-1 text-muted">{t.calendar.addTo}</span>

  {#each ELSEWHERE as where (where)}
    <a
      href={Calendars.ADD[where](moment)}
      class="rounded-lg p-1 transition-opacity hover:opacity-70"
      title={Calendars.NAMES[where]}
      aria-label={Calendars.NAMES[where]}
      data-external={true}
      rel={where === Elsewhere.Apple ? undefined : 'noopener noreferrer'}
      target={where === Elsewhere.Apple ? undefined : '_blank'}
    >
      <Mark {where} />
    </a>
  {/each}
</div>
