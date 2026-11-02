<script lang="ts">
import { toast } from '../lib/toast.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
</script>

<!-- Above the phone's tab bar, bottom-right of a desktop. `status` is polite: it never interrupts. -->
<div
  role="status"
  class="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:end-6 lg:bottom-6 lg:items-end"
>
  {#each toast.items as item (item.id)}
    <p class="pop pointer-events-auto flex items-center gap-4 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-pop">
      {item.text}
      {#if item.undo}
        {@const undo = item.undo}
        <button
          type="button"
          class="btn -my-1 -me-2 rounded-lg px-2.5 py-1 font-semibold underline underline-offset-4 hover:bg-paper/15"
          onclick={() => {
            toast.drop(item.id);
            undo();
          }}
        >
          {words.t.common.undo}
        </button>
      {/if}
    </p>
  {/each}
</div>
