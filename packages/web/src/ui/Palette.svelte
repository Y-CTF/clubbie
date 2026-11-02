<script lang="ts">
import { club } from '../lib/club.svelte.ts';
import { palette } from '../lib/palette.svelte.ts';
import type { Name, Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Icon, { type IconName } from './Icon.svelte';

/**
 * Jump to anywhere from the keyboard.
 *
 * A short list, filtered as you type, driven by arrows and Enter. It lists what the navigation
 * lists (and what this member may open), plus the one action people reach for most, so an
 * organiser never has to find the "new" button.
 */
interface Command {
  label: string;
  icon: IconName;
  go: () => void;
}

let { router }: { router: Router } = $props();

const t = $derived(words.t);
let term = $state('');
let active = $state(0);
let input = $state<HTMLInputElement | null>(null);

const page = (name: Name, icon: IconName): Command => ({
  label: t.pages[name],
  icon,
  go: () => router.go(name),
});

const commands = $derived<Command[]>([
  page('Events', 'calendar'),
  ...(session.can('event:create') ? [page('Compose', 'plus')] : []),
  page('Members', 'users'),
  ...(session.season || session.can('season:manage') ? [page('Seasons', 'trophy')] : []),
  page('Profile', 'user'),
  ...(session.can('club:manage') ? [page('Jobs', 'clock'), page('Settings', 'settings')] : []),
  ...club.links.map((link) => ({
    label: link.label,
    icon: 'external' as const,
    go: () => window.open(link.url, link.url.startsWith('/') ? '_self' : '_blank', 'noopener'),
  })),
  { label: t.shell.signOut, icon: 'out', go: () => void session.signOut() },
]);

const shown = $derived(
  commands.filter((one) => one.label.toLowerCase().includes(term.trim().toLowerCase())),
);

$effect(() => {
  if (palette.open) {
    term = '';
    active = 0;
    queueMicrotask(() => input?.focus());
  }
});

$effect(() => {
  term;
  active = 0;
});

function run(command: Command | undefined): void {
  if (!command) return;
  palette.open = false;
  command.go();
}

function key(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') active = Math.min(shown.length - 1, active + 1);
  else if (event.key === 'ArrowUp') active = Math.max(0, active - 1);
  else if (event.key === 'Enter') run(shown[active]);
  else if (event.key === 'Escape') palette.open = false;
  else return;
  event.preventDefault();
}
</script>

<svelte:window
  onkeydown={(event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && session.signedIn) {
      event.preventDefault();
      palette.toggle();
    }
  }}
/>

{#if palette.open && session.signedIn}
  <div class="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
    <button
      type="button"
      aria-label={t.shell.close}
      class="absolute inset-0 bg-black/45"
      onclick={() => (palette.open = false)}
    ></button>

    <div role="dialog" aria-label={t.shell.jump} class="pop relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-paper shadow-pop">
      <div class="flex items-center gap-3 border-b border-line px-4">
        <span class="text-muted"><Icon name="search" size={18} /></span>
        <input
          bind:this={input}
          bind:value={term}
          onkeydown={key}
          placeholder={t.shell.jump}
          aria-label={t.shell.jump}
          autocomplete="off"
          spellcheck="false"
          class="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted focus-visible:border-transparent focus-visible:shadow-none"
        />
      </div>

      <ul class="max-h-80 overflow-y-auto p-1.5" role="listbox">
        {#each shown as command, index (command.label)}
          <li role="option" aria-selected={index === active}>
            <button
              type="button"
              onmouseenter={() => (active = index)}
              onclick={() => run(command)}
              class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm
                     {index === active ? 'bg-sunk text-ink' : 'text-muted'}"
            >
              <Icon name={command.icon} size={18} />{command.label}
            </button>
          </li>
        {:else}
          <li class="px-3 py-6 text-center text-sm text-muted">{t.shell.nothing}</li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
