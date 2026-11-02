<script lang="ts">
import { Member, type Role, Site, type Status } from '@clubbie/core';
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { Format } from '../lib/format.ts';
import { ask } from '../lib/ask.svelte.ts';
import { SvelteSet } from 'svelte/reactivity';
import { Query } from '../lib/query.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { toast } from '../lib/toast.svelte.ts';
import { Typed } from '../lib/typed.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Button from '../ui/Button.svelte';
import Icon from '../ui/Icon.svelte';
import Card from '../ui/Card.svelte';
import Chips from '../ui/Chips.svelte';
import EmptyState from '../ui/EmptyState.svelte';
import PageHeader from '../ui/PageHeader.svelte';
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

  const done = await action.run(async () => unwrap(await api.members.$patch({ json: { ids, ...patch } })), t.common.saved);
  if (done) picked = new SvelteSet();
  await members.load();
}

/**
 * One member's status or role.
 *
 * A status is easy to take back, so it is applied at once and the toast offers an undo: a dialog
 * for every tick is fifty clicks to admit a new term. A role can hand somebody the keys to the
 * club, so that still asks first.
 */
async function set(id: string, patch: { status?: Status; role?: Role }): Promise<void> {
  const before = roster.find((member) => member.id === id);

  if (patch.role !== undefined) {
    /** The row shows what the server holds, so a refused or cancelled change has to put it back. */
    if (!(await ask.put({ title: t.asks.role(before?.name ?? ''), detail: t.asks.roleWhy }))) {
      await members.load();
      return;
    }
  }

  const written = await action.run(
    async () => unwrap(await api.members[':id'].$patch({ param: { id }, json: patch })),
    patch.status === undefined ? t.common.saved : undefined,
  );

  if (written && patch.status !== undefined && before) {
    toast.say(t.common.saved, () => void revert(id, before.status));
  }
  await members.load();
}

async function revert(id: string, status: Status): Promise<void> {
  await action.run(
    async () => unwrap(await api.members[':id'].$patch({ param: { id }, json: { status } })),
    t.common.saved,
  );
  await members.load();
}
</script>

<PageHeader title={t.pages.Members} sub={t.members.count(roster.length)}>
  {#snippet actions()}
    {#if manage}
      <Button href={Site.Api.roster()} external>{t.common.csv}</Button>
    {/if}
  {/snippet}
</PageHeader>

<div class="stack-tight">
  <Search typed={search} placeholder={t.members.find} />
  <Chips
    bind:value={filter}
    options={[ALL, ...Member.STATUSES]}
    name={(option) => (option === ALL ? t.members.filterAll : t.statuses[option])}
  />

  {#if manage && filter === ALL && waiting > 0}
    <button type="button" class="btn inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-sm font-medium text-accent-text transition hover:opacity-80 active:scale-[0.98]" onclick={() => (filter = Member.INITIAL)}>
      {t.members.waiting(waiting)}<Icon name="forward" size={14} />
    </button>
  {/if}
</div>

{#if manage && chosen.length > 0}
  <!-- Sticky, above the phone's tab bar: the bar only exists while something is picked. -->
  <div
    class="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2
           rounded-xl border border-accent bg-paper px-4 py-3 text-sm shadow-pop lg:bottom-4"
  >
    <span class="me-auto font-medium">{t.members.picked(chosen.length)}</span>

    {#each Member.STATUSES as status (status)}
      <Button disabled={action.busy} onclick={() => bulk({ status })}>{t.statuses[status]}</Button>
    {/each}
    <Button disabled={action.busy} onclick={() => bulk({ role: Member.ADMIN })}>{t.roles.admin}</Button>
    <Button look="plain" onclick={() => all(false)}>{t.common.clear}</Button>
  </div>
{/if}

{#if action.error}<Alert error={action.error} />{/if}

<div aria-live="polite" class="stack-tight">
  <Panel query={members}>
    {#if roster.length === 0}
      <EmptyState title={t.members.empty} icon="users" />
    {:else}
      {#if manage && editable.length > 0}
        <label class="flex items-center gap-2 px-1 text-sm text-muted">
          <input type="checkbox" checked={every} onchange={(event) => all(event.currentTarget.checked)} />
          {t.members.pickAll}
        </label>
      {/if}

      <Card flush>
        {#each roster as member (member.id)}
          <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 text-sm">
            <span class="flex min-w-0 flex-1 basis-56 items-center gap-3">
              {#if manage && member.id !== session.member?.id}
                <input
                  type="checkbox"
                  checked={picked.has(member.id)}
                  aria-label={t.members.pick(member.name)}
                  onchange={(event) => pick(member.id, event.currentTarget.checked)}
                />
              {/if}

              <span class="min-w-0">
                <span class="flex flex-wrap items-baseline gap-x-2">
                  <Person id={member.id} name={member.name} />
                  {#if member.id === session.member?.id}
                    <span class="text-xs text-muted">{t.members.you}</span>
                  {/if}
                  {#if member.role === Member.ADMIN}
                    <span class="text-xs font-medium text-accent">{t.roles.admin}</span>
                  {/if}
                </span>

                <span class="block truncate text-xs text-muted">
                  {#if member.email}{member.email} · {/if}{t.member.since(Format.day(member.createdAt))}
                </span>
              </span>
            </span>

            {#if manage && member.id !== session.member?.id}
              <span class="flex shrink-0 gap-2">
                <span class="w-32">
                  <Select
                    small
                    value={member.status}
                    options={Member.STATUSES}
                    name={(one) => t.statuses[one]}
                    onchange={(status) => set(member.id, { status })}
                    label={t.members.status(member.name)}
                  />
                </span>
                <span class="w-32">
                  <Select
                    small
                    value={member.role}
                    options={Member.ROLES}
                    name={(one) => t.roles[one]}
                    onchange={(role) => set(member.id, { role })}
                    label={t.members.role(member.name)}
                  />
                </span>
              </span>
            {:else}
              <span class="shrink-0 text-sm text-muted">{t.statuses[member.status]}</span>
            {/if}
          </div>
        {/each}
      </Card>
    {/if}
  </Panel>
</div>
