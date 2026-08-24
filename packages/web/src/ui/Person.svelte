<script lang="ts">
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';

/**
 * A member's name, wherever one is shown: on an answer, on a sheet, on a roster.
 *
 * It is a link for whoever may open the page behind it and plain text for everybody else, because
 * a link that refuses is worse than no link. Every list that shows a person uses this, so "can I
 * click a name here" has one answer in the whole app rather than one per page.
 */
let {
  id,
  name,
  note,
}: {
  id: string;
  name: string;
  /** What to say beside the name: a role, a status, an address. */
  note?: string;
} = $props();

const open = $derived(session.can('member:read'));
</script>

{#snippet body()}
  <span>{name}</span>
  {#if note}<span class="ml-2 font-mono text-xs text-muted">{note}</span>{/if}
{/snippet}

{#if open}
  <a href={Router.to('Member', { id })} class="transition-colors hover:text-accent">
    {@render body()}
  </a>
{:else}
  <span>{@render body()}</span>
{/if}
