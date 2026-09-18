<script lang="ts">
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { ask } from '../lib/ask.svelte.ts';
import { Copy } from '../lib/copy.svelte.ts';
import { club } from '../lib/club.svelte.ts';
import { Format } from '../lib/format.ts';
import { Query } from '../lib/query.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Button from '../ui/Button.svelte';
import Field from '../ui/Field.svelte';
import Input from '../ui/Input.svelte';
import Panel from '../ui/Panel.svelte';
import Subscribe from '../ui/calendar/Subscribe.svelte';

/**
 * A member's own page: what the club knows about them, how it may reach them, the calendar they
 * can subscribe to, and the code that links their Telegram chat.
 */
const link = new Query(async () => unwrap(await api.me.link.$get()));
const prefs = new Query(async () => unwrap(await api.me.notifications.$get()));
/** Which bot to send a code to. A linking code is useless without the name of who takes it. */
const ways = new Query(async () => unwrap(await api.auth.providers.$get()));
const action = new Action();

/** The bot this deployment runs, or null when it runs none and there is nothing to link. */
const bot = $derived(ways.data?.telegram ?? null);

let code = $state<{ token: string; expiresAt: string } | null>(null);
/** A one-off link into the club's group. Not kept: it is worth one seat, and only for an hour. */
let invite = $state<string | null>(null);

/**
 * Copying is the whole interaction: the member is holding a phone in the other hand, and retyping
 * a random token into a chat is how a linking code gets typed wrong three times.
 */
const copy = new Copy();

const t = $derived(words.t);

/** Every notice a member may switch off, with the sentence that says what switching it off means. */
const SWITCHES = ['announcements', 'reminders', 'telegram', 'email'] as const;

const SAYS: Record<(typeof SWITCHES)[number], () => string> = {
  announcements: () => t.profile.announcements,
  reminders: () => t.profile.reminders,
  telegram: () => t.profile.reachTelegram,
  email: () => t.profile.reachEmail,
};

$effect(() => {
  link.load();
  prefs.load();
  ways.load();
});

/**
 * Their own name, as the box holds it. Seeded from what the club calls them today rather than
 * left blank, and seeded in an effect because the session is still loading when this page mounts.
 */
let named = $state('');

$effect(() => {
  if (named === '' && session.member) named = session.member.name;
});

async function rename(): Promise<void> {
  const name = named.trim();
  if (name === '' || name === session.member?.name) return;

  if (await action.run(async () => unwrap(await api.me.$patch({ json: { name } })))) {
    await session.load();
    named = session.member?.name ?? name;
  }
}

async function issue(): Promise<void> {
  await action.run(async () => {
    code = await unwrap(await api.me.link.$post());
  });
}

async function join(): Promise<void> {
  const made = await action.run(async () => unwrap(await api.me.group.$post()));
  if (made) invite = made.url;
}

async function unlink(): Promise<void> {
  if (!(await ask.put({ title: words.t.asks.unlink, detail: words.t.asks.unlinkWhy, danger: true }))) return;

  if (await action.run(async () => unwrap(await api.me.link.$delete()))) {
    code = null;
    await link.load();
  }
}

async function hide(hidden: boolean): Promise<void> {
  if (await action.run(async () => unwrap(await api.me.$patch({ json: { hidden } })))) {
    await session.load();
  }
}

/** Refetched whether or not the write went through: a refused toggle must not stay flipped. */
async function toggle(key: (typeof SWITCHES)[number], on: boolean): Promise<void> {
  await action.run(async () => unwrap(await api.me.notifications.$patch({ json: { [key]: on } })));
  await prefs.load();
}
</script>

<h1 class="font-semibold">{t.pages.Profile}</h1>

