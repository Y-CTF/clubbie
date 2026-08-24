<script lang="ts">
import type { Range } from '@clubbie/core';

/**
 * A measure, as a slider and as a number.
 *
 * The slider is for choosing: "a bit rounder than that" is a gesture, not an arithmetic problem.
 * The box beside it is for saying exactly what you mean, because a slider cannot be typed into, a
 * committee copying last term's settings has a number written down, and a track two hundred
 * pixels wide cannot offer three hundred and sixty degrees one at a time.
 *
 * Both are the same value and both obey the same step: anything typed is clamped to the range and
 * snapped to the step, so the two controls can never disagree about what is stored.
 */
let {
  value = $bindable(),
  range,
  unit = '',
  label,
}: {
  value: number;
  range: Range;
  /** What the number is in, if it is in anything: `px`, `%`, `h`. */
  unit?: string;
  /** What the measure is, for the box, when no visible `Field` label carries it. */
  label?: string | undefined;
} = $props();

/**
 * The marks under the track, when there are few enough to read.
 *
 * They are elements rather than a repeating gradient painted on the track. A gradient is measured
 * across the whole width, and a thumb's centre only travels from half a thumb in to half a thumb
 * from the end, so every mark sat slightly off the position it claimed to name. These are placed
 * on that travel, which is the only line the numbers actually live on.
 */
const steps = $derived(Math.round((range.max - range.min) / range.step));
const marks = $derived(steps > 1 && steps <= 12 ? steps : 0);
/** Half the thumb, in the same unit `app.css` sizes it with, so the two cannot drift apart. */
const THUMB = '0.5rem';

/** What a typed number becomes: inside the range, and on the step rather than between two. */
function snap(given: number): number {
  if (!Number.isFinite(given)) return value;

  const stepped = range.min + Math.round((given - range.min) / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, stepped));
}
</script>

<span class="flex items-center gap-3">
  <span class="relative flex-1 {marks > 0 ? 'pb-2.5' : ''}">
    <input
      type="range"
      bind:value
      min={range.min}
      max={range.max}
      step={range.step}
      aria-label={label}
      class="scale-club block w-full"
    />

    {#if marks > 0}
      <span class="pointer-events-none absolute inset-x-0 bottom-0.5 block" aria-hidden="true">
        {#each Array.from({ length: marks + 1 }, (_, index) => index) as index (index)}
          <span
            class="absolute size-[3px] -translate-x-1/2 rounded-full bg-line"
            style="left: calc({THUMB} + (100% - {THUMB} * 2) * {index / marks})"
          ></span>
        {/each}
      </span>
    {/if}
  </span>

  <span class="flex shrink-0 items-center gap-1">
    <input
      type="number"
      {value}
      min={range.min}
      max={range.max}
      step={range.step}
      aria-label={label}
      onchange={(event) => (value = snap(event.currentTarget.valueAsNumber))}
      class="w-16 rounded-lg border border-line bg-transparent px-2 py-1 text-end font-mono text-xs
             transition-colors hover:border-muted"
    />
    {#if unit}<span class="w-3 font-mono text-xs text-muted">{unit}</span>{/if}
  </span>
</span>
