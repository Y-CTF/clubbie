<script lang="ts">
import {
  Event,
  type Frequency,
  type KindId,
  type Maker,
  MAKERS,
  Millis,
  Recur,
  type State,
  Team,
} from '@clubbie/core';
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { Format } from '../lib/format.ts';
import { kinds } from '../lib/kinds.svelte.ts';
import { Query } from '../lib/query.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Button from '../ui/Button.svelte';
import Danger from '../ui/Danger.svelte';
import Field from '../ui/Field.svelte';
import Input from '../ui/Input.svelte';
import Select from '../ui/Select.svelte';

/**
 * The one form that writes an event: a new one, an edit of one, and the rule behind a repeating
 * one.
 *
 * A repeat is not a second kind of thing a club does. It is an event with one more answer on it,
 * so it is the same fields, the same words and the same button, and the answer to "does this
 * happen again" decides whether the form writes an event or a schedule. Two forms is how one of
 * them ends up without a capacity field, and how a member learns that "repeating" is a different
 * feature rather than a checkbox.
 *
 * What a repeat cannot carry is a state and a deadline: every night it stamps is published and
 * takes the club's own deadline, because there is nobody to publish forty Tuesdays one at a time.
 * Those two fields are the only thing this form hides, and it hides them rather than refusing them.
 *
 * A datetime-local input is wall-clock text and the API takes ISO 8601; `Format.field` is the one
 * place the two are converted.
 */
let {
  id,
  repeat,
  at,
  router,
}: {
  /** An event being edited. */
  id?: string | undefined;
  /** A repeat being edited, which is the same form over the rule instead of over one night. */
  repeat?: string | undefined;
  /** The slot a member clicked on the calendar, as a wall clock the form can hold. */
  at?: string | undefined;
  router: Router;
} = $props();

/** How long an event lasts when the calendar opened this form from an empty hour. */
const HOUR = Millis.HOUR;
const MINUTE = Millis.MINUTE;

/** What "it does not happen again" is called in the one control that decides it. */
const ONCE = 'once';
type Repeats = typeof ONCE | Frequency;
const REPEATS: readonly Repeats[] = [ONCE, ...Recur.FREQUENCIES];

const editing = $derived(Boolean(id || repeat));
const series = $derived(Boolean(repeat));
const action = new Action();
const t = $derived(words.t);

let title = $state('');
let description = $state('');
let kind = $state<KindId | ''>('');
let stage = $state<State>(Event.INITIAL);
let startsAt = $state('');
let endsAt = $state('');
let closesAt = $state('');
let location = $state('');
let capacity = $state('');
let listed = $state(false);
let teams = $state(false);
let teamSize = $state('');
let teamsBy = $state<Maker>(Team.MAKER);
let repeats = $state<Repeats>(ONCE);
let interval = $state('1');
let count = $state('12');

/** What the last edit of a rule cost, as numbers: the sentence that says it is chosen at render. */
let cost = $state<{ updated: number; dropped: number; created: number } | null>(null);

const existing = new Query(async () => (id ? unwrap(await api.events[':id'].$get({ param: { id } })) : null));
const rule = new Query(async () =>
  repeat ? unwrap(await api.schedules[':id'].$get({ param: { id: repeat } })) : null,
);

$effect(() => {
  kinds.load();
});

/** A new event starts on the club's first kind, once the club's list has arrived. */
$effect(() => {
  if (!kind) kind = kinds.first ?? '';
});

/** A slot clicked on the grid arrives filled in, an hour long, which is what a click meant. */
$effect(() => {
  if (!at || editing) return;
  startsAt = at;
  endsAt = Format.field(new Date(new Date(at).getTime() + HOUR).toISOString());
});

$effect(() => {
  if (!id) return;
  void existing.load().then(fill);
});

$effect(() => {
  if (!repeat) return;
  void rule.load().then(fillRule);
});

