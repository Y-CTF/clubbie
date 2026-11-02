<script lang="ts">
import { Action } from '../lib/action.svelte.ts';
import { club } from '../lib/club.svelte.ts';
import type { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Button from '../ui/Button.svelte';
import Card from '../ui/Card.svelte';
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

<div class="stack-page mx-auto w-full max-w-[34rem] sm:py-6">
  <header class="stack-tight">
    <p class="text-sm text-muted">{club.name}</p>
    <h1>{t.welcome.heading}</h1>
    <p class="text-sm text-muted">{t.welcome.lead}</p>
  </header>

  <Card><Checklist /></Card>

  {#if session.waiting}
    <Card><p class="text-sm text-muted">{t.welcome.waiting}</p></Card>
  {/if}

  <div class="flex flex-wrap items-center gap-3">
    <Button look="solid" field disabled={action.busy} onclick={() => leave(false)}>{t.welcome.done}</Button>
    {#if session.left > 0}
      <Button field disabled={action.busy} onclick={() => leave(true)}>{t.welcome.later}</Button>
      <p class="text-sm text-muted">{t.welcome.left(session.left)}</p>
    {/if}
  </div>

  {#if action.error}<Alert error={action.error} />{/if}
</div>
