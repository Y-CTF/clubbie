<script lang="ts">
import { Team } from '@clubbie/core';
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { ask } from '../lib/ask.svelte.ts';
import { Query } from '../lib/query.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from './Alert.svelte';
import Button from './Button.svelte';
import Input from './Input.svelte';
import Panel from './Panel.svelte';

/**
 * The teams on one event.
 *
 * Who may start one is the event's answer rather than this component's: the API refuses and says
 * why, and the form is only hidden when the event has already said no, so a member never presses
 * a button that was always going to be refused.
 */
let {
  id,
  teamsBy,
  size,
  open,
  manage,
}: {
  id: string;
  teamsBy: 'member' | 'organiser';
  size: number | null;
  /** Whether the event still takes answers, which is exactly while teams may change. */
  open: boolean;
  manage: boolean;
} = $props();

const t = $derived(words.t);
const action = new Action();
const teams = new Query(async () => unwrap(await api.events[':id'].teams.$get({ param: { id } })));

let name = $state('');

$effect(() => {
  void id;
  teams.load();
});

const mine = $derived(teams.data?.mine ?? null);
const may = $derived(open && Team.creatable(teamsBy, manage) && mine === null);

async function create(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!name.trim()) return;

  const made = await action.run(async () =>
    unwrap(await api.events[':id'].teams.$post({ param: { id }, json: { name: name.trim() } })),
  );
  if (made) {
    name = '';
    await teams.load();
  }
}

async function join(teamId: string): Promise<void> {
  const joined = await action.run(async () =>
    unwrap(await api.events[':id'].teams[':teamId'].join.$post({ param: { id, teamId } })),
  );
  if (joined) await teams.load();
}

async function leave(): Promise<void> {
  const left = await action.run(async () =>
    unwrap(await api.events[':id'].teams.mine.$delete({ param: { id } })),
  );
  if (left) await teams.load();
}

async function disband(teamId: string, named: string): Promise<void> {
  if (!(await ask.put({ title: t.teams.disbandAsk(named), danger: true }))) return;

  const gone = await action.run(async () =>
    unwrap(await api.events[':id'].teams[':teamId'].$delete({ param: { id, teamId } })),
  );
  if (gone) await teams.load();
}
</script>

<section class="mt-6">
  <h2>{t.teams.title}</h2>
  {#if size !== null}<p class="mt-1 text-xs text-muted">{t.teams.size(size)}</p>{/if}

  <Panel query={teams}>
    {#if teams.data?.teams.length}
      <ul class="mt-3 flex flex-col gap-2">
        {#each teams.data.teams as team (team.id)}
          {@const full = size !== null && team.members.length >= size}
          <li class="rounded-lg border border-line p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-sm font-medium">{team.name}</span>
              <span class="font-mono text-xs text-muted">
                {size === null ? team.members.length : `${team.members.length}/${size}`}
              </span>
            </div>

            <p class="mt-1 text-xs text-muted">
              {team.members.map((one) => one.name).join(', ') || t.teams.empty}
            </p>

            {#if open}
              <div class="mt-2 flex gap-2">
                {#if mine === team.id}
                  <Button disabled={action.busy} onclick={leave}>{t.teams.leave}</Button>
                {:else if mine === null && !full}
                  <Button disabled={action.busy} onclick={() => join(team.id)}>{t.teams.join}</Button>
                {/if}

                {#if manage || team.captainId === session.member?.id}
                  <Button disabled={action.busy} onclick={() => disband(team.id, team.name)}>
                    {t.teams.disband}
                  </Button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-3 text-sm text-muted">{t.teams.none}</p>
    {/if}

    {#if may}
      <form onsubmit={create} class="mt-3 flex gap-2">
        <Input bind:value={name} placeholder={t.teams.name} maxlength={Team.NAME} />
        <Button type="submit" field disabled={action.busy}>{t.teams.start}</Button>
      </form>
    {:else if !open}
      <p class="mt-3 text-xs text-muted">{t.teams.settled}</p>
    {/if}

    {#if action.error}
      <div class="mt-3"><Alert error={action.error} /></div>
    {/if}
  </Panel>
</section>
