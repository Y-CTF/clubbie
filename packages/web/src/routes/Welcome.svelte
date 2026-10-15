<script lang="ts">
import { Action } from '../lib/action.svelte.ts';
import { club } from '../lib/club.svelte.ts';
import type { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Button from '../ui/Button.svelte';
import Checklist from '../ui/Checklist.svelte';

/**
 * The checklist, as a page.
 *
 * It is not a gate and nothing sends a member here: signing in leads to `session.entry`, and the
 * same list is a card above the calendar for anybody who goes straight on. So the only things on
 * this page are the list and two ways out, one of which says the list is not wanted.
 */
let { router }: { router: Router } = $props();

const t = $derived(words.t);
const action = new Action();

async function leave(dismiss: boolean): Promise<void> {
  if (dismiss) {
    const said = await action.run(async () => {
      await session.dismiss();
      return true;
    });
    if (!said) return;
  }

  router.go('Events');
}
</script>

<main class="mx-auto w-full max-w-[34rem] px-6 py-10">
  <p class="text-sm text-muted">{club.name}</p>
  <h1 class="mt-1">{t.welcome.heading}</h1>
  <p class="mt-2 text-sm text-muted">{t.welcome.lead}</p>

  <div class="mt-8"><Checklist /></div>

  {#if session.waiting}
    <p class="mt-6 rounded-lg border border-line p-4 text-sm text-muted">{t.welcome.waiting}</p>
  {/if}

  <div class="mt-8 flex items-center gap-4">
    <Button look="solid" disabled={action.busy} onclick={() => leave(false)}>{t.welcome.done}</Button>
    {#if session.left > 0}
      <Button disabled={action.busy} onclick={() => leave(true)}>{t.welcome.later}</Button>
      <p class="text-xs text-muted">{t.welcome.left(session.left)}</p>
    {/if}
  </div>

  {#if action.error}
    <div class="mt-4"><Alert error={action.error} /></div>
  {/if}
</main>
