<script lang="ts">
import { api, unwrap } from '../lib/api.ts';
import { Format } from '../lib/format.ts';
import { Query } from '../lib/query.svelte.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import Badge from '../ui/Badge.svelte';
import Icon from '../ui/Icon.svelte';
import Card from '../ui/Card.svelte';
import EmptyState from '../ui/EmptyState.svelte';
import PageHeader from '../ui/PageHeader.svelte';
import Section from '../ui/Section.svelte';
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
    <PageHeader
      title={member.data.name}
      back={{ href: Router.to('Members'), label: t.pages.Members }}
      sub="{t.roles[member.data.role]} · {t.statuses[member.data.status]} · {t.member.since(Format.day(member.data.createdAt))}"
    />
  {/if}
</Panel>

{#if allowed}
  <Section title={t.member.history} hint={t.member.ratio(attended, history.data?.length ?? 0)}>
    <Panel query={history}>
      {#if history.data?.length === 0}
        <EmptyState title={t.member.empty} icon="calendar" />
      {:else}
        <Card flush>
          {#each history.data ?? [] as entry (entry.eventId)}
            <a
              href={Router.to('Event', { id: entry.eventId })}
              class="group flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-sunk"
            >
              <span class="min-w-0">
                <span class="block truncate font-medium">{entry.event.title}</span>
                <span class="text-xs text-muted tabular-nums">{Format.day(entry.event.startsAt)}</span>
              </span>
              <span class="flex shrink-0 items-center gap-3">
                <Badge kind={entry.answer}>{t.answers[entry.answer]}</Badge>
                {#if entry.attendedAt}<Badge kind="attended">{t.event.attended}</Badge>{/if}
                <span class="text-muted transition-transform group-hover:translate-x-0.5"><Icon name="forward" size={16} /></span>
              </span>
            </a>
          {/each}
        </Card>
      {/if}
    </Panel>
  </Section>
{/if}
