<script lang="ts">
import { api, unwrap } from '../lib/api.ts';
import { Format } from '../lib/format.ts';
import { Query } from '../lib/query.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';

/**
 * What the club has coming up, for somebody who has not signed in.
 *
 * It reads the public listing, which is empty unless the club turned it on, and then renders
 * nothing at all: a heading over no events is a page that looks broken. The home page and the join
 * page both show it, so it lives here once.
 */
const listing = new Query(async () => unwrap(await api.public.events.$get()));

$effect(() => {
  listing.load();
});

const t = $derived(words.t);
</script>

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
