<script lang="ts" generics="T extends string">
/**
 * A menu of named things, drawn by this app rather than by the operating system.
 *
 * The native control was here first, for a real reason: on a phone it opens a wheel nothing in a
 * page can beat. What it cannot do is look like the rest of this app. Its list is the platform's
 * own, at the platform's size, in the platform's colours, and on a page whose corners, spacing,
 * greys and accent are all the club's, it is the one thing that says "form from 1998" the moment
 * it opens.
 *
 * So the menu is a listbox: a button that says what is chosen, and a list that behaves the way a
 * listbox is expected to. Arrow keys move, Home and End jump, typing a letter jumps to the option
 * starting with it, Enter chooses, Escape and a click elsewhere close without choosing, and focus
 * comes back to the button either way. The roles and `aria-activedescendant` are what make that
 * legible to a screen reader, which the native control gave us for free and this has to earn.
 */
let {
  value = $bindable(),
  options,
  name,
  empty,
  label,
  onchange,
  disabled = false,
  small = false,
}: {
  /** `''` only ever happens with `empty` set, which is what makes the field clearable. */
  value: T | '';
  options: readonly T[];
  /** What each value is called, in the reader's language. */
  name: (option: T) => string;
  /** The first entry when the field may be unset, as `['', 'the reader's own']`. */
  empty?: string | undefined;
  /** What the menu is for, when no visible `Field` label says so. */
  label?: string | undefined;
  /**
   * For a menu that is itself the action rather than part of a form: the row that changes a
   * member's status has nothing to save afterwards. A caller using this does not bind, so the
   * displayed value stays whatever the server last said until the caller reloads it.
   */
  onchange?: ((value: T) => void) | undefined;
  disabled?: boolean;
  /** In a row of a list rather than in a form: the height a roster row can carry. */
  small?: boolean;
} = $props();

/** Every choosable value, with the empty one first when the field may be cleared. */
const choices = $derived<(T | '')[]>(empty === undefined ? [...options] : ['', ...options]);
const shown = $derived(value === '' ? (empty ?? '') : name(value));

let open = $state(false);
let active = $state(0);
let button = $state<HTMLButtonElement | null>(null);
let list = $state<HTMLUListElement | null>(null);
const id = $props.id();

/** Typing letters jumps, the way a menu does. It is one word, and it forgets after a pause. */
let typed = '';
let last = 0;
const TYPING = 800;

function show(): void {
  if (disabled) return;
  active = Math.max(0, choices.indexOf(value));
  open = true;
}

function hide(): void {
  open = false;
  typed = '';
  button?.focus();
}

function choose(option: T | ''): void {
  value = option;
  if (option !== '') onchange?.(option);
  hide();
}

/**
 * A click anywhere else closes it, which is the one behaviour a listbox cannot do for itself.
 *
 * It listens in the capture phase, on purpose. Svelte delegates an element's `onclick` to the
 * root of the app, so a bubbling window listener and an option's own handler run in an order that
 * depends on where the app was mounted: capture runs before either, sees the target, and gets out
 * of the way of a click that is inside this menu.
 */
function outside(event: MouseEvent): void {
  if (!open) return;

  const target = event.target as Node | null;
  if (button?.contains(target ?? null) || list?.contains(target ?? null)) return;
  open = false;
}

function move(by: number): void {
  active = Math.min(choices.length - 1, Math.max(0, active + by));
}

function jump(char: string, at: number): void {
  const now = performance.now();
  typed = now - last > TYPING ? char : typed + char;
  last = now;

  const wanted = typed.toLowerCase();
  const named = (option: T | ''): string => (option === '' ? (empty ?? '') : name(option));
  /** From the one after the current, so pressing the same letter walks through its options. */
  const order = choices.map((_, index) => choices[(at + 1 + index) % choices.length] as T | '');
  const found = order.find((option) => named(option).toLowerCase().startsWith(wanted));
  if (found !== undefined) active = choices.indexOf(found);
}

function key(event: KeyboardEvent): void {
  if (!open) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      show();
    }
    return;
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      move(1);
      return;
    case 'ArrowUp':
      event.preventDefault();
      move(-1);
      return;
    case 'Home':
      event.preventDefault();
      active = 0;
      return;
    case 'End':
      event.preventDefault();
      active = choices.length - 1;
      return;
    case 'Enter':
    case ' ': {
      event.preventDefault();
      const option = choices[active];
      if (option !== undefined) choose(option);
      return;
    }
    case 'Escape':
    case 'Tab':
      hide();
      return;
    default:
      if (event.key.length === 1) jump(event.key, active);
  }
}

/** The highlighted option is kept in view, for a list longer than the box it opens into. */
$effect(() => {
  if (!open) return;
  list?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
});
</script>

<svelte:window onclickcapture={outside} />

<div class="relative">
  <button
    bind:this={button}
    type="button"
    {disabled}
    aria-label={label}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={open ? id : undefined}
    onclick={() => (open ? hide() : show())}
    onkeydown={key}
    class="flex w-full items-center justify-between gap-2 rounded-lg border bg-transparent text-start
           transition-colors disabled:cursor-not-allowed disabled:opacity-40
           {open ? 'border-accent' : 'border-line hover:border-muted'}
           {small ? 'py-1 ps-2 pe-2 text-xs' : 'px-3 py-2.5 text-base'}"
  >
    <span class="truncate {value === '' ? 'text-muted' : ''}">{shown}</span>
    <span class="chevron shrink-0" class:chevron-open={open}></span>
  </button>

  {#if open}
    <ul
      bind:this={list}
      {id}
      role="listbox"
      aria-label={label}
      aria-activedescendant="{id}-{active}"
      tabindex="-1"
      class="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-paper
             py-1 shadow-lg"
    >
      {#each choices as option, index (option)}
        <!--
          The keyboard for this listbox lives on the button that opens it, which is where focus
          stays and where the arrow keys, the typeahead and Enter are handled. An option is a
          mouse target and an `aria-activedescendant` target, not a second tab stop.
        -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id="{id}-{index}"
          role="option"
          aria-selected={option === value}
          data-active={index === active}
          class="cursor-pointer px-3 py-2 text-sm
                 {index === active ? 'bg-sunk text-ink' : 'text-muted'}
                 {option === value ? 'font-medium text-ink' : ''}"
          onmouseenter={() => (active = index)}
          onclick={(event) => {
            /** Nothing above this needs the click, and one of them would reopen the menu. */
            event.stopPropagation();
            choose(option);
          }}
        >
          {option === '' ? (empty ?? '') : name(option)}
        </li>
      {/each}
    </ul>
  {/if}
</div>
