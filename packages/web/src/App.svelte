<script lang="ts">
import { club } from './lib/club.svelte.ts';
import { Router } from './lib/router.svelte.ts';
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
import EmptyState from './ui/EmptyState.svelte';
import { look } from './ui/look.ts';
import Confirm from './ui/Confirm.svelte';
import Palette from './ui/Palette.svelte';
import Renew from './ui/Renew.svelte';
import Toasts from './ui/Toasts.svelte';
import Shell from './ui/Shell.svelte';

/**
 * The shell: navigation, and whichever page the router matched. A private route is not guarded
 * by hiding a link, it is guarded by the API refusing; what the shell does is send a signed-out
 * caller to the sign-in page rather than rendering a page that can only fail.
 */
const router = new Router();

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
<Toasts />
<Palette {router} />

{#snippet body()}
  {#if session.signedIn}<Renew />{/if}

  <!--
    Keyed on the page rather than on the path: a page that is only changing which event it is
    looking at should not be thrown away and animated back in, and a page that is genuinely a
    different page should.
  -->
  {#key page.name}
  <main class="rise mx-auto px-4 py-6 sm:px-6 lg:py-10">
    {#if session.loading}
      <div class="stack breathe" role="status" aria-label={t.common.loading}>
        <div class="h-7 w-1/3 rounded-md bg-sunk"></div>
        <div class="h-32 rounded-xl bg-sunk"></div>
      </div>
    {:else if page.name === 'Join'}
      <Join />
    {:else if page.name === 'Denied'}
      <Denied />
    {:else if locked}
      <Home />
    {:else if waiting}
      <EmptyState title={t.shell.waiting} body={t.shell.waitingWhy} icon="clock">
        <a href={Router.to('Profile')} class={look('quiet')}>{t.pages.Profile}</a>
      </EmptyState>
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
        <Settings {router} />
      {:else}
        <EmptyState title={t.shell.adminOnly} icon="settings" />
      {/if}
    {:else if page.name === 'Jobs'}
      {#if session.can('club:manage')}
        <Jobs {router} />
      {:else}
        <EmptyState title={t.shell.adminOnly} icon="settings" />
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
      <div class="mx-auto px-4 py-6 text-xs text-muted sm:px-6">{club.footer}</div>
    </footer>
  {/if}
{/snippet}

{#if session.signedIn}
  <Shell page={page.name}>{@render body()}</Shell>
{:else}
  <div class="min-h-screen">{@render body()}</div>
{/if}
