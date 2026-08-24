<script lang="ts">
import { Asset, Bytes } from '@clubbie/core';
import { Action } from '../lib/action.svelte.ts';
import { api, unwrap } from '../lib/api.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from './Alert.svelte';
import Button from './Button.svelte';
import Input from './Input.svelte';

/**
 * An image the club points at: a url somewhere else, or one of its own, uploaded here.
 *
 * Uploading exists because the alternative was asking a committee to find somewhere on the
 * internet to put a png. The bytes go into the database with everything else, so the club's logo
 * survives the same backup as its roster, and the field ends up holding `/api/assets/<id>` either
 * way: nothing downstream knows or cares which kind of url it got.
 */
let {
  value = $bindable(''),
  label,
  hint,
  wide = false,
}: { value?: string; label: string; hint?: string | undefined; wide?: boolean } = $props();

const action = new Action();
const t = $derived(words.t);

let picker = $state<HTMLInputElement | null>(null);

async function upload(file: File): Promise<void> {
  await action.run(async () => {
    /** The body is the image; the type is the header. There is one file, so there is no form. */
    const answer = await unwrap(
      await api.assets.$post({}, { init: { body: file, headers: { 'content-type': file.type } } }),
    );
    value = answer.url;
  });

  /**
   * Cleared whether it worked or not. A picker that still holds the refused file fires no
   * `change` when the same file is chosen again, so a member's second attempt did nothing at all.
   */
  if (picker) picker.value = '';
}

function chosen(event: Event & { currentTarget: HTMLInputElement }): void {
  const file = event.currentTarget.files?.[0];
  if (file) void upload(file);
}
</script>

<div class="grid gap-2">
  <span class="text-xs text-muted">{label}</span>

  {#if value}
    <img
      src={value}
      alt={t.design.preview}
      class="rounded-lg border border-line bg-sunk object-contain
             {wide ? 'h-28 w-full' : 'h-20 w-20'}"
    />
  {/if}

  <!-- One grid, so the box and the buttons beside it share an edge and a height. -->
  <div class="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2">
    <Input bind:value placeholder="https://" />

    <!-- The two are alternatives, and a word says so: they read as a sequence without it. -->
    <span class="text-xs text-muted">{t.common.or}</span>

    <Button field disabled={action.busy} onclick={() => picker?.click()}>
      {action.busy ? t.design.uploading : t.common.upload}
    </Button>
    {#if value}
      <Button look="plain" field onclick={() => (value = '')}>{t.common.clear}</Button>
    {:else}
      <span></span>
    {/if}
  </div>

  <input
    bind:this={picker}
    type="file"
    accept={Asset.MIMES.join(',')}
    class="hidden"
    onchange={chosen}
  />

  <span class="text-xs text-muted">
    {hint ?? t.design.imageHint(`${Math.round(Asset.LIMIT / Bytes.KILO)} kB`)}
  </span>

  {#if action.error}<Alert error={action.error} />{/if}
</div>
