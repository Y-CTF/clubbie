<script lang="ts">
import type { Snippet } from 'svelte';
import { type Look, look } from './look.ts';

/**
 * The one button. Give it `href` and it is a link that looks the same, so "a thing you press" has
 * one component whether it runs code or goes somewhere; `external` marks a link the router must
 * not swallow (a download, another site).
 */
let {
  look: name = 'quiet',
  field = false,
  full = false,
  disabled = false,
  type = 'button',
  href,
  external = false,
  onclick,
  children,
}: {
  look?: Look;
  /** Standing beside a text box: the same height as the box, rather than shorter than it. */
  field?: boolean;
  /** Fills the width of its container, for the one action a narrow column is about. */
  full?: boolean;
  disabled?: boolean;
  /** `submit` is what makes Enter work inside a form. */
  type?: 'button' | 'submit';
  href?: string;
  external?: boolean;
  onclick?: (event: MouseEvent) => void;
  children: Snippet;
} = $props();

const classes = $derived(
  `${look(name, field)} ${full ? 'w-full' : ''} disabled:cursor-not-allowed disabled:opacity-40`,
);
</script>

{#if href}
  <a
    {href}
    class={classes}
    data-external={external ? true : undefined}
    target={external ? '_blank' : undefined}
    rel={external ? 'noopener noreferrer' : undefined}
  >
    {@render children()}
  </a>
{:else}
  <button {type} {disabled} {onclick} class={classes}>
    {@render children()}
  </button>
{/if}
