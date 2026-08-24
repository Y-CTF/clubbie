<script lang="ts">
import { api, unwrap } from '../lib/api.ts';
import { Format } from '../lib/format.ts';
import { Query } from '../lib/query.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import Badge from '../ui/Badge.svelte';
import Panel from '../ui/Panel.svelte';

/**
 * One member, and what they have actually turned up to. This is the page an organiser opens
 * before asking somebody to run a session: the answers are one column and the attendance is
 * another, because the gap between them is the interesting part.
 */
let { id }: { id: string } = $props();

const member = new Query(async () => unwrap(await api.members[':id'].$get({ param: { id } })));
const history = new Query(async () => unwrap(await api.members[':id'].rsvps.$get({ param: { id } })));

/** Reading somebody else's history is an organiser's business, so an ordinary member never asks. */
const allowed = $derived(session.can('member:manage'));

$effect(() => {
  void id;
  member.load();
  if (allowed) history.load();
});

const attended = $derived((history.data ?? []).filter((entry) => entry.attendedAt).length);
const t = $derived(words.t);
</script>

<Panel query={member}>
  {#if member.data}
    <h1 class="font-semibold">{member.data.name}</h1>
    <p class="mt-1 text-sm text-muted">
      {t.roles[member.data.role]} · {t.statuses[member.data.status]} · {t.member.since(
        Format.day(member.data.createdAt),
      )}
    </p>
  {/if}
</Panel>

{#if allowed}
  <section class="mt-8">
    <h2 class="font-medium">
      {t.member.history}
      <span class="ml-2 font-normal text-muted">
        {t.member.ratio(attended, history.data?.length ?? 0)}
      </span>
    </h2>

    <Panel query={history}>
      <ul class="mt-3 divide-y divide-line">
        {#each history.data ?? [] as entry (entry.eventId)}
          <li class="flex items-center justify-between gap-3 py-2 text-sm">
            <a href={Router.to('Event', { id: entry.eventId })} class="hover:opacity-80">
              {entry.event.title}
              <span class="ml-2 font-mono text-xs text-muted">{Format.day(entry.event.startsAt)}</span>
            </a>
            <span class="flex items-center gap-2">
              <Badge kind={entry.answer}>{t.answers[entry.answer]}</Badge>
              {#if entry.attendedAt}<Badge kind="attended">{t.event.attended}</Badge>{/if}
            </span>
          </li>
        {/each}
      </ul>

      {#if history.data?.length === 0}
        <p class="mt-3 text-sm text-muted">{t.member.empty}</p>
      {/if}
    </Panel>
  </section>
{/if}
