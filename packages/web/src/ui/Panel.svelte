<script lang="ts" generics="T">
import type { Snippet } from 'svelte';
import type { Query } from '../lib/query.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from './Alert.svelte';

/**
 * The three states every page shares: loading, refused, ready. Written once so no page invents
 * its own spinner or its own way of showing a refusal.
 *
 * A refusal replaces the page only when there is nothing to replace. Once data has arrived, a
 * failed *re*fetch shows the reason above what is already on screen and leaves it there: a
 * doorway with one bar would otherwise lose the whole attendance sheet to a dropped request, and
 * the organiser cannot tap what is not rendered.
 */
let { query, children }: { query: Query<T>; children: Snippet } = $props();

const t = $derived(words.t);
</script>

{#if query.first}
  <p class="breathe text-sm text-muted">{t.common.loading}</p>
{:else if query.error && query.data === null}
  <Alert error={query.error} />
{:else}
  {#if query.error}
    <div class="mt-4"><Alert error={query.error} /></div>
  {/if}
  {@render children()}
{/if}
