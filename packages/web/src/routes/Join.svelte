<script lang="ts">
import { club } from '../lib/club.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Ways from '../ui/Ways.svelte';

/**
 * Where the club's own website sends somebody who wants in.
 *
 * It is not the sign-in page with different words. That page is for a member who knows what this
 * is and wants past it; this one is for a stranger, so the box comes first and the explanation
 * sits under it, answering the only question they actually have: what happens after I type this.
 */
const t = $derived(words.t);
</script>

<main class="mx-auto w-full max-w-[32rem] px-6 py-12">
  <h1 class="hero">{club.name}</h1>
  {#if club.tagline}<p class="mt-2 text-muted">{club.tagline}</p>{/if}

  {#if session.signedIn}
    <p class="mt-8 text-sm">{t.signIn.signedInAs(session.member?.name ?? '')}</p>
    <a
      href={Router.to(session.member?.welcomed ? 'Events' : 'Welcome')}
      class="mt-3 inline-block rounded-lg border border-accent bg-accent px-4 py-3 text-sm
             font-medium text-paper transition-opacity hover:opacity-90"
    >
      {t.signIn.enter}
    </a>
  {:else}
    <div class="mt-8"><Ways /></div>

    <!--
      Under the box rather than above it. Somebody who arrived from the club's own site has already
      decided to join; what they do not know is that a person has to let them in afterwards, and
      being told that now is better than wondering about it for a day.
    -->
    <section class="mt-10 border-t border-line pt-6">
      <h2 class="text-sm">{t.join.next}</h2>
      <p class="mt-2 text-sm leading-relaxed text-muted">{t.join.nextLead}</p>
    </section>

    {#if club.blurb}
      <p class="mt-6 text-sm leading-relaxed text-muted">{club.blurb}</p>
    {/if}
  {/if}
</main>
