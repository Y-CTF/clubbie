<script lang="ts">
import { api, Refused, Status, unwrap } from '../lib/api.ts';
import { club } from '../lib/club.svelte.ts';
import { Query } from '../lib/query.svelte.ts';
import { Router } from '../lib/router.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from '../ui/Alert.svelte';
import Button from '../ui/Button.svelte';
import Panel from '../ui/Panel.svelte';

/**
 * Where a sign-in that was turned away ends up.
 *
 * The provider's redirect and the mailed link are followed by the browser, so the API cannot answer
 * them with a refusal a page could draw: it parks the refusal and sends the browser here, and this
 * asks for it. What is drawn is the server's own diagnostic, the same one a terminal would print,
 * so there is no prose about *why* in this file to drift from the check that refused.
 */
const t = $derived(words.t);
const failure = new Query(async () => unwrap(await api.auth.failure.$get()));

/** Rebuilt rather than passed through: JSON has no way to say a field is absent and not undefined. */
const error = $derived.by(() => {
  const parked = failure.data?.failure;
  if (!parked) return null;

  const { code, severity, message, help, notes } = parked.diag;
  return new Refused(
    parked.refusal,
    { code, severity, message, labels: [], notes: notes ?? [], ...(help ? { help } : {}) },
    Status.Forbidden,
  );
});

$effect(() => {
  failure.load();
});
</script>

<div class="stack-page mx-auto w-full max-w-[32rem] sm:py-6">
  <header class="stack-tight">
    <h1 class="hero">{club.name}</h1>
    <h2>{t.denied.heading}</h2>
  </header>

  <Panel query={failure}>
    {#if error}
      <Alert {error} />
    {:else}
      <p class="text-sm text-muted">{t.denied.none}</p>
    {/if}
  </Panel>

  <Button look="solid" field full href={Router.to('Home')}>{t.denied.back}</Button>
</div>
