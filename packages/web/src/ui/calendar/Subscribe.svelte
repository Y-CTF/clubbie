<script lang="ts">
import { api, unwrap } from '../../lib/api.ts';
import { club } from '../../lib/club.svelte.ts';
import { Copy } from '../../lib/copy.svelte.ts';
import { Calendars, ELSEWHERE } from '../../lib/elsewhere.ts';
import { Query } from '../../lib/query.svelte.ts';
import { words } from '../../lib/words/index.svelte.ts';
import Button from '../Button.svelte';
import Panel from '../Panel.svelte';
import { look } from '../look.ts';
import Mark from './Mark.svelte';

/**
 * The club's calendar, on its way into the member's own.
 *
 * This is the single highest-value thing the app does with a date, and it is one url: subscribed
 * once, the club's nights turn up in whatever a member already looks at every morning, and stay in
 * step without anybody copying anything again. So it is offered where the calendar is, not only
 * buried in a profile page, and it is the same component in both places.
 *
 * The url is a credential. That is why it is not printed here by default: three presses cover
 * every calendar anybody actually uses, copying covers the rest, and a token sitting in an open tab
 * on a shared screen is read by whoever walks past. Showing it is one press for the member who
 * needs to read it out, and the warning is not optional either way.
 */
const feed = new Query(async () => unwrap(await api.me.calendar.$get()));
const copy = new Copy();

const t = $derived(words.t);
let shown = $state(false);

/**
 * The url with the token taken out of it. The path says which app and which route, which is all
 * anybody needs to recognise it; the part after the last slash is the credential.
 */
function masked(url: string): string {
  const cut = url.lastIndexOf('/') + 1;
  return url.slice(0, cut) + '•'.repeat(Math.min(url.length - cut, MASK));
}

/** How many dots stand in for the token. Enough to read as "something long", not as its length. */
const MASK = 12;

$effect(() => {
  feed.load();
});
</script>

<Panel query={feed}>
  {#if feed.data}
    {@const url = feed.data.url}
    <p class="text-sm text-muted">{t.profile.calendarWhat}</p>

    <!-- One row: the calendars worth a press of their own, then the two ways to take the url away. -->
    <div class="mt-3 flex flex-wrap items-center gap-2">
      {#each ELSEWHERE as where (where)}
        <a
          href={Calendars.SUBSCRIBE[where](url, club.name)}
          class="{look('quiet', true)} px-3"
          title={Calendars.NAMES[where]}
          aria-label={Calendars.NAMES[where]}
          data-external={true}
          rel="noopener noreferrer"
        >
          <Mark {where} size="size-6" />
        </a>
      {/each}

      <span class="ms-auto flex items-center gap-2">
        <Button field onclick={() => copy.put(url)}>
          {copy.done ? t.common.copied : t.common.copy}
        </Button>
        <Button look="plain" field onclick={() => (shown = !shown)}>
          {shown ? t.common.hide : t.common.show}
        </Button>
      </span>
    </div>

    {#if shown}
      <code
        class="mt-2 block overflow-x-auto rounded-lg border border-line bg-sunk px-3 py-2.5
               font-mono text-xs select-all"
      >
        {url}
      </code>
    {:else}
      <p class="mt-2 truncate font-mono text-xs text-muted">{masked(url)}</p>
    {/if}

    <p class="mt-2 text-xs text-muted">{t.profile.calendarWarning}</p>
  {/if}
</Panel>
