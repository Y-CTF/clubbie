<script lang="ts">
import { type Answer, Rsvp } from '@clubbie/core';
import type { Action } from '../lib/action.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Button from './Button.svelte';

/**
 * The row of answers to one event, and the way out of it.
 *
 * One component because the event page and the calendar's popover ask the same question of the
 * same rules, and each used to carry its own copy of `Rsvp.offers` and its own button row. The
 * caller says what to reload afterwards, because what is on screen is the caller's, not this.
 */
let {
  open,
  capacity,
  taken,
  held,
  action,
  gap = 'gap-2',
  onanswer,
  onwithdraw,
}: {
  open: boolean;
  capacity: number | null;
  taken: number;
  /** What this member already said, or nothing if they have not. */
  held: Answer | null | undefined;
  action: Action;
  /** How tightly the buttons sit: a popover is a narrower place than a page. */
  gap?: string;
  onanswer: (answer: Answer) => void;
  onwithdraw: () => void;
} = $props();

const t = $derived(words.t);
const full = $derived(Rsvp.full(capacity, taken));
</script>

{#if session.can('event:rsvp')}
  <div class="flex flex-wrap {gap}">
    {#each Rsvp.ANSWERS as option (option)}
      {#if Rsvp.offers(option, held, full)}
        <Button
          look={held === option ? 'solid' : 'quiet'}
          disabled={!open || action.busy}
          onclick={() => onanswer(option)}
        >
          {t.answers[option]}
        </Button>
      {/if}
    {/each}
    {#if held}
      <Button look="plain" disabled={!open || action.busy} onclick={onwithdraw}>{t.event.withdraw}</Button>
    {/if}
  </div>
{/if}
