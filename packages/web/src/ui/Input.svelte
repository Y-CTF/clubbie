<script lang="ts">
import type { HTMLInputAttributes } from 'svelte/elements';

/**
 * A text box, with the class string that was being retyped at twenty-odd call sites.
 *
 * It exists for the same reason `Field` does: the club's radius, the club's line colour and the
 * 16px minimum that stops iOS zooming the page on focus are decisions, and a decision that lives
 * at twenty call sites is twenty places to forget it.
 */
let { value = $bindable(''), ...rest }: { value?: string } & HTMLInputAttributes = $props();
</script>

<input
  bind:value
  {...rest}
  class="w-full rounded-lg border border-line bg-transparent px-3 py-2.5 text-base
         transition-colors placeholder:text-muted hover:border-muted"
/>
