<script lang="ts">
import type { Typed } from '../lib/typed.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';

/**
 * The one search box. Two pages had their own copy of it, character for character apart from the
 * placeholder, which is how one of them ends up with autocorrect on and the other without.
 *
 * Its height is `Input`'s and `Select`'s. A control standing in a row with those two and a button
 * is only in a row if all four are the same height.
 *
 * It takes the `Typed` that debounces it rather than a value, because what a list actually needs
 * is "the term once they stopped typing", and that decision belongs in one place too.
 */
let {
  typed,
  placeholder,
  onstart,
}: {
  typed: Typed;
  placeholder: string;
  /** Fired on the first keystroke of a search, for a list that widens what it is searching. */
  onstart?: (() => void) | undefined;
} = $props();

function type(value: string): void {
  const began = value !== '' && typed.live === '';
  typed.set(value);
  if (began) onstart?.();
}

const t = $derived(words.t);
</script>

<input
  value={typed.live}
  oninput={(event) => type(event.currentTarget.value)}
  type="search"
  {placeholder}
  aria-label={t.common.search}
  autocapitalize="none"
  autocorrect="off"
  spellcheck="false"
  class="w-full rounded-lg border border-line bg-transparent px-3 py-2.5 text-base
         transition-colors hover:border-muted"
/>
