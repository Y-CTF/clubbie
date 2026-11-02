<script lang="ts" module>
export interface Entry {
  label: string;
  /** A link, for an entry that goes somewhere. */
  href?: string;
  /** An action, for one that does something. */
  onselect?: () => void;
  danger?: boolean;
}
</script>

<script lang="ts">
import { words } from '../lib/words/index.svelte.ts';
import Icon from './Icon.svelte';

/**
 * An overflow menu: the secondary actions of a place, behind one button, so the primary action is
 * the only loud thing in the row. It opens under its button, closes on `Escape`, on a press
 * elsewhere, and on choosing, and returns focus to the button it came from.
 */
let { entries, label }: { entries: Entry[]; label?: string } = $props();

const t = $derived(words.t);
let open = $state(false);
let root = $state<HTMLElement | null>(null);
let button = $state<HTMLButtonElement | null>(null);

function close(refocus = false): void {
  open = false;
  if (refocus) button?.focus();
}

function choose(entry: Entry): void {
  close();
  entry.onselect?.();
}
</script>

<svelte:window
  onpointerdown={(event) => {
    if (open && root && !root.contains(event.target as Node)) close();
  }}
/>

<div class="relative" bind:this={root} onkeydown={(event) => event.key === 'Escape' && close(true)} role="presentation">
  <button
    bind:this={button}
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={label ?? t.shell.more}
    onclick={() => (open = !open)}
    class="btn grid size-9 place-content-center rounded-lg border border-line bg-paper text-muted transition-colors hover:border-muted hover:text-ink"
  >
    <Icon name="more" size={18} />
  </button>

  {#if open}
    <div role="menu" class="pop absolute end-0 top-full z-30 mt-1.5 min-w-48 rounded-xl border border-line bg-paper p-1 shadow-pop">
      {#each entries as entry (entry.label)}
        {#if entry.href}
          <a
            role="menuitem"
            href={entry.href}
            onclick={() => close()}
            class="block rounded-lg px-3 py-2 text-sm hover:bg-sunk {entry.danger ? 'text-declined' : ''}"
          >{entry.label}</a>
        {:else}
          <button
            role="menuitem"
            type="button"
            onclick={() => choose(entry)}
            class="block w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-sunk {entry.danger ? 'text-declined' : ''}"
          >{entry.label}</button>
        {/if}
      {/each}
    </div>
  {/if}
</div>
