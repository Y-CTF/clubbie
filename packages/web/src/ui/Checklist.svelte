<script lang="ts" module>
import type { Step } from '@clubbie/core';
import type { Name } from '../lib/router.svelte.ts';

/**
 * Where each step is done. A step with no page is done in place, with a button, because joining a
 * season is one request and a page for it would be a click to learn that.
 */
const TARGET: Record<Step, Name | null> = {
  club: 'Settings',
  event: 'Compose',
  name: 'Profile',
  chat: 'Profile',
  season: null,
};
</script>

<script lang="ts">
import { Action } from '../lib/action.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from './Alert.svelte';
import Button from './Button.svelte';

/**
 * The steps `Setup` asked this member for, each ticked from the same data the rest of the app
 * reads. What the steps are, who is asked for which and whether one is done are all decided in
 * `core` and arrive with the session: this only draws them, so it holds no list of its own to
 * drift from the server's.
 */
const t = $derived(words.t);
const action = new Action();

async function renew(): Promise<void> {
  await action.run(async () => {
    await session.renew();
    return true;
  });
}
</script>

<ul class="flex flex-col">
  {#each session.setup as item (item.step)}
    {@const words = t.welcome.steps[item.step]}
    {@const target = TARGET[item.step]}
    <li class="flex gap-4 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
      <!-- The marker is the state, so the list says what is left without a sentence saying so. -->
      <span
        class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border
               {item.done ? 'border-accent bg-accent text-paper' : 'border-line'}"
        aria-hidden="true"
      >
        {#if item.done}
          <svg viewBox="0 0 12 12" class="size-3" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2.5 6.5 5 9l4.5-5.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        {/if}
      </span>

      <div class="min-w-0 flex-1">
        <p class="text-sm {item.done ? 'text-muted line-through' : ''}">{words.label}</p>

        {#if !item.done}
          {#if target}
            <a class="mt-2 inline-block text-sm text-accent" href={Router.to(target)}>{words.how}</a>
          {:else}
            <div class="mt-2">
              <Button disabled={action.busy || !session.renewable} onclick={renew}>
                {session.season?.name ?? words.how}
              </Button>
            </div>
          {/if}
        {/if}
      </div>
    </li>
  {/each}
</ul>

{#if action.error}
  <div class="mt-4"><Alert error={action.error} /></div>
{/if}
