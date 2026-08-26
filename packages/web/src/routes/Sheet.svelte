<script lang="ts">
import { Site } from '@clubbie/core';
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { Query } from '../lib/query.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Badge from '../ui/Badge.svelte';
import Button from '../ui/Button.svelte';
import Danger from '../ui/Danger.svelte';
import Field from '../ui/Field.svelte';
import Input from '../ui/Input.svelte';
import Panel from '../ui/Panel.svelte';
import Person from '../ui/Person.svelte';

/**
 * The screen an organiser stands in a doorway with. It is a list of big tap targets and nothing
 * else: one tap marks somebody present, and the row says what they had answered so a name that was
 * never expected still stands out.
 *
 * Every tap shows its result immediately and writes underneath: `Query.patch` moves the row, the
 * write follows, and a refusal puts the row back with the reason above it. A doorway is exactly
 * where a connection is worst and where waiting on a round trip is least acceptable, and marking
 * somebody present is the safest thing in the app to be optimistic about: it is idempotent, and
 * the truth arrives with the refetch a moment later.
 */
let { id }: { id: string } = $props();

const sheet = new Query(async () => unwrap(await api.events[':id'].sheet.$get({ param: { id } })));

/** What the sheet route answers with, so the optimistic patch is typed against the real shape. */
type Sheet = NonNullable<typeof sheet.data>;
const event = new Query(async () => unwrap(await api.events[':id'].$get({ param: { id } })));
const action = new Action();
const t = $derived(words.t);

let filter = $state('');

$effect(() => {
  void id;
  sheet.load();
  event.load();
});

const answers = $derived(
  (sheet.data?.answers ?? []).filter((entry) =>
    entry.member.name.toLowerCase().includes(filter.toLowerCase()),
  ),
);
const guests = $derived(
  (sheet.data?.attending ?? []).filter((guest) => guest.name.toLowerCase().includes(filter.toLowerCase())),
);

/** What an `attendedAt` becomes on screen the instant it is tapped, before the server says so. */
function stamp(attended: boolean): string | null {
  return attended ? new Date().toISOString() : null;
}

/**
 * Show it, write it, and put it back if the server disagrees.
 *
 * A member's row and a guest's row differ in which list they are in and which route they are
 * written to, and in nothing else. The two used to carry a copy each of the optimistic patch, the
 * head count, the rollback pair and the refetch.
 */
async function attend(
  patch: (data: Sheet, at: string | null) => Sheet,
  attended: boolean,
  write: () => Promise<unknown>,
): Promise<void> {
  const undo = sheet.patch((data) => patch(data, stamp(attended)));
  const counted = count(attended);

  const done = await action.run(write);
  if (!done) {
    undo();
    counted();
  }
  /** Two taps inside one round trip nest their rollbacks, so the truth is refetched, not guessed. */
  await refresh();
}

async function mark(memberId: string, attended: boolean): Promise<void> {
  await attend(
    (data, at) => ({
      ...data,
      answers: data.answers.map((entry) =>
        entry.memberId === memberId ? { ...entry, attendedAt: at } : entry,
      ),
    }),
    attended,
    async () =>
      unwrap(
        await api.events[':id'].attendance[':memberId'].$put({ param: { id, memberId }, json: { attended } }),
      ),
  );
}

async function markGuest(guestId: string, attended: boolean): Promise<void> {
  await attend(
    (data, at) => ({
      ...data,
      attending: data.attending.map((guest) =>
        guest.id === guestId ? { ...guest, attendedAt: at } : guest,
      ),
    }),
    attended,
    async () =>
      unwrap(
        await api.events[':id'].guests[':guestId'].attendance.$put({
          param: { id, guestId },
          json: { attended },
        }),
      ),
  );
}

/** The head count moves with the row it came from, or the number and the list disagree on screen. */
function count(attended: boolean): () => void {
  return event.patch((data) => ({ ...data, attended: data.attended + (attended ? 1 : -1) }));
}

