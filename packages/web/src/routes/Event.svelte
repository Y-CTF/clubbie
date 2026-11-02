<script lang="ts">
import { type Answer, Event } from '@clubbie/core';
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { ask } from '../lib/ask.svelte.ts';
import { Moment } from '../lib/calendar/moment.ts';
import { Format } from '../lib/format.ts';
import { Hues } from '../lib/hues.ts';
import { kinds } from '../lib/kinds.svelte.ts';
import { Query } from '../lib/query.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Answers from '../ui/Answers.svelte';
import Badge from '../ui/Badge.svelte';
import Icon from '../ui/Icon.svelte';
import Button from '../ui/Button.svelte';
import Card from '../ui/Card.svelte';
import Menu from '../ui/Menu.svelte';
import PageHeader from '../ui/PageHeader.svelte';
import Section from '../ui/Section.svelte';
import Panel from '../ui/Panel.svelte';
import Teams from '../ui/Teams.svelte';
import Add from '../ui/calendar/Add.svelte';
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
    {@const entries = [
      ...(detail.manage ? [{ label: t.common.edit, href: Router.to('Edit', { id }) }] : []),
      ...(detail.scheduleId && session.can('event:manage')
        ? [{ label: t.calendar.series, href: Router.to('Repeat', { id: detail.scheduleId }) }]
        : []),
      ...(session.can('event:manage') && detail.state === Event.LIVE
        ? [{ label: t.event.announce, onselect: announce }]
        : []),
    ]}

    <PageHeader title={detail.title} back={{ href: Router.to('Events'), label: t.pages.Events }}>
      {#snippet meta()}
        <!-- Facts as chips, not a sentence: each is a thing, and the place is a way to get there. -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-flex items-center gap-1.5 rounded-full bg-sunk px-3 py-1 text-sm text-ink">
            <Icon name="calendar" size={14} />{Format.full(detail.startsAt)}
          </span>
          {#if detail.location}
            <a
              href="https://www.openstreetmap.org/search?query={encodeURIComponent(detail.location)}"
              target="_blank"
              rel="noopener noreferrer"
              data-external
              class="inline-flex items-center gap-1.5 rounded-full bg-sunk px-3 py-1 text-sm text-ink transition-colors hover:bg-line"
            >
              {detail.location}<Icon name="external" size={13} />
            </a>
          {/if}
          <span class="badge rounded-full bg-sunk px-3 py-1 text-sm" style={Hues.tint(detail.kind)}>{kinds.label(detail.kind)}</span>
          {#if detail.state !== Event.LIVE}
            <span class="rounded-full bg-sunk px-3 py-1 text-sm">{t.states[detail.state]}</span>
          {/if}
        </div>
      {/snippet}
      {#snippet actions()}
        {#if entries.length}<Menu {entries} />{/if}
        <!-- Both come from the API's own verdict, so the page cannot disagree with the route. -->
        {#if detail.manage}
          <Button look="solid" href={Router.to('Sheet', { id })}>{t.event.attendance}</Button>
        {/if}
      {/snippet}
    </PageHeader>

    <Card>
      {#if detail.description}
        <p class="text-sm whitespace-pre-line">{detail.description}</p>
      {/if}

      <div class="stack-tight">
        <p class="text-sm text-muted">
          {detail.open ? t.event.closes(Format.since(detail.deadline)) : t.event.closed}
          {#if detail.capacity !== null}
            · {t.event.taken(detail.taken, detail.capacity)}
            {#if detail.waiting}· {t.event.waiting(detail.waiting)}{/if}
          {/if}
        </p>

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

      {#if action.error}<Alert error={action.error} />{/if}

      {#if moment}<Add {moment} />{/if}
    </Card>

    {#if detail.teams}
      <Teams
        {id}
        teamsBy={detail.teamsBy}
        size={detail.teamSize}
        open={detail.open}
        manage={detail.manage}
      />
    {/if}

    {#if detail.answers.length > 0 || detail.attending.length > 0}
    <Section
      title={t.event.answers}
      hint={t.event.counts(detail.going, detail.maybe, detail.waiting, detail.attended)}
    >
      <Card flush>
          {#each detail.answers as entry (entry.memberId)}
            <div class="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <Person id={entry.member.id} name={entry.member.name} />
              <span class="flex shrink-0 items-center gap-3">
                <Badge kind={entry.answer}>{t.answers[entry.answer]}</Badge>
                {#if entry.attendedAt}<Badge kind="attended">{t.event.attended}</Badge>{/if}
              </span>
            </div>
          {/each}

          {#each detail.attending as guest (guest.id)}
            <div class="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>{guest.name}</span>
              <Badge kind="guest">{t.event.guest}</Badge>
            </div>
          {/each}
      </Card>
    </Section>
    {/if}
  {/if}
</Panel>
