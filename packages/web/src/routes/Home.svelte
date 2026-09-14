<script lang="ts">

import { api, unwrap } from '../lib/api.ts';
import { club } from '../lib/club.svelte.ts';
import { Format } from '../lib/format.ts';
import { Query } from '../lib/query.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Panel from '../ui/Panel.svelte';
import Ways from '../ui/Ways.svelte';

/**
 * The way in, and the shop window around it.
 *
 * It is the only page most people will ever see: a member arriving at a link, a prospective member
 * sent by a friend, somebody checking whether the club still meets. So it says who the club is
 * before it asks anybody to prove who they are, and it says what is coming up without an account.
 *
 * Which ways in this deployment offers is `Ways`; the events come from the public listing, which
 * is empty unless the club turned it on.
 */
const listing = new Query(async () => unwrap(await api.public.events.$get()));

$effect(() => {
  listing.load();
});

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
          href={Router.to('Events')}
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

{#if listing.data?.events.length}
  <section class="mx-auto mt-14 max-w-md">
    <h2 class="font-medium">{t.signIn.upcoming}</h2>

    <ul class="mt-3 grid gap-2">
      {#each listing.data.events as event (event.id)}
        <li>
          <!--
            A member can open the evening; a stranger cannot, because every event page is private.
            So the card is a link for one and plain text for the other, rather than a link that
            would bounce them straight back here.
          -->
          <svelte:element
            this={session.signedIn ? 'a' : 'div'}
            href={session.signedIn ? Router.to('Event', { id: event.id }) : undefined}
            class="block rounded-lg border border-line p-4 {session.signedIn
              ? 'transition-colors hover:border-accent'
              : ''}"
          >
            <div class="flex items-baseline justify-between gap-3">
              <span class="font-medium">{event.title}</span>
              <span class="shrink-0 font-mono text-xs text-muted">{Format.day(event.startsAt)}</span>
            </div>
            <p class="mt-1 text-xs text-muted">
              {event.kind}{event.location ? ` · ${event.location}` : ''}
            </p>
          </svelte:element>
        </li>
      {/each}
    </ul>
  </section>
{/if}
