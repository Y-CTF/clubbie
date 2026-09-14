<script lang="ts">
import type { Snippet } from 'svelte';
import { type Look, look } from './look.ts';

/** A button. What it looks like is `look.ts`'s business, which an `<a>` can borrow too. */
let {
  look: name = 'quiet',
  field = false,
  disabled = false,
  type = 'button',
  onclick,
  children,
}: {
  look?: Look;
  /** Standing beside a text box: the same height as the box, rather than shorter than it. */
  field?: boolean;
  disabled?: boolean;
  /** `submit` is what makes Enter work inside a form, which nothing in the app used to do. */
  type?: 'button' | 'submit';
  disabledReason?: never;
  onclick?: (event: MouseEvent) => void;
  children: Snippet;
} = $props();
</script>

<button
  {type}
  {disabled}
  {onclick}
  class="{look(name, field)} disabled:cursor-not-allowed disabled:opacity-40"
>
  {@render children()}
</button>
