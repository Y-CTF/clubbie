<script lang="ts">
/**
 * A sign-in provider's own logo, drawn from `Marks`.
 *
 * The component draws whatever the table holds rather than knowing any provider by name: adding
 * one is an entry there. A provider with no mark gets the generic one instead of nothing, because
 * `Providers` is a table the server owns and a deployment that adds an entry to it must not get a
 * blank button here.
 */
import { Marks } from './marks.ts';

let { provider }: { provider: string } = $props();

const mark = $derived(Marks.mark(provider));
</script>

{#if mark}
  <svg viewBox={mark.viewBox} class="size-8 fill-ink" role="img" aria-hidden="true">
    <!-- A piece with no colour of its own inherits the page's ink from the svg. -->
    {#each mark.pieces as piece (piece.d)}
      <path d={piece.d} fill={piece.fill} />
    {/each}
  </svg>
{:else}
  <!-- Anything else: a key, which is what every one of these does. -->
  <svg viewBox="0 0 24 24" class="size-8 stroke-muted" fill="none" stroke-width="1.5" role="img" aria-hidden="true">
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M18 12v3M15 12v2" stroke-linecap="round" />
  </svg>
{/if}
