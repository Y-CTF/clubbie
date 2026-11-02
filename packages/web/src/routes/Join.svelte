<script lang="ts">
import { club } from '../lib/club.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Button from '../ui/Button.svelte';
import Card from '../ui/Card.svelte';
import Upcoming from '../ui/Upcoming.svelte';
import Ways from '../ui/Ways.svelte';

/**
 * Where the club's own website sends somebody who wants in.
 *
 * It is not the sign-in page with different words. That page is for a member who knows what this
 * is and wants past it; this one is for a stranger, so the box comes first and the explanation
 * sits under it, answering the only question they actually have: what happens after I type this.
 *
 * What it says is the club's own terms: whether somebody lets you in afterwards and which
 * identities are accepted at all, both read from settings. It is the one page that can say so
 * before a stranger is turned away rather than after.
 */
const t = $derived(words.t);
</script>

<div class="stack-page mx-auto w-full max-w-[32rem] sm:py-6">
  <header class="stack-tight">
    <h1 class="hero">{club.name}</h1>
    {#if club.tagline}<p class="text-muted">{club.tagline}</p>{/if}
  </header>

  {#if session.signedIn}
    <div class="stack-tight">
      <p class="text-sm">{t.signIn.signedInAs(session.member?.name ?? '')}</p>
      <Button look="solid" field full href={Router.to(session.entry)}>{t.signIn.enter}</Button>
    </div>
  {:else}
    <Ways />

    <!--
      Under the box rather than above it. Somebody who arrived from the club's own site has already
      decided to join; what they do not know is whether a person has to let them in afterwards, and
      being told that now is better than wondering about it for a day.
    -->
    <Card>
      <div class="stack-tight">
        <h2>{t.join.next}</h2>
        <p class="text-sm leading-relaxed text-muted">{t.join.nextLead[club.admission]}</p>
      </div>

      {#if club.doors.length > 0}
        <div class="stack-tight">
          <h2>{t.access.heading}</h2>
          <p class="text-sm leading-relaxed text-muted">
            {t.join.doorsLead(club.doors.join(', '))}
          </p>
        </div>
      {/if}
    </Card>

    {#if club.blurb}
      <p class="text-sm leading-relaxed text-muted">{club.blurb}</p>
    {/if}
  {/if}

  <Upcoming />
</div>
