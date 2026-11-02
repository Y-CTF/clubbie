<script lang="ts">
import type { Snippet } from 'svelte';

/**
 * The box. `flush` is for a list of rows that run edge to edge, with hairlines between them;
 * the default pads its contents and stacks them at the block gap.
 */
let { flush = false, children }: { flush?: boolean; children: Snippet } = $props();
</script>

<div class="card" class:card-flush={flush} class:stack={!flush} class:rows={flush}>
  {@render children()}
</div>
