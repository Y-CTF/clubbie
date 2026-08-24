<script lang="ts">
import type { Refused } from '../lib/api.ts';

/**
 * A refusal, rendered as the diagnostic it is: the message, then the help and the notes under
 * it. The server already decided what a member should be told, so this component never invents
 * prose of its own.
 */
let { error }: { error: Refused } = $props();
</script>

<div class="rounded-lg border border-line bg-paper p-4 text-sm" role="alert">
  <p class="font-medium">{error.message}</p>

  {#if error.help}
    <p class="mt-2 text-muted">{error.help}</p>
  {/if}

  <!-- Keyed by position: notes are free prose from the server and two of them may be equal. -->
  {#each error.notes as note, index (index)}
    <p class="mt-1 font-mono text-xs text-muted">{note}</p>
  {/each}

  <p class="mt-2 font-mono text-xs text-muted">{error.diag.code}</p>
</div>
