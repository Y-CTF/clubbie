<script lang="ts">
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { ask } from '../lib/ask.svelte.ts';
import { Format } from '../lib/format.ts';
import { Query } from '../lib/query.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Button from '../ui/Button.svelte';
import Field from '../ui/Field.svelte';
import Input from '../ui/Input.svelte';
import Panel from '../ui/Panel.svelte';
import Person from '../ui/Person.svelte';

/**
 * Seasons, their rosters, and the one act that matters in September: carrying last year's active
 * members into this year's season rather than asking sixty people to renew by hand.
 *
 * A season *is* its roster, so the open one arrives with its roster already open. It used to be a
 * list of date ranges with the people hidden behind a button on each row, which is a page about
 * the least interesting half of the thing it is about.
 */
const seasons = new Query(async () => unwrap(await api.seasons.$get()));
const action = new Action();
const t = $derived(words.t);

let open = $state<string | null>(null);
let composing = $state(false);
/** So the open season opens once, and a member who closed it is not reopened on every load. */
let settled = false;

let name = $state('');
let startsAt = $state('');
let endsAt = $state('');
let renewalAt = $state('');

const roster = new Query(async () =>
  open ? unwrap(await api.seasons[':id'].roster.$get({ param: { id: open } })) : [],
);

$effect(() => {
  seasons.load();
});

/** The season the club is in, with its roster already showing: that is what somebody came to read. */
$effect(() => {
  const current = seasons.data?.find((season) => season.current);
  if (settled || !current) return;

  settled = true;
  open = current.id;
});

$effect(() => {
  void open;
  roster.load();
});

/** The previous season, which is what a roll-over pulls from: seasons come back newest first. */
function previous(id: string): string | null {
  const all = seasons.data ?? [];
  const index = all.findIndex((season) => season.id === id);
  return index >= 0 ? (all[index + 1]?.id ?? null) : null;
}

/**
 * A `date` input hands back `YYYY-MM-DD`, which `new Date` reads as UTC midnight. West of
 * Greenwich that is the day before, so a season starting on the 1st would be listed as the 31st.
 * The parts are read out and rebuilt in local time, which is the day the admin actually picked.
 */
function iso(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).toISOString();
}

async function create(): Promise<void> {
  const made = await action.run(async () =>
    unwrap(
      await api.seasons.$post({
        json: {
          name,
          startsAt: iso(startsAt),
          endsAt: iso(endsAt),
          renewalAt: renewalAt ? iso(renewalAt) : null,
          current: true,
        },
      }),
    ),
  );
  if (!made) return;

  composing = false;
  name = startsAt = endsAt = renewalAt = '';
  await seasons.load();
}

async function join(id: string): Promise<void> {
  const joined = await action.run(async () =>
    unwrap(await api.seasons[':id'].join.$post({ param: { id } })),
  );
  if (!joined) return;

  /** The session carries whether this member has renewed, and the strip above the page reads it. */
  await Promise.all([roster.load(), session.load()]);
}

async function promote(id: string): Promise<void> {
  const named = seasons.data?.find((season) => season.id === id)?.name ?? '';
  if (!(await ask.put({ title: words.t.asks.promote(named), detail: words.t.asks.promoteWhy }))) return;

  if (await action.run(async () => unwrap(await api.seasons[':id'].promote.$post({ param: { id } })))) {
    await seasons.load();
  }
}

async function rollover(id: string): Promise<void> {
  const from = previous(id);
  if (!from) return;

  const named = seasons.data?.find((season) => season.id === id)?.name ?? '';
  if (!(await ask.put({ title: words.t.asks.carryOver(named), detail: words.t.asks.carryOverWhy }))) return;

  const moved = await action.run(async () =>
    unwrap(await api.seasons[':id'].rollover.$post({ param: { id }, json: { from } })),
  );
  if (moved) await roster.load();
}

/**
 * Deleting a season, which is the only act on this page that takes something away.
 *
 * The question names the season and says what goes with it, because the roster is the part nobody
 * pictures: a season reads as a date range, and what is actually deleted is who was in the club
 * that year. The events are named too, since not losing them is the reassuring half.
 */
