<script lang="ts">
import type { Snippet } from 'svelte';
import { club } from '../lib/club.svelte.ts';
import { type Name, Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import { palette } from '../lib/palette.svelte.ts';
import Icon, { type IconName } from './Icon.svelte';

/**
 * The frame around every signed-in page.
 *
 * One list of destinations, drawn twice: as a sidebar from 1024px up, where there is room for
 * the whole of it and its groups, and as a top bar plus a bottom tab bar below that, where the
 * thumb is. The tab bar carries the four places a member goes every day and a "more" sheet holds
 * the rest, so neither layout has a row of links that wraps.
 *
 * What a member may see is decided here and enforced by the API; hiding a link is manners, not
 * security.
 */
let { page, children }: { page: Name; children: Snippet } = $props();

interface Item {
  name: Name;
  icon: IconName;
}

const t = $derived(words.t);

/** The destinations everybody has. Seasons joins them only for a club that runs in seasons. */
const main = $derived<Item[]>([
  { name: 'Events', icon: 'calendar' },
  { name: 'Members', icon: 'users' },
  ...(session.season ? [{ name: 'Seasons' as const, icon: 'trophy' as const }] : []),
]);

/** What only a manager is offered. A club with no season yet still needs the way to make one. */
const admin = $derived<Item[]>([
  ...(session.can('season:manage') && !session.season
    ? [{ name: 'Seasons' as const, icon: 'trophy' as const }]
    : []),
  ...(session.can('club:manage')
    ? [
        { name: 'Jobs' as const, icon: 'clock' as const },
        { name: 'Settings' as const, icon: 'settings' as const },
      ]
    : []),
]);

/** The bottom bar: the daily places, the member's own page, and the sheet for everything else. */
const tabs = $derived<Item[]>([...main, { name: 'Profile', icon: 'user' }]);

let more = $state(false);
$effect(() => {
  page;
  more = false;
});

const external = (url: string) => !url.startsWith('/');
const initial = $derived((session.member?.name ?? '?').trim().charAt(0).toUpperCase());
</script>

{#snippet link(item: Item, tab = false)}
  {@const here = page === item.name}
  <a
    href={Router.to(item.name)}
    aria-current={here ? 'page' : undefined}
    class={tab
      ? 'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[0.7rem] font-medium transition-colors'
      : 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors'}
    class:text-accent-text={here}
    class:text-muted={!here}
    class:bg-accent-soft={here && !tab}
    class:hover:text-ink={!here}
    class:hover:bg-sunk={!here && !tab}
  >
    <Icon name={item.icon} size={tab ? 22 : 18} />
    <span class="truncate">{t.pages[item.name]}</span>
  </a>
{/snippet}

{#snippet extras(sheet: boolean)}
  {#each club.links as l (l.url)}
    <a
      href={l.url}
      data-external={external(l.url) ? true : undefined}
      rel={external(l.url) ? 'noopener noreferrer' : undefined}
      class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-sunk hover:text-ink"
      class:py-3={sheet}
    >
      <Icon name={external(l.url) ? 'external' : 'forward'} size={18} />
      <span class="truncate">{l.label}</span>
    </a>
  {/each}
{/snippet}

<a
  href="#content"
  class="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-paper focus:px-3 focus:py-2 focus:shadow-pop"
>
  {t.shell.skip}
</a>

<div class="lg:grid lg:min-h-screen lg:grid-cols-[15rem_minmax(0,1fr)]">
  <!-- Sidebar: from 1024px. Sticky rather than fixed, so the footer still ends the page. -->
  <aside class="sticky top-0 hidden h-screen flex-col gap-6 border-e border-line bg-sunk p-3 lg:flex">
    <a href={Router.to('Events')} class="flex items-center gap-3 rounded-lg px-3 py-2">
      {#if club.logo}
        <img src={club.logo} alt="" class="size-8 rounded-md object-contain" />
      {/if}
      <span class="min-w-0">
        <span class="block truncate font-semibold tracking-tight">{club.name}</span>
        {#if session.season}
          <span class="block truncate text-xs text-muted">{session.season.name}</span>
        {/if}
      </span>
    </a>

    <button
      type="button"
      onclick={() => palette.toggle()}
      class="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-muted transition-colors hover:border-muted hover:text-ink"
    >
      <Icon name="search" size={16} />
      <span class="flex-1 text-start">{t.shell.jump}</span>
      <kbd class="rounded border border-line px-1.5 text-xs">Ctrl K</kbd>
    </button>

    <nav aria-label={t.shell.menu} class="flex flex-1 flex-col gap-6 overflow-y-auto">
      <div class="flex flex-col gap-0.5">
        {#each main as item (item.name)}{@render link(item)}{/each}
      </div>

      {#if club.links.length}
        <div class="flex flex-col gap-0.5">
          <p class="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted">{t.shell.club}</p>
          {@render extras(false)}
        </div>
      {/if}

      {#if admin.length}
        <div class="flex flex-col gap-0.5">
          <p class="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted">{t.shell.admin}</p>
          {#each admin as item (item.name)}{@render link(item)}{/each}
        </div>
      {/if}
    </nav>

    <div class="flex items-center gap-1 border-t border-line pt-3">
      <a
        href={Router.to('Profile')}
        aria-current={page === 'Profile' ? 'page' : undefined}
        class="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-paper"
        class:bg-paper={page === 'Profile'}
      >
        <span class="grid size-8 shrink-0 place-content-center rounded-full bg-accent-soft text-sm font-semibold text-accent-text">{initial}</span>
        <span class="truncate">{session.member?.name}</span>
      </a>
      <button
        type="button"
        class="grid size-9 place-content-center rounded-lg text-muted transition-colors hover:bg-paper hover:text-ink"
        aria-label={t.shell.signOut}
        title={t.shell.signOut}
        onclick={() => session.signOut()}
      >
        <Icon name="out" size={18} />
      </button>
    </div>
  </aside>

  <div class="flex min-w-0 flex-col">
    <!-- Top bar: below 1024px, where the sidebar is not. -->
    <header class="sticky top-0 z-20 flex h-13 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur lg:hidden">
      <a href={Router.to('Events')} class="flex min-w-0 items-center gap-2">
        {#if club.logo}<img src={club.logo} alt="" class="size-7 rounded-md object-contain" />{/if}
        <span class="truncate font-semibold tracking-tight">{club.name}</span>
      </a>
      {#if session.season}
        <span class="ms-auto shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-muted">{session.season.name}</span>
      {/if}
    </header>

    <div id="content" class="flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-0">
      {@render children()}
    </div>
  </div>
</div>

<!-- Tab bar: the thumb's reach on a phone. Every target is at least 56 wide and 48 tall. -->
<nav
  aria-label={t.shell.menu}
  class="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
>
  {#each tabs as item (item.name)}{@render link(item, true)}{/each}
  <button
    type="button"
    aria-expanded={more}
    onclick={() => (more = !more)}
    class="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[0.7rem] font-medium text-muted transition-colors hover:text-ink"
    class:text-accent-text={more}
  >
    <Icon name="more" size={22} />
    <span>{t.shell.more}</span>
  </button>
</nav>

{#if more}
  <div class="fixed inset-0 z-40 lg:hidden">
    <button
      type="button"
      aria-label={t.shell.close}
      class="absolute inset-0 bg-black/45"
      onclick={() => (more = false)}
    ></button>
    <div class="sheet absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-paper p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-pop">
      <div class="mx-auto mb-2 h-1 w-9 rounded-full bg-line"></div>
      {#if admin.length}
        <p class="px-3 pt-1 pb-1 text-xs font-medium uppercase tracking-wider text-muted">{t.shell.admin}</p>
        {#each admin as item (item.name)}
          <a href={Router.to(item.name)} class="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-sunk">
            <Icon name={item.icon} size={18} />{t.pages[item.name]}
          </a>
        {/each}
      {/if}
      {#if club.links.length}
        <p class="px-3 pt-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted">{t.shell.club}</p>
        {@render extras(true)}
      {/if}
      <button
        type="button"
        class="mt-2 flex w-full items-center gap-3 rounded-lg border-t border-line px-3 py-3 text-sm text-muted hover:bg-sunk hover:text-ink"
        onclick={() => session.signOut()}
      >
        <Icon name="out" size={18} />{t.shell.signOut}
      </button>
    </div>
  </div>
{/if}