/** The event as the form holds it: local wall clock in, ISO out. */
function fill(): void {
  const event = existing.data;
  if (!event) return;

  title = event.title;
  description = event.description ?? '';
  kind = event.kind;
  stage = event.state;
  startsAt = Format.field(event.startsAt);
  endsAt = event.endsAt ? Format.field(event.endsAt) : '';
  closesAt = event.closesAt ? Format.field(event.closesAt) : '';
  location = event.location ?? '';
  capacity = event.capacity === null ? '' : String(event.capacity);
  listed = event.listed;
  teams = event.teams;
  teamSize = event.teamSize === null ? '' : String(event.teamSize);
  teamsBy = event.teamsBy;
}

/**
 * The same, for a rule. The length of an occurrence is stored as minutes and shown as an end time,
 * because "it ends at nine" is what somebody knows and "it is 120 minutes long" is what a database
 * knows.
 */
function fillRule(): void {
  const one = rule.data;
  if (!one) return;

  title = one.title;
  description = one.description ?? '';
  kind = one.kind;
  startsAt = Format.field(one.startsAt);
  endsAt =
    one.minutes === null
      ? ''
      : Format.field(new Date(new Date(one.startsAt).getTime() + one.minutes * MINUTE).toISOString());
  location = one.location ?? '';
  capacity = one.capacity === null ? '' : String(one.capacity);
  listed = one.listed;
  repeats = one.freq;
  interval = String(one.interval);
  count = one.count === null ? '' : String(one.count);
}

/** The fields both shapes share, which is every field but the two each has of its own. */
function shared() {
  return {
    title,
    description: description || null,
    kind,
    location: location || null,
    capacity: capacity ? Number(capacity) : null,
    listed,
    teams,
    teamSize: teams && teamSize ? Number(teamSize) : null,
    teamsBy,
  };
}

function event() {
  return {
    ...shared(),
    state: stage,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    closesAt: closesAt ? new Date(closesAt).toISOString() : null,
  };
}

function schedule() {
  const from = new Date(startsAt);
  const minutes = endsAt ? Math.round((new Date(endsAt).getTime() - from.getTime()) / MINUTE) : null;

  return {
    ...shared(),
    startsAt: from.toISOString(),
    /** A rule cannot repeat something of no length, and a negative end is a typo, not a duration. */
    minutes: minutes !== null && minutes > 0 ? minutes : null,
    freq: repeats === ONCE ? Recur.FREQUENCIES[0] : repeats,
    /** An emptied number input reads back as nothing: every rule repeats at least every one. */
    interval: interval ? Number(interval) : Recur.EVERY,
    count: count ? Number(count) : null,
  };
}

async function save(): Promise<void> {
  const written = await action.run(async () => {
    if (repeat) return unwrap(await api.schedules[':id'].$patch({ param: { id: repeat }, json: schedule() }));
    if (id) return unwrap(await api.events[':id'].$patch({ param: { id }, json: event() }));
    if (repeats !== ONCE) return unwrap(await api.schedules.$post({ json: schedule() }));
    return unwrap(await api.events.$post({ json: event() }));
  });
  if (!written) return;

  /** Only an edited rule reports a cost, and it comes back from the write rather than a closure. */
  if (written && 'updated' in written) {
    cost = written;
    await rule.load();
    return;
  }

  if (id) router.go('Event', { id });
  else router.go('Events');
}

async function remove(): Promise<void> {
  const done = await action.run(async () => {
    if (repeat) return unwrap(await api.schedules[':id'].$delete({ param: { id: repeat } }));
    if (id) return unwrap(await api.events[':id'].$delete({ param: { id } }));
    return null;
  });
  if (done) router.go('Events');
}
</script>

<h1 class="font-semibold">{series ? t.compose.repeatHeading(editing) : t.compose.heading(editing)}</h1>

