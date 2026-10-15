<script lang="ts">
import { club } from '../lib/club.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Upcoming from '../ui/Upcoming.svelte';
import Ways from '../ui/Ways.svelte';

/**
 * The way in, and the shop window around it.
 *
 * It is the only page most people will ever see: a member arriving at a link, a prospective member
 * sent by a friend, somebody checking whether the club still meets. So it says who the club is
 * before it asks anybody to prove who they are, and it says what is coming up without an account.
 *
 * Which ways in this deployment offers is `Ways`; the events are `Upcoming`.
 */
const t = $derived(words.t);
</script>

<div class="-mx-6 -mt-10">
  {#if club.banner}
    <div class="relative h-48 overflow-hidden sm:h-64">
      <img src={club.banner} alt="" class="h-full w-full object-cover" />
      <!-- The heading sits on the image, so the image needs to fade into the page under it. -->
      <div class="absolute inset-0 bg-gradient-to-t from-paper via-paper/40 to-transparent"></div>
    </div>
  {/if}

  <section class="mx-auto max-w-md px-6 text-center {club.banner ? '-mt-16' : 'pt-16'}">
    {#if club.logo}
      <img
        src={club.logo}
        alt=""
        class="mx-auto size-20 rounded-lg border border-line bg-paper object-contain p-2 shadow-sm"
      />
    {/if}

    <h1 class="hero mt-5 font-semibold tracking-tight">{club.name}</h1>
    <p class="mt-2 text-muted text-balance">{club.tagline ?? t.signIn.tagline}</p>

    {#if club.blurb}
      <p class="mx-auto mt-5 max-w-prose text-sm leading-relaxed text-muted whitespace-pre-line">
        {club.blurb}
      </p>
    {/if}

    <div class="mt-8">
      {#if session.signedIn}
        <!-- Already in: the way on, not the way in. -->
        <a
          href={Router.to(session.entry)}
          class="block rounded-lg border border-accent bg-accent px-4 py-3 text-sm font-medium
                 text-paper transition-opacity hover:opacity-90"
        >
          {t.signIn.enter}
        </a>
      {:else}
        <div class="mx-auto max-w-sm text-start"><Ways /></div>
      {/if}
    </div>

    {#if session.signedIn}
      <p class="mt-6 text-sm text-muted">{t.signIn.signedInAs(session.member?.name ?? '')}</p>
    {/if}
  </section>
</div>

<Upcoming />
