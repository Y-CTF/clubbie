<script lang="ts">
import type { Snippet } from 'svelte';

/**
 * A modal, drawn by the browser in its own layer.
 *
 * `<dialog>` rather than a positioned div is the whole point: it takes focus, keeps focus inside
 * itself, closes on `Escape`, and sits above everything without a stacking-context argument. What
 * is left for us is the padding and the tokens.
 *
 * It owns nothing. The caller says whether it is open and hears when it closed, so a dialog can be
 * driven by a promise, by a route, or by a checkbox without this file knowing which.
 */
let {
  open = false,
  title,
  onclose,
  children,
  actions,
}: {
  open?: boolean;
  title: string;
  /** Called for every close, including `Escape` and the backdrop, so the caller stays in step. */
  onclose?: () => void;
  children?: Snippet;
  actions?: Snippet;
} = $props();

let element = $state<HTMLDialogElement | null>(null);
const heading = $props.id();

/**
 * A press on the backdrop closes it, which the browser does not do for itself.
 *
 * The dialog element covers the whole window and the card inside it covers the dialog, so a click
 * whose target is the dialog itself landed on the backdrop and nowhere else. Comparing targets is
 * what makes that exact: measuring the card's rectangle instead reports a press that began inside
 * it and finished outside, which is how a dialog closes on somebody selecting the url in it.
 */
function backdrop(event: MouseEvent): void {
  if (event.target === element) element?.close();
}

$effect(() => {
  const dialog = element;
  if (!dialog) return;
  if (open && !dialog.open) dialog.showModal();
  if (!open && dialog.open) dialog.close();
});
</script>

<dialog bind:this={element} aria-labelledby={heading} onclick={backdrop} onclose={() => onclose?.()}>
  <div class="p-5">
    <h2 id={heading} class="font-medium">{title}</h2>

    {#if children}
      <div class="mt-2 text-sm text-muted">{@render children()}</div>
    {/if}

    {#if actions}
      <div class="mt-6 flex flex-wrap justify-end gap-2">{@render actions()}</div>
    {/if}
  </div>
</dialog>
