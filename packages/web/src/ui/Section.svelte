<script lang="ts">
import type { Snippet } from 'svelte';

/**
 * A titled group on a page. The title is an `h2` with an optional hint and an optional action at
 * the end of its row; the body is spaced by the same block gap everywhere. Sections replace the
 * hand-written `mt-10 border-t pt-8` that each page used to carry its own copy of.
 */
let {
  title,
  hint,
  actions,
  children,
}: { title: string; hint?: string | undefined; actions?: Snippet; children: Snippet } = $props();
</script>

<section class="stack">
  <div class="flex items-end justify-between gap-4">
    <div class="min-w-0">
      <h2>{title}</h2>
      {#if hint}<p class="mt-0.5 text-sm text-muted">{hint}</p>{/if}
    </div>
    {#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
  </div>
  {@render children()}
</section>
