<script lang="ts">
import { club } from './lib/club.svelte.ts';
import { type Name, Router } from './lib/router.svelte.ts';
import { session } from './lib/session.svelte.ts';
import { words } from './lib/words/index.svelte.ts';
import Compose from './routes/Compose.svelte';
import Event from './routes/Event.svelte';
import Events from './routes/Events.svelte';
import Home from './routes/Home.svelte';
import Denied from './routes/Denied.svelte';
import Join from './routes/Join.svelte';
import Jobs from './routes/Jobs.svelte';
import Member from './routes/Member.svelte';
import Members from './routes/Members.svelte';
import Profile from './routes/Profile.svelte';
import Welcome from './routes/Welcome.svelte';
import Seasons from './routes/Seasons.svelte';
import Settings from './routes/Settings.svelte';
import Sheet from './routes/Sheet.svelte';
import Confirm from './ui/Confirm.svelte';
import Renew from './ui/Renew.svelte';

/**
 * The shell: navigation, and whichever page the router matched. A private route is not guarded
 * by hiding a link, it is guarded by the API refusing; what the shell does is send a signed-out
 * caller to the sign-in page rather than rendering a page that can only fail.
 */
const router = new Router();

/** The pages a signed-in member sees in the nav bar, in order. */
const NAV: Name[] = ['Events', 'Members', 'Profile'];

$effect(() => {
  session.load();
  club.load();
});

const t = $derived(words.t);

const page = $derived(router.current);
const locked = $derived(page.route.private && !session.loading && !session.signedIn);
/**
 * A member who is waiting to be admitted sees the card instead of a page they cannot use, with
 * one exception: their own profile, which `Ability` does grant them, and which is where they link
 * a chat and choose what the club may send them.
 */
const waiting = $derived(
  session.waiting && page.route.private && page.name !== 'Profile' && page.name !== 'Welcome',
);

/** The tab says where in the club you are, which is what a member with six tabs open needs. */
$effect(() => {
  document.title = club.name ? `${t.pages[page.name]} · ${club.name}` : t.pages[page.name];
});
</script>

<svelte:window onclick={router.intercept} />

<Confirm />

<div class="min-h-screen">
  {#if session.signedIn}
    <nav class="border-b border-line">
      <div class="mx-auto flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 text-sm">
        <a href={Router.to('Home')} class="font-semibold tracking-tight">{club.name}</a>

        <!--
          The club's year, where a member can always see which one they are in. It is a link to the
          rosters rather than a label, which is also what puts seasons in the navigation only for a
          club that runs in them: one that does not has no season, and nothing here appears.
        -->
        {#if session.season}
          <a
            href={Router.to('Seasons')}
            class="rounded-full border border-line px-2 py-0.5 text-xs text-muted
                   transition-colors hover:border-muted hover:text-ink"
            class:border-accent={page.name === 'Seasons'}
            class:text-accent={page.name === 'Seasons'}
          >
            {session.season.name}
          </a>
        {/if}

        {#each NAV as name (name)}
          <a
            href={Router.to(name)}
            class="text-muted hover:text-ink"
            class:text-ink={page.name === name}
            aria-current={page.name === name ? 'page' : undefined}
          >
            {t.pages[name]}
          </a>
        {/each}

        {#each club.links as link (link.url)}
          <!-- A club is not only this app: its wiki and its chat belong in the same row. -->
          <a
            href={link.url}
            data-external={link.url.startsWith('/') ? undefined : true}
            rel={link.url.startsWith('/') ? undefined : 'noopener noreferrer'}
            class="text-muted hover:text-ink"
          >
            {link.label}
          </a>
        {/each}

        <!-- An admin with no season yet still needs the way to make one. -->
        {#if session.can('season:manage') && !session.season}
          <a
            href={Router.to('Seasons')}
            class="text-muted hover:text-ink"
            class:text-ink={page.name === 'Seasons'}
            aria-current={page.name === 'Seasons' ? 'page' : undefined}
          >
            {t.pages.Seasons}
          </a>
        {/if}

        {#if session.can('club:manage')}
          <a
            href={Router.to('Jobs')}
            class="text-muted hover:text-ink"
            class:text-ink={page.name === 'Jobs'}
            aria-current={page.name === 'Jobs' ? 'page' : undefined}
          >
            {t.pages.Jobs}
          </a>

          <a
            href={Router.to('Settings')}
            class="text-muted hover:text-ink"
            class:text-ink={page.name === 'Settings'}
            aria-current={page.name === 'Settings' ? 'page' : undefined}
          >
            {t.pages.Settings}
          </a>
        {/if}

        <button type="button" class="ml-auto text-muted hover:text-ink" onclick={() => session.signOut()}>
          {t.shell.signOut}
        </button>
      </div>
    </nav>
  {/if}

  {#if session.signedIn}<Renew />{/if}

  <!--
    Keyed on the page rather than on the path: a page that is only changing which event it is
    looking at should not be thrown away and animated back in, and a page that is genuinely a
    different page should.
  -->
  {#key page.name}
  <main class="rise mx-auto px-6 py-10">
    {#if session.loading}
      <p class="text-sm text-muted">{t.common.loading}</p>
    {:else if page.name === 'Join'}
      <Join />
    {:else if page.name === 'Denied'}
      <Denied />
    {:else if locked}
      <Home />
    {:else if waiting}
      <div class="rounded-lg border border-line p-6 text-sm">
        <p class="font-medium">{t.shell.waiting}</p>
        <p class="mt-2 text-muted">{t.shell.waitingWhy}</p>
      </div>
    {:else if page.name === 'Events'}
      <Events {router} />
    {:else if page.name === 'Compose'}
      <Compose {router} at={page.query.at} />
    {:else if page.name === 'Edit'}
      <Compose id={page.params.id ?? ''} {router} />
    {:else if page.name === 'Repeat'}
      <Compose repeat={page.params.id ?? ''} {router} />
    {:else if page.name === 'Sheet'}
      <Sheet id={page.params.id ?? ''} />
    {:else if page.name === 'Event'}
      <Event id={page.params.id ?? ''} />
    {:else if page.name === 'Members'}
      <Members />
    {:else if page.name === 'Member'}
      <Member id={page.params.id ?? ''} />
    {:else if page.name === 'Seasons'}
      <Seasons />
    {:else if page.name === 'Settings'}
      {#if session.can('club:manage')}
        <Settings />
      {:else}
        <p class="text-sm text-muted">{t.shell.adminOnly}</p>
      {/if}
    {:else if page.name === 'Jobs'}
      {#if session.can('club:manage')}
        <Jobs {router} />
      {:else}
        <p class="text-sm text-muted">{t.shell.adminOnly}</p>
      {/if}
    {:else if page.name === 'Profile'}
      <Profile />
    {:else if page.name === 'Welcome'}
      <Welcome {router} />
    {:else}
      <Home />
    {/if}
  </main>
  {/key}

  {#if club.footer}
    <footer class="border-t border-line">
      <div class="mx-auto px-6 py-6 text-xs text-muted">{club.footer}</div>
    </footer>
  {/if}
</div>