{#if existing.first || rule.first}
  <p class="mt-6 text-sm text-muted">{t.common.loading}</p>
{/if}

<!-- An occurrence says what it belongs to, because half of what somebody wants to edit is the rule. -->
{#if existing.data?.scheduleId}
  <p class="mt-4 text-sm text-muted">
    {t.compose.partOf}
    <a href={Router.to('Repeat', { id: existing.data.scheduleId })} class="underline underline-offset-2">
      {t.compose.editSeries}
    </a>
  </p>
{/if}

<div class="mt-6 grid gap-4">
  <Field label={t.compose.title}>
    <Input bind:value={title}/>
  </Field>

  <Field label={t.compose.description} hint={t.compose.descriptionHint}>
    <textarea
      bind:value={description}
      rows="3"
      class="w-full rounded-lg border border-line bg-transparent px-3 py-2.5 text-base
             transition-colors hover:border-muted"
    ></textarea>
  </Field>

  <div class="grid gap-4 sm:grid-cols-2">
    <Field label={t.compose.kind}>
      <Select bind:value={kind} options={kinds.ids} name={(option) => kinds.label(option)} />
    </Field>

    {#if !series}
      <Field label={t.compose.state} hint={t.compose.stateHint}>
        <Select bind:value={stage} options={Event.STATES} name={(option) => t.states[option]} />
      </Field>
    {/if}

    <Field label={series ? t.compose.first : t.compose.starts}>
      <Input type="datetime-local" bind:value={startsAt}/>
    </Field>

    <Field label={t.compose.ends} hint={t.common.optional}>
      <Input type="datetime-local" bind:value={endsAt}/>
    </Field>

    {#if !series}
      <Field label={t.compose.closes} hint={t.compose.closesHint}>
        <Input type="datetime-local" bind:value={closesAt}/>
      </Field>
    {/if}

    <Field label={t.compose.capacity} hint={t.compose.capacityHint}>
      <Input type="number" min="1" bind:value={capacity}/>
    </Field>
  </div>

  <Field label={t.compose.location} hint={t.common.optional}>
    <Input bind:value={location}/>
  </Field>

  <!--
    The one control that decides which of the two things this form writes. An event that is already
    one night is not offered it: turning tonight into a term is a different act, and the app would
    rather ask for the rule than guess at it.
  -->
  {#if !id}
    <div class="grid gap-4 sm:grid-cols-2">
      <Field label={t.schedules.repeats}>
        <Select
          bind:value={repeats}
          options={series ? Recur.FREQUENCIES : REPEATS}
          name={(option) => (option === ONCE ? t.schedules.once : t.frequencies[option])}
        />
      </Field>

      {#if repeats !== ONCE}
        <Field label={t.schedules.interval} hint={t.schedules.intervalHint}>
          <Input type="number" min="1" bind:value={interval}/>
        </Field>

        <Field label={t.schedules.count} hint={t.schedules.countHint}>
          <Input type="number" min="1" bind:value={count}/>
        </Field>
      {/if}
    </div>
  {/if}

  <label class="flex items-center gap-2 text-sm">
    <input type="checkbox" bind:checked={listed} />
    {t.compose.listed}
  </label>

  <label class="flex items-center gap-2 text-sm">
    <input type="checkbox" bind:checked={teams} />
    {t.compose.teams}
  </label>

  {#if teams}
    <div class="grid gap-3 sm:grid-cols-2">
      <Field label={t.compose.teamSize} hint={t.compose.teamSizeHint}>
        <Input type="number" min="1" bind:value={teamSize} />
      </Field>
      <Field label={t.compose.teamsBy}>
        <Select bind:value={teamsBy} options={MAKERS} name={(option) => t.makers[option]} />
      </Field>
    </div>
  {/if}

  {#if series}<p class="text-xs text-muted">{t.schedules.retimes}</p>{/if}
  {#if cost}
    <p class="text-sm text-muted">{t.schedules.cost(cost.updated, cost.dropped, cost.created)}</p>
  {/if}

  {#if existing.error}<Alert error={existing.error} />{/if}
  {#if rule.error}<Alert error={rule.error} />{/if}
  {#if action.error}<Alert error={action.error} />{/if}

  <div class="flex gap-2">
    <Button look="solid" disabled={action.busy || !title || !startsAt || !kind} onclick={save}>
      {editing ? t.common.save : t.common.create}
    </Button>
    {#if editing}
      <Danger
        question={series ? t.asks.removeSchedule : t.asks.removeEvent}
        detail={series ? t.asks.removeScheduleWhy : t.asks.removeEventWhy}
        confirm={t.common.remove}
        disabled={action.busy}
        onconfirm={remove}
      >
        {t.common.remove}
      </Danger>
    {/if}
  </div>
</div>
