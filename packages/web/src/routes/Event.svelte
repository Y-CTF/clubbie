<script lang="ts">
import { type Answer, Event } from '@clubbie/core';
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { ask } from '../lib/ask.svelte.ts';
import { Moment } from '../lib/calendar/moment.ts';
import { Format } from '../lib/format.ts';
import { kinds } from '../lib/kinds.svelte.ts';
import { Query } from '../lib/query.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Answers from '../ui/Answers.svelte';
import Badge from '../ui/Badge.svelte';
import Button from '../ui/Button.svelte';
import Panel from '../ui/Panel.svelte';
import Add from '../ui/calendar/Add.svelte';
import { look } from '../ui/look.ts';
import Person from '../ui/Person.svelte';

let { id }: { id: string } = $props();

const event = new Query(async () => unwrap(await api.events[':id'].$get({ param: { id } })));
const action = new Action();
const t = $derived(words.t);

$effect(() => {
  kinds.load();
  void id;
  event.load();
});

/** The same two parsed instants the calendar draws from, so the export links are not built twice. */
const moment = $derived(event.data ? new Moment(event.data) : null);

/** A refusal here is the interesting case: a full event or a passed deadline says why. */
async function answer(answer: Answer): Promise<void> {
  const said = await action.run(async () =>
    unwrap(await api.events[':id'].rsvp.$put({ param: { id }, json: { answer } })),
  );
  if (said) await event.load();
}

async function withdraw(): Promise<void> {
  const gone = await action.run(async () => unwrap(await api.events[':id'].rsvp.$delete({ param: { id } })));
  if (gone) await event.load();
}

async function announce(): Promise<void> {
  /** It is not destructive, it is irreversible: a message nobody can unsend. */
  const said = await ask.put({
    title: words.t.asks.announce,
    detail: words.t.asks.announceWhy,
    confirm: words.t.event.announce,
  });
  if (!said) return;

  await action.run(async () => unwrap(await api.events[':id'].announce.$post({ param: { id } })));
}
</script>

<Panel query={event}>
  {#if event.data}
    {@const detail = event.data}
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="font-semibold">{detail.title}</h1>
        <p class="mt-1 text-sm text-muted">
          {Format.full(detail.startsAt)}
          {#if detail.location}· {detail.location}{/if}
          · {kinds.label(detail.kind)}
          {#if detail.state !== Event.LIVE}· {t.states[detail.state]}{/if}
        </p>
        {#if detail.open}
          <p class="mt-1 text-xs text-muted">{t.event.closes(Format.since(detail.deadline))}</p>
        {:else}
          <p class="mt-1 text-xs text-muted">{t.event.closed}</p>
        {/if}
      </div>

      <span class="flex shrink-0 gap-2">
        {#if detail.scheduleId && session.can('event:manage')}
          <a href={Router.to('Repeat', { id: detail.scheduleId })} class={look('plain')}>
            {t.calendar.series}
          </a>
        {/if}
        <!-- Both come from the API's own verdict, so the page cannot disagree with the route. -->
        {#if detail.manage}
          <a href={Router.to('Edit', { id })} class={look('plain')}>{t.common.edit}</a>
          <a href={Router.to('Sheet', { id })} class={look('plain')}>{t.event.attendance}</a>
        {/if}
      </span>
    </header>

    {#if moment}
      <div class="mt-3"><Add {moment} /></div>
    {/if}

    {#if detail.description}
      <p class="mt-4 text-sm whitespace-pre-line">{detail.description}</p>
    {/if}

    {#if detail.capacity !== null}
      <p class="mt-4 text-sm text-muted">
        {t.event.taken(detail.taken, detail.capacity)}
        {#if detail.waiting}· {t.event.waiting(detail.waiting)}{/if}
      </p>
    {/if}

    <div class="mt-6">
      <Answers
        open={detail.open}
        capacity={detail.capacity}
        taken={detail.taken}
        held={detail.mine?.answer}
        {action}
        onanswer={answer}
        onwithdraw={withdraw}
      />
    </div>

    {#if session.can('event:manage') && detail.state === Event.LIVE}
      <div class="mt-4">
        <Button look="plain" disabled={action.busy} onclick={announce}>{t.event.announce}</Button>
      </div>
    {/if}

    {#if action.error}
      <div class="mt-4"><Alert error={action.error} /></div>
    {/if}

    <section class="mt-8">
      <h2 class="font-medium">
        {t.event.answers}
        <span class="ml-2 font-normal text-muted">
          {t.event.counts(detail.going, detail.maybe, detail.waiting, detail.attended)}
        </span>
      </h2>

      <ul class="mt-3 divide-y divide-line">
        {#each detail.answers as entry (entry.memberId)}
          <li class="flex items-center justify-between py-2 text-sm">
            <Person id={entry.member.id} name={entry.member.name} />
            <span class="flex items-center gap-2">
              <Badge kind={entry.answer}>{t.answers[entry.answer]}</Badge>
              {#if entry.attendedAt}<Badge kind="attended">{t.event.attended}</Badge>{/if}
            </span>
          </li>
        {/each}

        {#each detail.attending as guest (guest.id)}
          <li class="flex items-center justify-between py-2 text-sm">
            <span>{guest.name}</span>
            <Badge kind="guest">{t.event.guest}</Badge>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</Panel>
