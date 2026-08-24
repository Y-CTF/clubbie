<script lang="ts">
import type { Snippet } from 'svelte';
import { ask } from '../lib/ask.svelte.ts';
import Button from './Button.svelte';

/**
 * A button for something that cannot be undone. It asks first, in the app's one dialog, and only
 * calls back when the answer was yes.
 *
 * The question is the caller's, because only the caller knows what is about to be lost: "delete
 * this event?" is a question, "are you sure?" is a noise a member learns to click through.
 */
let {
  question,
  detail,
  confirm,
  field = false,
  disabled = false,
  onconfirm,
  children,
}: {
  question: string;
  detail?: string;
  confirm?: string;
  /** Standing beside a text box: the same height as the box, rather than shorter than it. */
  field?: boolean;
  disabled?: boolean;
  onconfirm: () => void;
  children: Snippet;
} = $props();

async function press(): Promise<void> {
  if (await ask.put({ title: question, detail, confirm, danger: true })) onconfirm();
}
</script>

<Button look="plain" {field} {disabled} onclick={press}>{@render children()}</Button>
