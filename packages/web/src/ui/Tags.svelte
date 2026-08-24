<script lang="ts">
import { words } from '../lib/words/index.svelte.ts';
import Input from './Input.svelte';
import { look } from './look.ts';

/**
 * A short list of short strings, edited as things rather than as text.
 *
 * The list this exists for is a club's academic domains, and it was a textarea with one entry per
 * line: nothing showed which lines were understood as domains, a stray space was invisible, and
 * "how do I remove one" was "select the line and the newline behind it". Here each entry is a
 * chip with its own remove button, and what is typed becomes one the moment it is finished.
 *
 * `check` decides what may be added at all, so a value the server would refuse cannot be typed
 * into the list and discovered on save.
 */
let {
  values = $bindable(),
  placeholder,
  label,
  check,
}: {
  values: string[];
  placeholder: string;
  label: string;
  /** Whether a typed entry is one of these things. Anything else is refused before it is added. */
  check?: ((value: string) => boolean) | undefined;
} = $props();

let typing = $state('');

const t = $derived(words.t);
/** What is in the box, tidied the way it would be stored: chips are values, not keystrokes. */
const wanted = $derived(typing.trim().toLowerCase());
const addable = $derived(wanted !== '' && !values.includes(wanted) && (check?.(wanted) ?? true));

function add(): void {
  if (!addable) return;
  values = [...values, wanted];
  typing = '';
}

function drop(value: string): void {
  values = values.filter((one) => one !== value);
}

/**
 * Enter and comma both finish an entry, because both are what people type in a list of domains.
 * Backspace in an empty box takes the last one back, which is the one thing every tag field in
 * the world does and the only one nobody is told about.
 */
function key(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    add();
    return;
  }

  const last = values[values.length - 1];
  if (event.key === 'Backspace' && typing === '' && last !== undefined) drop(last);
}
</script>

<div class="grid gap-2">
  {#if values.length}
    <ul class="flex flex-wrap gap-1.5">
      {#each values as value (value)}
        <li
          class="inline-flex items-center gap-1.5 rounded-full border border-line bg-sunk py-1 ps-3 pe-1.5
                 font-mono text-xs"
        >
          {value}
          <button
            type="button"
            aria-label={t.common.removeOne(value)}
            class="grid size-5 place-content-center rounded-full text-muted transition-colors
                   hover:bg-declined hover:text-paper"
            onclick={() => drop(value)}
          >
            &times;
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
    <Input
      bind:value={typing}
      {placeholder}
      aria-label={label}
      autocapitalize="none"
      autocorrect="off"
      spellcheck="false"
      onkeydown={key}
      onblur={add}
    />
    <button type="button" class={look('quiet', true)} disabled={!addable} onclick={add}>
      {t.common.add}
    </button>
  </div>
</div>
