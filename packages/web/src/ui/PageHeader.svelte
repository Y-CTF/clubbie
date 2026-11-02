<script lang="ts">
import type { Snippet } from 'svelte';
import Icon from './Icon.svelte';

/**
 * The top of a page: where you are, what this is, and what you can do about it.
 *
 * Every page opens with one of these, so the title is always the same size in the same place and
 * the primary action is always at the end of the same row. A detail page passes `back` and gets a
 * quiet link to its parent above the title, which is the breadcrumb a one-level app needs.
 * Actions wrap under the title on a phone rather than squeezing it.
 */
let {
  title,
  sub,
  back,
  meta,
  actions,
}: {
  title: string;
  /** One quiet line under the title. For more than a string, use `meta`. */
  sub?: string | undefined;
  back?: { href: string; label: string };
  meta?: Snippet;
  actions?: Snippet;
} = $props();
</script>

<header class="stack-tight">
  {#if back}
    <a href={back.href} class="inline-flex w-fit items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
      <Icon name="back" size={16} />{back.label}
    </a>
  {/if}

  <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
    <div class="min-w-0 flex-1 basis-60">
      <h1 class="break-words">{title}</h1>
      {#if sub}<p class="mt-1 text-sm text-muted">{sub}</p>{/if}
      {#if meta}<div class="mt-1 text-sm text-muted">{@render meta()}</div>{/if}
    </div>

    {#if actions}
      <div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
    {/if}
  </div>
</header>