/** The list and the head count come from two queries, and both have to be told. */
async function refresh(): Promise<void> {
  await sheet.load();
  await event.load();
}

let guestName = $state('');

async function invite(): Promise<void> {
  const added = await action.run(async () =>
    unwrap(await api.events[':id'].guests.$post({ param: { id }, json: { name: guestName } })),
  );
  if (!added) return;
  guestName = '';
  await refresh();
}

async function uninvite(guestId: string): Promise<void> {
  const gone = await action.run(async () =>
    unwrap(await api.events[':id'].guests[':guestId'].$delete({ param: { id, guestId } })),
  );
  if (gone) await refresh();
}
</script>

<header class="flex items-baseline justify-between gap-4">
  <h1 class="font-semibold">{event.data?.title ?? t.sheet.heading}</h1>
  <a href={Site.Api.sheet(id)} data-external class="text-sm text-muted hover:text-ink">{t.common.csv}</a>
</header>

{#if event.data}
  <p class="mt-1 text-sm text-muted">
    {t.sheet.counts(event.data.attended, event.data.going, event.data.guests)}
  </p>
{/if}

<div class="mt-4">
  <Field label={t.sheet.filter}>
    <Input bind:value={filter} placeholder={t.sheet.filterHint}/>
  </Field>
</div>

{#if action.error}<div class="mt-4"><Alert error={action.error} /></div>{/if}

<Panel query={sheet}>
  <ul class="mt-4 divide-y divide-line">
    {#each answers as entry (entry.memberId)}
      <li class="flex flex-wrap items-center justify-between gap-3 py-3">
        <span class="flex min-w-0 items-center gap-2 text-sm">
          <span class="truncate"><Person id={entry.member.id} name={entry.member.name} /></span>
          <Badge kind={entry.answer}>{t.answers[entry.answer]}</Badge>
        </span>
        <span class="min-h-11 shrink-0 [&_button]:min-h-11 [&_button]:px-4">
          <Button
            look={entry.attendedAt ? 'solid' : 'quiet'}
            onclick={() => mark(entry.memberId, !entry.attendedAt)}
          >
            {entry.attendedAt ? t.sheet.present : t.sheet.markPresent}
          </Button>
        </span>
      </li>
    {/each}

    {#each guests as guest (guest.id)}
      <li class="flex flex-wrap items-center justify-between gap-3 py-3">
        <span class="flex min-w-0 items-center gap-2 text-sm">
          <span class="truncate">{guest.name}</span>
          <Badge kind="guest">{t.event.guest}</Badge>
        </span>
        <span class="flex shrink-0 gap-2 [&_button]:min-h-11 [&_button]:px-4">
          <Button
            look={guest.attendedAt ? 'solid' : 'quiet'}
            onclick={() => markGuest(guest.id, !guest.attendedAt)}
          >
            {guest.attendedAt ? t.sheet.present : t.sheet.markPresent}
          </Button>
          <Danger
            question={t.asks.removeGuest(guest.name)}
            confirm={t.common.remove}
            disabled={action.busy}
            onconfirm={() => uninvite(guest.id)}
          >
            {t.common.remove}
          </Danger>
        </span>
      </li>
    {/each}
  </ul>
</Panel>

<section class="mt-8">
  <h2 class="font-medium">{t.sheet.addGuest}</h2>
  <!-- One grid: the box and the button beside it share an edge, and the button is its height. -->
  <div class="mt-2 grid grid-cols-[minmax(0,1fr)_7rem] items-end gap-2">
    <Field label={t.sheet.guestName}>
      <Input bind:value={guestName} />
    </Field>
    <Button field disabled={action.busy || !guestName} onclick={invite}>{t.common.add}</Button>
  </div>
  <p class="mt-1 text-xs text-muted">{t.sheet.guestHint}</p>
</section>
