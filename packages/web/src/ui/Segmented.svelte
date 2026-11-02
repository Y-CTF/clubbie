<script lang="ts" generics="T extends string">
/**
 * A set of mutually exclusive choices drawn as one control: the selected segment is raised on a
 * recessed track. It is for a *view* (week, month, list), where the choices are a setting of the
 * same page; `Chips` stays for filters, where "none selected" is a real answer.
 */
let {
  value,
  options,
  name,
  title,
  onselect,
}: {
  value: T;
  options: readonly T[];
  name: (option: T) => string;
  title?: (option: T) => string;
  onselect: (option: T) => void;
} = $props();
</script>

<div class="inline-flex rounded-lg bg-sunk p-0.5" role="group">
  {#each options as option (option)}
    <button
      type="button"
      aria-pressed={value === option}
      title={title?.(option)}
      onclick={() => onselect(option)}
      class="btn h-8 rounded-md px-3 text-sm font-medium transition-colors
             {value === option ? 'bg-paper text-ink shadow-sm' : 'text-muted hover:text-ink'}"
    >
      {name(option)}
    </button>
  {/each}
</div>
