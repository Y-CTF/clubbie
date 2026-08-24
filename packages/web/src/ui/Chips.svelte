<script lang="ts" generics="T extends string">
/**
 * A row of mutually exclusive filters.
 *
 * They were plain words in a row before, which reads as a sentence rather than as a set of
 * choices: "all pending active alumni" is a phrase, and which one is selected was carried by a
 * shade of grey. A chip has an edge, so the selected one is obvious and the others are clearly
 * things to press.
 */
let {
  value = $bindable(),
  options,
  name,
  onchange,
}: {
  value: T;
  options: readonly T[];
  name: (option: T) => string;
  /** For a filter that is also a question: the report behind it starts again at its first page. */
  onchange?: ((value: T) => void) | undefined;
} = $props();
</script>

<div class="flex flex-wrap gap-1.5">
  {#each options as option (option)}
    <button
      type="button"
      class="rounded-full border px-3 py-1 text-xs transition-colors"
      class:border-accent={value === option}
      class:text-accent={value === option}
      class:border-line={value !== option}
      class:text-muted={value !== option}
      class:hover:border-muted={value !== option}
      aria-pressed={value === option}
      onclick={() => {
        value = option;
        onchange?.(option);
      }}
    >
      {name(option)}
    </button>
  {/each}
</div>
