<script lang="ts">
import { Action } from '../lib/action.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from './Alert.svelte';
import Button from './Button.svelte';
import Checklist from './Checklist.svelte';

/**
 * What is left of the checklist, above the page a member went straight on to.
 *
 * It is the reason nothing has to send anybody to the welcome page: the list is wherever they are,
 * until it is empty or they say they do not want it. It draws nothing at all once there is nothing
 * left, so finishing the last step is also what removes it.
 */
const t = $derived(words.t);
const action = new Action();

async function dismiss(): Promise<void> {
  await action.run(async () => {
    await session.dismiss();
    return true;
  });
}
</script>

{#if session.left > 0}
  <section class="card stack">
    <div class="flex items-baseline justify-between gap-4">
      <h2 class="text-base font-semibold">{t.welcome.heading}</h2>
      <span class="text-xs text-muted">{t.welcome.left(session.left)}</span>
    </div>

    <Checklist />

    <div>
      <Button disabled={action.busy} onclick={dismiss}>{t.welcome.later}</Button>
    </div>

    {#if action.error}<Alert error={action.error} />{/if}
  </section>
{/if}
