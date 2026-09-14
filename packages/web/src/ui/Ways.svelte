<script lang="ts">
import { Login } from '@clubbie/auth';
import { Signin, Site } from '@clubbie/core';
import { api, unwrap } from '../lib/api.ts';
import { Query } from '../lib/query.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Chat from './Chat.svelte';
import Enrol from './Enrol.svelte';
import Mark from './Mark.svelte';
import { Marks } from './marks.ts';
import Panel from './Panel.svelte';

/**
 * Every way into this club, in one place.
 *
 * Both the sign-in page and the join page offer exactly the same doors, and they were the same
 * markup twice: a deployment that configured a new provider would have had to be told about it in
 * two files, and the second one is the one that gets forgotten.
 */
const t = $derived(words.t);
const providers = new Query(async () => unwrap(await api.auth.providers.$get()));

const offered = $derived(providers.data?.providers ?? []);
/** The ones that hand the browser somewhere else; the address is a form and the chat is a widget. */
const redirected = $derived(offered.filter((one) => one !== Signin.PROVIDER && one !== Login.NAME));
const chat = $derived(providers.data?.telegram ?? null);
const elsewhere = $derived(redirected.length > 0 || chat !== null);

$effect(() => {
  providers.load();
});
</script>

<Panel query={providers}>
  {#if offered.length === 0}
    <p class="text-sm text-muted">
      {t.signIn.noProvider}
      <span class="mt-1 block font-mono text-xs">{t.signIn.noProviderHelp}</span>
    </p>
  {:else}
    {#if offered.includes(Signin.PROVIDER)}
      <Enrol />
    {/if}

    {#if elsewhere}
      <div class="mt-6 flex items-center gap-3">
        <span class="h-px flex-1 bg-line"></span>
        <span class="text-xs text-muted">{t.signIn.email.other}</span>
        <span class="h-px flex-1 bg-line"></span>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        {#if chat}<Chat username={chat} />{/if}

        {#each redirected as provider (provider)}
          <a
            href={Site.Api.start(provider)}
            data-external
            aria-label={t.signIn.continueWith(Marks.label(provider))}
            class="flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm
                   transition-colors hover:border-accent hover:text-accent"
          >
            <Mark {provider} />
            <span class="font-medium">{Marks.label(provider)}</span>
          </a>
        {/each}
      </div>
    {/if}
  {/if}
</Panel>
