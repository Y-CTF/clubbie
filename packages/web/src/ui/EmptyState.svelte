<script lang="ts">
import type { Snippet } from 'svelte';
import Icon, { type IconName } from './Icon.svelte';

/** Nothing here yet, said once, the same way everywhere, with the way to change that if there is one. */
let {
  title,
  body,
  icon = 'inbox',
  children,
}: { title: string; body?: string; icon?: IconName; children?: Snippet } = $props();
</script>

<div class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center">
  <span class="text-muted"><Icon name={icon} size={28} /></span>
  <p class="font-medium">{title}</p>
  {#if body}<p class="max-w-sm text-sm text-muted">{body}</p>{/if}
  {#if children}<div class="mt-2">{@render children()}</div>{/if}
</div>
