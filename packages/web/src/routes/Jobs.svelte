<script lang="ts">
import { Job, type JobKind, type JobState } from '@clubbie/core';
import { untrack } from 'svelte';
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { Format } from '../lib/format.ts';
import { Live } from '../lib/live.svelte.ts';
import { Query } from '../lib/query.svelte.ts';
import type { Router } from '../lib/router.svelte.ts';
import { Work } from '../lib/work.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Badge from '../ui/Badge.svelte';
import Button from '../ui/Button.svelte';
import Chips from '../ui/Chips.svelte';
import Danger from '../ui/Danger.svelte';
import Pager from '../ui/Pager.svelte';
import Panel from '../ui/Panel.svelte';
import Select from '../ui/Select.svelte';

/**
 * The queue: everything the app owes itself, and what an admin may do about it.
 *
 * It was a section at the foot of the settings page and it showed only the failures, which answers
 * one question ("did that announcement go out") and hides the one an admin actually asks when
 * something is wrong ("is anything happening at all"). An empty failure list and a dead scheduler
 * look identical. This shows the whole queue, in every state, and watches it.
 *
 * What may be done to a job comes from the domain rather than from this page: `Job.REPLAYABLE` and
 * `Job.DISCARDABLE` are the same lists the store writes with, so a button is offered exactly when
 * the write behind it would be accepted.
 */
let { router }: { router: Router } = $props();

/**
 * The filter as the address had it, so a link to the failures is a link to the failures.
 *
 * The variable is `stage` rather than `state`: `$state` is a rune, and a `state` beside it reads
 * as one at a glance and confuses the compiler's own view of the file.
 */
const opened = untrack(() => router.current.query);

let stage = $state<JobState | ''>(asState(opened.state));
let kind = $state<JobKind | ''>(asKind(opened.kind));
let offset = $state(0);

function asState(value: string | undefined): JobState | '' {
  return Job.STATES.find((one) => one === value) ?? '';
}

function asKind(value: string | undefined): JobKind | '' {
  return Job.KINDS.find((one) => one === value) ?? '';
}

const queue = new Query(async () =>
  unwrap(
    await api.jobs.$get({
      query: {
        limit: String(Job.WINDOW),
        offset: String(offset),
        ...(stage === '' ? {} : { state: stage }),
        ...(kind === '' ? {} : { kind }),
      },
    }),
  ),
);

const action = new Action();
/** A screen about work in flight has to move on its own, or it is a photograph of a queue. */
const live = new Live(() => queue.load());

const t = $derived(words.t);
const tally = $derived(queue.data?.tally ?? { pending: 0, running: 0, done: 0, failed: 0 });
const jobs = $derived(queue.data?.jobs ?? []);

/** Narrowing is a different report, so it starts at its own first page rather than page four. */
function narrow(): void {
  offset = 0;
}

$effect(() => {
  void stage;
  void kind;
  void offset;
  queueMicrotask(() => void untrack(() => queue.load()));
});

/** What is being looked at goes in the address, so one admin can send another the failures. */
$effect(() => {
  const address = { ...(stage === '' ? {} : { state: stage }), ...(kind === '' ? {} : { kind }) };
  queueMicrotask(() => router.replace('Jobs', {}, address));
});

$effect(() => live.watch());

/** The two writes. Both re-read the page: the refusal for a job that moved says to do exactly that. */
async function retry(id: string): Promise<void> {
  if (await action.run(async () => unwrap(await api.jobs[':id'].retry.$post({ param: { id } })))) {
    await queue.load();
  }
}

async function discard(id: string): Promise<void> {
  if (await action.run(async () => unwrap(await api.jobs[':id'].$delete({ param: { id } })))) {
    await queue.load();
  }
}

/** How many are in a state, for the chip that filters by it. Empty is the whole queue. */
function counted(one: JobState | ''): string {
  const total = one === '' ? Object.values(tally).reduce((sum, count) => sum + count, 0) : tally[one];
  return `${one === '' ? t.queue.every : t.queue.states[one]} ${total}`;
}