async function remove(id: string): Promise<void> {
  const named = seasons.data?.find((season) => season.id === id)?.name ?? '';
  const sure = await ask.put({
    title: t.asks.removeSeason(named),
    detail: t.asks.removeSeasonWhy,
    confirm: t.common.remove,
    danger: true,
  });
  if (!sure) return;

  if (!(await action.run(async () => unwrap(await api.seasons[':id'].$delete({ param: { id } }))))) return;

  /** The open roster was this season's, and the strip above the page reads the caller's standing. */
  if (open === id) open = null;
  await Promise.all([seasons.load(), session.load()]);
}
</script>

<header class="flex items-baseline justify-between">
  <h1 class="font-semibold">{t.pages.Seasons}</h1>
  {#if session.can('season:manage')}
    <Button look="plain" onclick={() => (composing = !composing)}>{composing ? t.common.cancel : t.common.new}</Button>
  {/if}
</header>

{#if composing}
  <div class="mt-4 grid gap-3 rounded-lg border border-line p-4">
    <Field label={t.seasons.name} hint={t.seasons.nameHint}>
      <Input bind:value={name}/>
    </Field>
    <div class="grid gap-3 sm:grid-cols-3">
      <Field label={t.seasons.starts}>
        <Input type="date" bind:value={startsAt}/>
      </Field>
      <Field label={t.seasons.ends}>
        <Input type="date" bind:value={endsAt}/>
      </Field>
      <Field label={t.seasons.renewals} hint={t.common.optional}>
        <Input type="date" bind:value={renewalAt}/>
      </Field>
    </div>
    <div>
      <Button look="solid" disabled={action.busy || !name || !startsAt || !endsAt} onclick={create}>
        {t.seasons.createCurrent}
      </Button>
    </div>
  </div>
{/if}

{#if action.error}<div class="mt-4"><Alert error={action.error} /></div>{/if}

<Panel query={seasons}>
  <ul class="mt-6 divide-y divide-line">
    {#each seasons.data ?? [] as season (season.id)}
      <li class="py-3 text-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <!--
            The row is the way in and out of its own roster. It was a button beside three others,
            which put "look at this" in a row of things that change something, and made the one
            harmless act on the row look like the rest of them.
          -->
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 text-start hover:text-accent"
            aria-expanded={open === season.id}
            aria-controls="roster-{season.id}"
            onclick={() => (open = open === season.id ? null : season.id)}
          >
            <span class="chevron shrink-0" class:chevron-open={open === season.id}></span>
            <span class="min-w-0">
              {season.name}
              <span class="ml-2 font-mono text-xs text-muted">
                {Format.day(season.startsAt)}
                {t.common.between}
                {Format.day(season.endsAt)}
                {#if season.current}· {t.seasons.current}{/if}
              </span>
            </span>
          </button>

          <span class="flex flex-wrap items-center gap-2">
            <!-- Nobody is offered a roster they are already on, or one that stopped taking them. -->
            {#if season.current && session.renewed}
              <!--
                A statement, not a status. It was a badge, which put a coloured dot at button size
                in a row of buttons and read as the loudest thing on the page: being on the roster
                is the quiet, expected case, and what it replaces is an offer to join.
              -->
              <span class="text-xs text-muted">{t.seasons.mine}</span>
            {:else}
              <Button disabled={action.busy} onclick={() => join(season.id)}>{t.seasons.join}</Button>
            {/if}
            {#if session.can('season:manage') && !season.current}
              <Button look="plain" disabled={action.busy} onclick={() => promote(season.id)}>
                {t.seasons.makeCurrent}
              </Button>
            {/if}
            {#if session.can('season:manage') && previous(season.id)}
              <Button look="plain" disabled={action.busy} onclick={() => rollover(season.id)}>
                {t.seasons.carryOver}
              </Button>
            {/if}
            {#if session.can('season:manage')}
              <Button look="plain" disabled={action.busy} onclick={() => remove(season.id)}>
                {t.common.remove}
              </Button>
            {/if}
          </span>
        </div>

        {#if open === season.id}
          <p class="mt-3 text-xs text-muted">{t.seasons.count(roster.data?.length ?? 0)}</p>
          <ul id="roster-{season.id}" class="mt-1 ml-1 border-l border-line pl-3 text-xs text-muted">
            {#each roster.data ?? [] as member (member.id)}
              <li class="py-0.5">
                <Person id={member.id} name={member.name} note={t.statuses[member.status]} />
              </li>
            {/each}
            {#if roster.data?.length === 0}<li class="py-0.5">{t.seasons.empty}</li>{/if}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>
</Panel>
