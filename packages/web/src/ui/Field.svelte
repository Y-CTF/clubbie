<script lang="ts">
import type { Snippet } from 'svelte';

/**
 * A labelled form control. It exists so every form on the site has its label in the same place,
 * its hint in the same place, and one way of saying a field is optional.
 *
 * `group` is for a field that holds more than one control. A `<label>` wrapping several of them is
 * invalid html and the browser resolves it by binding the label to the *first* one, so pointing at
 * the second checkbox in a row lit up the first, and clicking it would have ticked the first. A
 * group says what it is with `aria-labelledby` instead, which is what a group of controls wants.
 */
let {
  label,
  hint,
  group = false,
  children,
}: {
  label: string;
  hint?: string | undefined;
  /** True when the field holds several controls rather than one. */
  group?: boolean;
  children: Snippet;
} = $props();

const named = $props.id();
</script>

{#snippet inside()}
  <span id={named} class="text-xs text-muted">{label}</span>
  <div class="mt-1">{@render children()}</div>
  {#if hint}<span class="mt-1 block text-xs text-muted">{hint}</span>{/if}
{/snippet}

{#if group}
  <div role="group" aria-labelledby={named} class="block">{@render inside()}</div>
{:else}
  <label class="block">{@render inside()}</label>
{/if}
