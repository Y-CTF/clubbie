<script lang="ts">
import { Member, type Role, Site, type Status } from '@clubbie/core';
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { Format } from '../lib/format.ts';
import { ask } from '../lib/ask.svelte.ts';
import { SvelteSet } from 'svelte/reactivity';
import { Query } from '../lib/query.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { Typed } from '../lib/typed.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Button from '../ui/Button.svelte';
import Chips from '../ui/Chips.svelte';
import { look } from '../ui/look.ts';
import Panel from '../ui/Panel.svelte';
import Person from '../ui/Person.svelte';
import Search from '../ui/Search.svelte';
import Select from '../ui/Select.svelte';

/**
 * The roster: who is in the club, and for an admin, the two things about them that can change.
 *
 * Admitting somebody is a status change and nothing else, which is why there is no approve
 * button: the same control that admits a member retires them, and it shows the state it is in
 * rather than the verb it would perform. "Make alumni" next to "make admin" was two verbs in a
 * row that had to be read carefully to tell apart, on the screen where getting it wrong signs
 * somebody out of the club.
 */
const ALL = 'all' as const;
type Filter = Status | typeof ALL;

let filter = $state<Filter>(ALL);
const search = new Typed();
const action = new Action();

const members = new Query(async () =>
  unwrap(
    await api.members.$get({
      query: {
        ...(filter !== ALL && { status: filter }),
        ...(search.settled && { q: search.settled }),
      },
    }),
  ),
);

$effect(() => {
  void filter;
  void search.settled;
  members.load();
});

const t = $derived(words.t);
const manage = $derived(session.can('member:manage'));
const roster = $derived(members.data ?? []);
/** Somebody nobody has admitted is the one row on this page that is waiting for an answer. */
const waiting = $derived(roster.filter((member) => member.status === Member.INITIAL).length);

/**
 * Who is picked out for a bulk edit.
 *
 * It is a set of ids rather than a flag on each row, so a filter change or a reload does not lose
 * the selection and cannot leave a stale one behind: what is ticked is whatever is both selected
 * and still on screen.
 */
let picked = $state(new SvelteSet<string>());

const editable = $derived(roster.filter((member) => member.id !== session.member?.id));
const chosen = $derived(editable.filter((member) => picked.has(member.id)));
const every = $derived(editable.length > 0 && chosen.length === editable.length);

function pick(id: string, on: boolean): void {
  if (on) picked.add(id);
  else picked.delete(id);
}

function all(on: boolean): void {
  picked = new SvelteSet(on ? editable.map((member) => member.id) : []);
}

/** One question for the whole batch, naming the count: fifty confirmations is fifty clicks. */
async function bulk(patch: { status?: Status; role?: Role }): Promise<void> {
  const ids = chosen.map((member) => member.id);
  const said = patch.role === undefined
    ? t.asks.statusMany(ids.length, t.statuses[patch.status ?? Member.INITIAL])
    : t.asks.roleMany(ids.length, t.roles[patch.role]);
  if (!(await ask.put({ title: said, detail: patch.role === undefined ? undefined : t.asks.roleWhy }))) {
    return;
  }

  const done = await action.run(async () => unwrap(await api.members.$patch({ json: { ids, ...patch } })));
  if (done) picked = new SvelteSet();
  await members.load();
}

async function set(id: string, patch: { status?: Status; role?: Role }): Promise<void> {
  const who = roster.find((member) => member.id === id)?.name ?? '';
  const question =
    patch.role === undefined
      ? { title: t.asks.status(who, t.statuses[patch.status ?? Member.INITIAL]) }
      : { title: t.asks.role(who), detail: t.asks.roleWhy };

  /** The row shows what the server holds, so a refused or cancelled change has to put it back. */
  if (!(await ask.put(question))) {
    await members.load();
    return;
  }

  await action.run(async () => unwrap(await api.members[':id'].$patch({ param: { id }, json: patch })));
  await members.load();
}
</script>

<header class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
  <h1 class="font-semibold">
    {t.pages.Members}
    <span class="ml-2 text-sm font-normal text-muted">{t.members.count(roster.length)}</span>
  </h1>

  {#if manage}
    <a href={Site.Api.roster()} data-external class={look('plain')}>{t.common.csv}</a>
  {/if}
</header>

<div class="mt-4 grid gap-3">
  <Search typed={search} placeholder={t.members.find} />
  <Chips
    bind:value={filter}
    options={[ALL, ...Member.STATUSES]}
    name={(option) => (option === ALL ? t.members.filterAll : t.statuses[option])}
  />

  {#if manage && filter === ALL && waiting > 0}
    <button type="button" class="text-left text-xs text-accent" onclick={() => (filter = Member.INITIAL)}>
      {t.members.waiting(waiting)}
    </button>
  {/if}
</div>

{#if manage && chosen.length > 0}
  <!-- The bar only exists while something is picked, so the page is not permanently half-toolbar. -->
  <div
    class="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-sunk px-3 py-2 text-sm"
  >
    <span class="me-auto">{t.members.picked(chosen.length)}</span>

    {#each Member.STATUSES as status (status)}
      <Button disabled={action.busy} onclick={() => bulk({ status })}>{t.statuses[status]}</Button>
    {/each}
    <Button disabled={action.busy} onclick={() => bulk({ role: 'admin' })}>{t.roles.admin}</Button>
    <Button look="plain" onclick={() => all(false)}>{t.common.clear}</Button>
  </div>
{/if}

{#if action.error}<div class="mt-4"><Alert error={action.error} /></div>{/if}

<div aria-live="polite">
  <Panel query={members}>
    {#if manage && editable.length > 0}
      <label class="mt-6 flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={every} onchange={(event) => all(event.currentTarget.checked)} />
        {t.members.pickAll}
      </label>
    {/if}

    <ul class="mt-3 divide-y divide-line">
      {#each roster as member (member.id)}
        <li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 text-sm">
          <span class="flex min-w-0 flex-1 items-start gap-3">
            {#if manage && member.id !== session.member?.id}
              <input
                type="checkbox"
                class="mt-1"
                checked={picked.has(member.id)}
                aria-label={t.members.pick(member.name)}
                onchange={(event) => pick(member.id, event.currentTarget.checked)}
              />
            {/if}

            <span class="min-w-0">
              <Person id={member.id} name={member.name} />
            {#if member.id === session.member?.id}
              <span class="ml-2 text-xs text-muted">{t.members.you}</span>
            {/if}
            {#if member.role === 'admin'}
              <span class="ml-2 text-xs text-accent">{t.roles.admin}</span>
            {/if}

              <span class="mt-0.5 block truncate text-xs text-muted">
                {#if member.email}{member.email} · {/if}{t.member.since(Format.day(member.createdAt))}
              </span>
            </span>
          </span>

          {#if manage && member.id !== session.member?.id}
            <span class="flex shrink-0 gap-2">
              <Select
                small
                value={member.status}
                options={Member.STATUSES}
                name={(one) => t.statuses[one]}
                onchange={(status) => set(member.id, { status })}
                label={t.members.status(member.name)}
              />
              <Select
                small
                value={member.role}
                options={Member.ROLES}
                name={(one) => t.roles[one]}
                onchange={(role) => set(member.id, { role })}
                label={t.members.role(member.name)}
              />
            </span>
          {:else}
            <span class="shrink-0 text-xs text-muted">{t.statuses[member.status]}</span>
          {/if}
        </li>
      {/each}
    </ul>

    {#if roster.length === 0}
      <p class="mt-6 text-sm text-muted">{t.members.empty}</p>
    {/if}
  </Panel>
</div>
