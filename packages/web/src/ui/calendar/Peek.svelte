<script lang="ts">
import { type Answer, Event, Rsvp } from '@clubbie/core';
import { Action } from '../../lib/action.svelte.ts';
import { api, unwrap } from '../../lib/api.ts';
import type { Calendar } from '../../lib/calendar/calendar.svelte.ts';
import { Format } from '../../lib/format.ts';
import { Hues } from '../../lib/hues.ts';
import { kinds } from '../../lib/kinds.svelte.ts';
import { Router } from '../../lib/router.svelte.ts';
import { session } from '../../lib/session.svelte.ts';
import { words } from '../../lib/words/index.svelte.ts';
import Alert from '../Alert.svelte';
import Badge from '../Badge.svelte';
import Button from '../Button.svelte';
import { look } from '../look.ts';
import Add from './Add.svelte';

/**
 * The event a member clicked, opened where they clicked it.
 *
 * A calendar's whole promise is that you can look at a night without leaving the month, and answer
 * it without leaving the month either. So the answers are here, and the way to the full page is one
 * link inside rather than the only thing a click can do.
 *
 * It is positioned against the rectangle of the thing that opened it and folded back inside the
 * window, which is the entire reason it is not a modal: a dialog in the middle of the screen loses
 * the one piece of information the member already had, which is where in the week they were.
 */
let { calendar }: { calendar: Calendar } = $props();

/** The card's own measurements, and how far it keeps off the edges of the window. */
const WIDTH = 320;
const GAP = 8;
const MARGIN = 12;
/** What it is worth guessing the height is before it has been drawn, to decide which way it opens. */
const HEIGHT = 260;

const action = new Action();
const t = $derived(words.t);

let width = $state(0);
let height = $state(0);

const moment = $derived(calendar.peeked);
const anchor = $derived(calendar.anchor);

/**
 * Below the thing that was clicked, or above it when there is no room below, and never off either
 * side. Fixed coordinates, because a `DOMRect` is in the viewport's terms and so is `fixed`.
 */
const place = $derived.by(() => {
  if (!anchor) return null;

  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - HEIGHT;
  const top = below + HEIGHT < height || above < MARGIN ? below : above;

  const wanted = anchor.left + anchor.width / 2 - WIDTH / 2;
  const left = Math.min(Math.max(wanted, MARGIN), Math.max(MARGIN, width - WIDTH - MARGIN));
  return { top: Math.min(top, Math.max(MARGIN, height - MARGIN - HEIGHT)), left };
});

/** A full event offers the waitlist instead of `going`, exactly as the event page does. */
const full = $derived(
  moment !== null && moment.event.capacity !== null && moment.event.taken >= moment.event.capacity,
);

function offered(answer: Answer, held: Answer | null): boolean {
  if (answer === Rsvp.IMPLIED) return !full || held === Rsvp.IMPLIED;
  if (answer === Rsvp.QUEUED) return full || held === Rsvp.QUEUED;
  return true;
}

/**
 * Answering from the calendar. The window is reloaded rather than patched: an answer moves a
 * count, and on a full night it moves somebody else off the waitlist too, which is a fact only
 * the server has.
 */
async function answer(id: string, said: Answer): Promise<void> {
  const written = await action.run(async () =>
    unwrap(await api.events[':id'].rsvp.$put({ param: { id }, json: { answer: said } })),
  );
  if (written) await calendar.query.load();
}

async function withdraw(id: string): Promise<void> {
  const gone = await action.run(async () => unwrap(await api.events[':id'].rsvp.$delete({ param: { id } })));
  if (gone) await calendar.query.load();
}

/** A click anywhere but inside the card closes it, the way a popover is expected to behave. */
function outside(event: MouseEvent): void {
  if (!moment) return;
  const target = event.target as Node | null;
  if (card?.contains(target ?? null)) return;
  calendar.close();
}

let card = $state<HTMLElement | null>(null);
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} onclickcapture={outside} />

{#if moment && place}
  {@const detail = moment.event}
  <div
    bind:this={card}
    role="dialog"
    aria-label={detail.title}
    class="pop fixed z-40 rounded-lg border border-line bg-paper p-4 shadow-lg"
    style="top: {place.top}px; inset-inline-start: {place.left}px; width: {WIDTH}px"
  >
    <div class="flex items-start gap-2">
      <span
        class="mt-1.5 size-2.5 shrink-0 rounded-full"
        style="background: {Hues.of(detail.kind)}"
      ></span>

      <div class="min-w-0 flex-1">
        <h2 class="text-base font-medium {moment.cancelled ? 'line-through' : ''}">{detail.title}</h2>
        <p class="mt-0.5 text-xs text-muted">
          {Format.date(moment.startsAt)} · {Format.slot(moment.startsAt, moment.endsAt)}
        </p>
        <p class="mt-0.5 text-xs text-muted">
          {kinds.label(detail.kind)}
          {#if detail.location}· {detail.location}{/if}
          {#if detail.state !== Event.LIVE}· {t.states[detail.state]}{/if}
        </p>
      </div>

      <button
        type="button"
        class="-mt-1 -me-1 px-1 text-muted hover:text-ink"
        aria-label={t.common.cancel}
        onclick={() => calendar.close()}
      >
        ×
      </button>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <Badge kind="going">{t.events.going(detail.going)}</Badge>
      {#if detail.capacity}<span>{t.events.places(detail.taken, detail.capacity)}</span>{/if}
      {#if detail.waiting}<Badge kind="waitlist">{t.events.waiting(detail.waiting)}</Badge>{/if}
      {#if !detail.open}<span>{t.events.closed}</span>{/if}
    </div>

    {#if session.can('event:rsvp')}
      <div class="mt-3 flex flex-wrap gap-1.5">
        {#each Rsvp.ANSWERS as option (option)}
          {#if offered(option, detail.yours)}
            <Button
              look={detail.yours === option ? 'solid' : 'quiet'}
              disabled={!detail.open || action.busy}
              onclick={() => answer(detail.id, option)}
            >
              {t.answers[option]}
            </Button>
          {/if}
        {/each}
        {#if detail.yours}
          <Button look="plain" disabled={!detail.open || action.busy} onclick={() => withdraw(detail.id)}>
            {t.event.withdraw}
          </Button>
        {/if}
      </div>
    {/if}

    {#if action.error}<div class="mt-3"><Alert error={action.error} /></div>{/if}

    <div class="mt-4 border-t border-line pt-3">
      <Add {moment} />

      <div class="mt-3 flex flex-wrap gap-2">
        <a href={Router.to('Event', { id: detail.id })} class={look('plain')}>{t.calendar.details}</a>
        {#if detail.scheduleId && session.can('event:manage')}
          <a href={Router.to('Repeat', { id: detail.scheduleId })} class={look('plain')}>
            {t.calendar.series}
          </a>
        {/if}
      </div>
    </div>
  </div>
{/if}
