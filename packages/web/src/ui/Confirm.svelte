<script lang="ts">
import { ask } from '../lib/ask.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Button from './Button.svelte';
import Dialog from './Dialog.svelte';

/**
 * The one confirmation dialog, mounted once by the shell. Nothing else renders it: a page asks
 * `ask.put(...)` and waits for the answer.
 */
const t = $derived(words.t);
const question = $derived(ask.question);
</script>

<Dialog
  open={question !== null}
  title={question?.title ?? ''}
  onclose={() => ask.answer(false)}
>
  {#if question?.detail}{question.detail}{/if}

  {#snippet actions()}
    <Button look="quiet" onclick={() => ask.answer(false)}>{t.common.cancel}</Button>
    <Button look={question?.danger ? 'danger' : 'solid'} onclick={() => ask.answer(true)}>
      {question?.confirm ?? t.common.sure}
    </Button>
  {/snippet}
</Dialog>
