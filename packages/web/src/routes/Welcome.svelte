<script lang="ts">
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { club } from '../lib/club.svelte.ts';
import { Query } from '../lib/query.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Button from '../ui/Button.svelte';
import Input from '../ui/Input.svelte';

/**
 * The first run, which is a different list depending on who just arrived.
 *
 * The first member to sign in is an admin with an unnamed club, so what they are shown is the
 * club: nothing about one club is compiled in, and that is only true if somebody is asked.
 * Everybody after them is joining a club that already exists, so what they are shown is
 * themselves: what to call them, how to reach them, and the season they are not on yet.
 *
 * Every row knows whether it is already done, from the same data the rest of the app reads. That
 * is the whole point of the page: a checklist that cannot tell you what is left is a list of
 * links, and a member who linked their chat last week should not be asked to again.
 */
let { router }: { router: Router } = $props();

const t = $derived(words.t);
const action = new Action();

const chat = new Query(async () => unwrap(await api.me.link.$get()));
const listing = new Query(async () => unwrap(await api.events.$get({ query: { scope: 'all' } })));

/** Setting up beats being welcomed: an admin on an unnamed club is here to name it. */
const founding = $derived(session.can('club:manage') && !club.setup);

let name = $state('');
let touched = $state(false);

$effect(() => {
  chat.load();
});

$effect(() => {
  if (founding) listing.load();
});

/** Their own name, once the session has answered, so the box is never empty while it loads. */
$effect(() => {
  if (!touched && session.member) name = session.member.name;
});

/**
 * Enrolling by address leaves the address as the name, because that is all it was told. So "have
 * they said what to call them" is exactly "is their name still their address".
 */
const named = $derived(Boolean(session.member) && session.member?.name !== session.member?.email);

interface Step {
  readonly key: string;
  readonly label: string;
  readonly done: boolean;
}

const steps = $derived<Step[]>(
  founding
    ? [
        { key: 'identity', label: t.welcome.identity, done: club.setup },
        { key: 'first', label: t.welcome.first, done: (listing.data?.length ?? 0) > 0 },
      ]
    : [
        { key: 'name', label: t.welcome.name, done: named },
        { key: 'chat', label: t.welcome.chat, done: chat.data !== null },
        ...(session.season ? [{ key: 'season', label: t.welcome.season, done: session.renewed }] : []),
      ],
);

const left = $derived(steps.filter((step) => !step.done).length);

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
  if (!said) return;

  await session.load();
  router.go(founding ? 'Settings' : 'Events');
}
</script>

<main class="mx-auto w-full max-w-[34rem] px-6 py-10">
  <p class="text-sm text-muted">{club.name}</p>
  <h1 class="mt-1">{founding ? t.welcome.admin : t.welcome.member}</h1>
  <p class="mt-2 text-sm text-muted">{founding ? t.welcome.adminLead : t.welcome.memberLead}</p>

  <ul class="mt-8 flex flex-col">
    {#each steps as step (step.key)}
      <li class="flex gap-4 border-t border-line py-5 first:border-t-0 first:pt-0">
        <!--
          The marker is the state, not an ornament: filled once the row is genuinely done, so the
          list says what is left without a sentence underneath it saying so.
        -->
        <span
          class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border
                 {step.done ? 'border-accent bg-accent text-paper' : 'border-line'}"
          aria-hidden="true"
        >
          {#if step.done}
            <svg viewBox="0 0 12 12" class="size-3" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2.5 6.5 5 9l4.5-5.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          {/if}
        </span>

        <div class="min-w-0 flex-1">
          <p class="text-sm {step.done ? 'text-muted line-through' : ''}">{step.label}</p>

          {#if step.key === 'name'}
            <div class="mt-2">
              <Input
                bind:value={name}
                autocomplete="name"
                oninput={() => (touched = true)}
                aria-label={t.welcome.name}
              />
              <p class="mt-1 text-xs text-muted">{t.welcome.nameHint}</p>
            </div>
          {:else if step.key === 'chat' && !step.done}
            <a class="mt-2 inline-block text-sm text-accent" href={Router.to('Profile')}>
              {t.welcome.chatHow}
            </a>
          {:else if step.key === 'season' && !step.done}
            <div class="mt-2">
              <Button disabled={action.busy} onclick={() => session.renew()}>
                {session.season?.name ?? t.welcome.season}
              </Button>
            </div>
          {:else if step.key === 'identity'}
            <a class="mt-2 inline-block text-sm text-accent" href={Router.to('Settings')}>
              {t.welcome.identityHow}
            </a>
          {:else if step.key === 'first'}
            <a class="mt-2 inline-block text-sm text-accent" href={Router.to('Compose')}>
              {t.welcome.firstHow}
            </a>
          {/if}
        </div>
      </li>
    {/each}
  </ul>

  {#if session.waiting}
    <p class="mt-6 rounded-lg border border-line p-4 text-sm text-muted">{t.welcome.waiting}</p>
  {/if}

  <div class="mt-8 flex items-center gap-4">
    <Button look="solid" disabled={action.busy} onclick={finish}>
      {left === 0 ? t.welcome.done : t.welcome.skip}
    </Button>
    {#if left > 0}
      <p class="text-xs text-muted">{t.welcome.left(left)}</p>
    {/if}
  </div>

  {#if action.error}
    <div class="mt-4"><Alert error={action.error} /></div>
  {/if}
</main>
