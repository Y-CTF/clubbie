<script lang="ts">
import type { Moment } from '../../lib/calendar/moment.ts';
import { Format } from '../../lib/format.ts';
import { Hues } from '../../lib/hues.ts';
import { kinds } from '../../lib/kinds.svelte.ts';
import { words } from '../../lib/words/index.svelte.ts';
import Badge from '../Badge.svelte';
import { DOTTED, Shape, SHAPES } from './piece.ts';

/**
 * One event, wherever the calendar is drawing it.
 *
 * It is a button rather than a link on purpose: clicking an event on a calendar opens it where it
 * is, and the way to the whole page is inside what opens. A link would take a member off the month
 * they were reading to answer a question the popover answers in place.
 *
 * The state marks are here rather than at four call sites, which is the reason this component
 * exists at all: cancelled is struck through, a draft is hollow, and anything already over is
 * dimmed, at every size, forever.
 */
let {
  moment,
  shape,
  now,
  onopen,
  clock = true,
  style = '',
}: {
  moment: Moment;
  shape: Shape;
  /** The page's clock, so "happening now" is a thing the whole grid agrees about. */
  now: Date;
  onopen: (moment: Moment, anchor: DOMRect) => void;
  /** Whether there is room for the time. A bar covering three days has nothing useful to say. */
  clock?: boolean;
  /** Geometry the caller owns, which today is the corners a bar loses where it was cut off. */
  style?: string;
} = $props();

const t = $derived(words.t);
const time = $derived(Format.at(moment.startsAt));
const span = $derived(Format.slot(moment.startsAt, moment.endsAt));
</script>

<button
  type="button"
  style="{Hues.tint(moment.event.kind)}; {style}"
  class="{SHAPES[shape]} {moment.cancelled ? 'piece-off' : ''} {moment.draft ? 'piece-draft' : ''}
         {moment.over(now) ? 'piece-past' : ''} {moment.live(now) ? 'piece-live' : ''}"
  aria-label="{moment.title} · {span} · {kinds.label(moment.event.kind)}"
  onclick={(event) => onopen(moment, event.currentTarget.getBoundingClientRect())}
>
  {#if shape === Shape.Row}
    <!--
      The list has room for the whole clock, and gives it a column of its own so the times line up
      and the dots beside them make a second, straighter column. That alignment is the list.
    -->
    <span class="piece-clock">{moment.spanning ? t.calendar.spanning : span}</span>
  {/if}

  {#if DOTTED.includes(shape)}
    <span class="piece-dot"></span>
  {/if}

  <!-- A block has two lines and leads with the title; a chip has one and leads with when. -->
  {#if shape === Shape.Block}
    <span class="piece-title">{moment.title}</span>
    {#if clock}<span class="piece-clock truncate">{span}</span>{/if}
  {:else}
    {#if clock && shape !== Shape.Row}<span class="piece-clock">{time}</span>{/if}
    <span class="piece-title">{moment.title}</span>
  {/if}

  {#if shape === Shape.Row}
    <!--
      Three facts, three different voices, because three greys in a row is a sentence nobody wrote:
      the room is quiet prose, the kind is a label in its own colour, and the count is the badge
      this app already uses for a count everywhere else.
    -->
    <span class="ms-auto flex shrink-0 items-baseline gap-3">
      {#if moment.event.location}
        <span class="max-w-40 truncate text-xs text-muted">{moment.event.location}</span>
      {/if}
      <span class="piece-kind">{kinds.label(moment.event.kind)}</span>
      <Badge kind={moment.event.yours ?? 'going'}>
        {moment.event.yours ? t.answers[moment.event.yours] : t.events.going(moment.event.going)}
      </Badge>
    </span>
  {/if}
</button>
