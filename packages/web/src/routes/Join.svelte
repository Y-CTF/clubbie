<script lang="ts">
import { Login } from '@clubbie/auth';
import { Signin, Site } from '@clubbie/core';
import { api, unwrap } from '../lib/api.ts';
import { club } from '../lib/club.svelte.ts';
import { Query } from '../lib/query.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Chat from '../ui/Chat.svelte';
import Enrol from '../ui/Enrol.svelte';
import Mark from '../ui/Mark.svelte';
import { Marks } from '../ui/marks.ts';
import Panel from '../ui/Panel.svelte';

/**
 * Where the club's own website sends somebody who wants in.
 *
 * It is not the sign-in page with different words. That page is for a member who knows what this
 * is and wants past it; this one is for a stranger who has to be told what happens after they
 * type an address, because the next thing that happens to them is waiting for an organiser.
 */
const providers = new Query(async () => unwrap(await api.auth.providers.$get()));

const t = $derived(words.t);
const offered = $derived(providers.data?.providers ?? []);
const redirected = $derived(offered.filter((one) => one !== Signin.PROVIDER && one !== Login.NAME));
const chat = $derived(providers.data?.telegram ?? null);

$effect(() => {
  providers.load();
});
</script>

<main class="mx-auto w-full max-w-[var(--width-club)] px-6">
  <section>
    <h1 class="hero">{club.name}</h1>
    {#if club.tagline}<p class="mt-2 text-muted">{club.tagline}</p>{/if}

    {#if session.signedIn}
      <p class="mt-6 text-sm">{t.signIn.signedInAs(session.member?.name ?? '')}</p>
      <a
        href={Router.to(session.member?.welcomed ? 'Events' : 'Welcome')}
        class="mt-3 inline-block rounded-lg border border-accent bg-accent px-4 py-3 text-sm
               font-medium text-paper transition-opacity hover:opacity-90"
      >
        {t.signIn.enter}
      </a>
    {:else}
      <p class="mt-6 text-sm">{t.join.lead}</p>

      <!-- What happens next, because the next thing is waiting and nobody likes that unannounced. -->
      <ol class="mt-4 flex flex-col gap-2 text-sm text-muted">
        {#each t.join.steps as step, index (step)}
          <li class="flex gap-3">
            <span class="font-mono text-xs">{index + 1}</span>
            <span>{step}</span>
          </li>
        {/each}
      </ol>

      <div class="mt-6 max-w-sm">
        <Panel query={providers}>
          {#if offered.includes(Signin.PROVIDER)}
            <Enrol />
          {/if}

          {#if chat}
            <div class="mt-4 flex justify-start"><Chat username={chat} /></div>
          {/if}

          {#if redirected.length > 0}
            <ul class="mt-4 flex flex-wrap gap-3">
              {#each redirected as provider (provider)}
                <li>
                  <a
                    href={Site.Api.start(provider)}
                    data-external
                    aria-label={t.signIn.continueWith(Marks.label(provider))}
                    class="flex w-32 flex-col items-center gap-2 rounded-lg border border-line px-4 py-5
                           transition-colors hover:border-accent hover:text-accent"
                  >
                    <Mark {provider} />
                    <span class="text-sm font-medium">{Marks.label(provider)}</span>
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </Panel>
      </div>

      <p class="mt-4 text-xs text-muted">{t.join.already}</p>
    {/if}
  </section>
</main>
