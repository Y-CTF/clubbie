<script lang="ts">
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { club } from '../lib/club.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Button from '../ui/Button.svelte';
import Field from '../ui/Field.svelte';
import Input from '../ui/Input.svelte';

/**
 * The first run, which is a different list depending on who just arrived.
 *
 * The first member to sign in is an admin with an unnamed club, so what they are shown is the
 * club: nothing about clubbie should be compiled in, and that is only true if somebody is asked.
 * Everybody after them is joining a club that already exists, so what they are shown is
 * themselves: their name, how to be reached, and the season they are not on yet.
 *
 * It is one page rather than two because "what a new arrival is shown" is one idea, and which
 * steps it holds is a fact about them.
 */
const t = $derived(words.t);
const action = new Action();

/** Setting up beats being welcomed: an admin on an unnamed club is here to name it. */
const founding = $derived(session.can('club:manage') && !club.setup);

let name = $state('');
let done = $state(false);

/** Their own name, once the session has answered, so the box is not empty while it loads. */
$effect(() => {
  if (!name && session.member) name = session.member.name;
});

async function rename(): Promise<void> {
  const wanted = name.trim();
  if (!wanted || wanted === session.member?.name) return;

  await action.run(async () => unwrap(await api.me.$patch({ json: { name: wanted } })));
  await session.load();
}

/** The first run is over once they say so, whichever list they were shown. */
async function finish(): Promise<void> {
  await rename();
  const said = await action.run(async () => unwrap(await api.me.welcome.$post()));
  if (said) {
    await session.load();
    done = true;
    location.assign(Router.to(founding ? 'Settings' : 'Events'));
  }
}
</script>

<main class="mx-auto w-full max-w-[var(--width-club)] px-6">
  <section>
    <h1>{founding ? t.welcome.admin : t.welcome.member}</h1>
    <p class="mt-2 text-sm text-muted">{founding ? t.welcome.adminLead : t.welcome.memberLead}</p>

    {#if founding}
      <!--
        Links rather than a form. Every one of these is a page that already exists and does the
        thing properly; a wizard that reimplemented them would be a second settings page to keep
        in step with the first.
      -->
      <ol class="mt-6 flex flex-col gap-3">
        <li><a class="underline" href={Router.to('Settings')}>{t.welcome.identity}</a></li>
        <li><a class="underline" href={Router.to('Settings')}>{t.welcome.kinds}</a></li>
        <li><a class="underline" href={Router.to('Compose')}>{t.welcome.first}</a></li>
      </ol>
    {:else}
      <div class="mt-6 flex flex-col gap-5">
        <Field label={t.welcome.name} hint={t.welcome.nameHint}>
          <Input bind:value={name} autocomplete="name" />
        </Field>

        <div>
          <p class="text-xs text-muted">{t.welcome.notifications}</p>
          <a class="mt-1 inline-block text-sm underline" href={Router.to('Profile')}>
            {t.welcome.chat}
          </a>
        </div>

        {#if session.lapsed}
          <div>
            <Button disabled={action.busy} onclick={() => session.renew()}>{t.welcome.season}</Button>
          </div>
        {:else if session.season === null}
          <p class="text-xs text-muted">{t.welcome.seasonNone}</p>
        {/if}

        {#if session.waiting}
          <p class="text-xs text-muted">{t.welcome.waiting}</p>
        {/if}
      </div>
    {/if}

    <div class="mt-8 flex gap-2">
      <Button look="solid" disabled={action.busy || done} onclick={finish}>{t.welcome.done}</Button>
    </div>

    {#if action.error}
      <div class="mt-4"><Alert error={action.error} /></div>
    {/if}
  </section>
</main>
