<script lang="ts">
import { Action } from '../lib/action.svelte.ts';
import { Format } from '../lib/format.ts';
import { session } from '../lib/session.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from './Alert.svelte';
import Button from './Button.svelte';

/**
 * The one thing a member has to do about the club's year, said where they cannot miss it.
 *
 * A season used to be a page in the navigation and nothing else, which meant the app knew a member
 * had not renewed and never told them: they found out by being off a roster somebody read out in
 * September. It is a strip above every page rather than a line on the seasons page for that reason.
 *
 * It shows itself only while it is actionable: there is an open season, the member is not on it, and
 * renewing is still theirs to do. The moment they press the button all three stop being true, and
 * the strip is gone for the rest of the year.
 */
const action = new Action();
const t = $derived(words.t);
</script>

{#if session.lapsed && session.season}
  {@const season = session.season}
  <div class="border-b border-line bg-sunk">
    <div class="mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 text-sm">
      <span>
        <span class="font-medium">{t.seasons.renew(season.name)}</span>
        {#if season.renewalAt}
          <span class="ms-2 text-muted">{t.seasons.renewBy(Format.day(season.renewalAt))}</span>
        {/if}
      </span>

      <span class="ms-auto flex items-center gap-2">
        <Button look="solid" disabled={action.busy} onclick={() => action.run(() => session.renew())}>
          {t.seasons.renewNow}
        </Button>
      </span>
    </div>

    {#if action.error}
      <div class="mx-auto px-6 pb-3"><Alert error={action.error} /></div>
    {/if}
  </div>
{/if}