{#if session.member}
  {@const member = session.member}
  <dl class="mt-6 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
    <dt class="text-muted">{t.profile.email}</dt>
    <dd class="font-mono text-xs">{member.email}</dd>
    <dt class="text-muted">{t.profile.role}</dt>
    <dd>{t.roles[member.role]} · {t.statuses[member.status]}</dd>
    <dt class="text-muted">{t.profile.since}</dt>
    <dd>{Format.day(member.createdAt)}</dd>
  </dl>

  <div class="mt-6">
    <Field label={t.profile.rename} hint={t.profile.renameHint}>
      <div class="flex flex-wrap items-center gap-2">
        <div class="min-w-0 flex-1"><Input bind:value={named} disabled={action.busy} /></div>
        <Button field disabled={action.busy || named.trim() === '' || named.trim() === member.name} onclick={rename}>
          {t.common.save}
        </Button>
      </div>
    </Field>
  </div>

  <div class="mt-6">
    <Button disabled={action.busy} onclick={() => hide(!member.hidden)}>
      {member.hidden ? t.profile.show : t.profile.hide}
    </Button>
  </div>
{/if}

{#if action.error}<div class="mt-6"><Alert error={action.error} /></div>{/if}

<section class="mt-10">
  <h2 class="font-medium">{t.profile.notices}</h2>

  <Panel query={prefs}>
    <ul class="mt-3 grid gap-2 text-sm">
      {#each SWITCHES as option (option)}
        <li>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.data?.[option] ?? true}
              disabled={action.busy}
              onchange={(event) => toggle(option, event.currentTarget.checked)}
            />
            {SAYS[option]()}
          </label>
        </li>
      {/each}
    </ul>
    <p class="mt-2 text-xs text-muted">{t.profile.always}</p>
  </Panel>
</section>

<section class="mt-10">
  <h2 class="font-medium">{t.profile.calendar}</h2>

  <div class="mt-2"><Subscribe /></div>
</section>

<section class="mt-10">
  <h2 class="font-medium">{t.profile.telegramHeading}</h2>

  <Panel query={link}>
    {#if link.data}
      <p class="mt-2 text-sm text-muted">
        {t.profile.linked(link.data.username, Format.day(link.data.linkedAt))}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <Button disabled={action.busy} onclick={unlink}>{t.profile.unlink}</Button>
        {#if club.group}
          <Button disabled={action.busy} onclick={join}>{t.profile.group}</Button>
        {/if}
      </div>

      {#if invite}
        <p class="mt-3 text-sm">
          <a href={invite} target="_blank" rel="noopener" class="text-accent">{t.profile.groupOpen}</a>
          <span class="mt-1 block text-xs text-muted">{t.profile.groupOnce}</span>
        </p>
      {/if}
    {:else if code}
      {@const message = `/link ${code.token}`}
      <p class="mt-2 text-sm text-muted">{bot ? t.profile.linkBot(bot) : t.profile.linkSend}</p>

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <code
          class="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-sunk px-3 py-2.5
                 font-mono text-sm select-all"
        >
          {message}
        </code>
        <Button field onclick={() => copy.put(message)}>
          {copy.done ? t.common.copied : t.common.copy}
        </Button>
      </div>

      <!--
        The chat, opened with the code already in it. `?start=<code>` is what Telegram turns into
        `/start <code>`, which the bot answers with the same handler as `/link`, so the member
        taps once instead of copying a token into a search box and finding the wrong bot.
      -->
      {#if bot}
        <p class="mt-3">
          <a
            href={`https://t.me/${bot}?start=${encodeURIComponent(code.token)}`}
            target="_blank"
            rel="noopener"
            class="text-accent">{t.profile.linkOpen}</a
          >
        </p>
      {/if}

      <p class="mt-2 text-xs text-muted">{t.profile.linkStep(Format.since(code.expiresAt))}</p>
    {:else if bot}
      <div class="mt-3">
        <Button disabled={action.busy} onclick={issue}>{t.profile.getCode}</Button>
      </div>
    {:else}
      <p class="mt-2 text-sm text-muted">{t.profile.noBot}</p>
    {/if}
  </Panel>
</section>
