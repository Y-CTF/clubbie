<script lang="ts">
import { words } from '../lib/words/index.svelte.ts';
import Button from './Button.svelte';

/**
 * Back and forward through a report.
 *
 * Both reports at the foot of the settings page grow forever: a club that has been running for
 * three terms has thousands of trail entries, and showing the newest twenty with no way past them
 * is a report that answers "what happened this week" and nothing else.
 *
 * It pages rather than appending, because these are read backwards in time and the interesting
 * row is usually near a date rather than near the end of a scroll.
 */
let {
  offset = $bindable(),
  window: size,
  total,
}: {
  offset: number;
  /** How many a page holds, which the caller asked the server for. */
  window: number;
  total: number;
} = $props();

const t = $derived(words.t);
const page = $derived(Math.floor(offset / size) + 1);
const pages = $derived(Math.max(1, Math.ceil(total / size)));
</script>

{#if total > size}
  <div class="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
    <Button look="plain" disabled={offset === 0} onclick={() => (offset = Math.max(0, offset - size))}>
      {t.common.back}
    </Button>

    <span>{t.common.page(page, pages)}</span>

    <Button look="plain" disabled={page >= pages} onclick={() => (offset = offset + size)}>
      {t.common.forward}
    </Button>
  </div>
{/if}