/** When a job is next interesting: due, overdue, or held by a drainer that took it. */
function timing(job: { state: JobState; runAt: string; claimedAt: string | null }): string {
  if (job.state === Job.RUNNING && job.claimedAt) return t.queue.held(Format.since(job.claimedAt));
  const late = new Date(job.runAt).getTime() < Date.now();
  return late ? t.queue.overdue(Format.since(job.runAt)) : t.queue.due(Format.since(job.runAt));
}
</script>

<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
  <h1 class="font-semibold">{t.pages.Jobs}</h1>
  <span class="text-xs text-muted">{t.queue.counted(queue.data?.total ?? 0)}</span>
</div>
<p class="mt-1 text-xs text-muted">{t.queue.hint}</p>

<div class="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
  <Chips
    bind:value={stage}
    options={['', ...Job.STATES] as (JobState | '')[]}
    name={counted}
    onchange={narrow}
  />

  <!--
    Watching is a switch rather than a refresh button alone: an admin reading why an announcement
    failed does not want the list reordering itself under the sentence they are halfway through.
  -->
  <div class="flex items-center gap-2 justify-self-start sm:justify-self-end">
    <Button look="plain" onclick={() => live.toggle()}>
      <Badge kind={live.on ? 'live' : 'paused'}>{live.on ? t.queue.live : t.queue.paused}</Badge>
    </Button>
    <Button look="plain" disabled={queue.loading} onclick={() => queue.load()}>{t.queue.refresh}</Button>
  </div>
</div>

<div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-center">
  <Select
    bind:value={kind}
    options={Job.KINDS}
    name={(one: JobKind) => t.jobs[one]}
    empty={t.queue.everyKind}
    label={t.queue.filterKind}
    onchange={narrow}
  />
  {#if action.error}<span class="min-w-0"><Alert error={action.error} /></span>{/if}
</div>

<Panel query={queue}>
  <ul class="mt-4 grid gap-2">
    {#each jobs as job (job.id)}
      <li class="rounded-lg border border-line p-4 text-sm">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span class="flex flex-wrap items-baseline gap-x-3">
            <Badge kind={job.state}>{t.queue.states[job.state]}</Badge>
            <span class="font-medium">{t.jobs[job.kind]}</span>
          </span>
          <span class="text-xs text-muted">{timing(job)}</span>
        </div>

        <!--
          The payload is ids and nothing else, so every one of them is a link to the thing the job
          is about. It is rendered from the payload rather than from the kind: a job whose payload
          names an event is a link to that event whatever the job was going to do with it.
        -->
        <p class="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted">
          {#each Object.entries(job.payload) as [key, value] (key)}
            {@const href = Work.link(key, value)}
            {#if href}
              <a class="underline decoration-line hover:text-ink" {href}>{value}</a>
            {:else}
              <span>{key}: {String(value)}</span>
            {/if}
          {/each}
          <span>{t.queue.queued(Format.since(job.createdAt))}</span>
          {#if job.attempts > 0}<span>{t.queue.attempts(job.attempts)}</span>{/if}
        </p>

        {#if job.error}
          <!-- The provider's own words. It is the only thing that says why, so it is not hidden. -->
          <p class="mt-2 rounded-lg bg-sunk p-2 font-mono text-xs break-words text-muted">
            {job.error}
          </p>
        {/if}

        <div class="mt-3 flex flex-wrap items-center gap-2">
          {#if Job.REPLAYABLE.includes(job.state)}
            <Button disabled={action.busy} onclick={() => retry(job.id)}>
              {job.state === Job.FAILED ? t.queue.retry : t.queue.now}
            </Button>
          {/if}

          {#if Job.DISCARDABLE.includes(job.state)}
            <Danger
              question={t.asks.discardJob}
              detail={t.asks.discardJobWhy}
              confirm={t.queue.discard}
              disabled={action.busy}
              onconfirm={() => discard(job.id)}
            >
              {t.queue.discard}
            </Danger>
          {/if}

          {#if job.state === Job.RUNNING}
            <span class="text-xs text-muted">{t.queue.busy}</span>
          {/if}
        </div>
      </li>
    {/each}
  </ul>

  {#if jobs.length === 0}
    <p class="mt-3 text-sm text-muted">{t.queue.empty}</p>
  {/if}

  <Pager bind:offset window={Job.WINDOW} total={queue.data?.total ?? 0} />
</Panel>
