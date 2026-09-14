<script lang="ts">
import { Signin } from '@clubbie/core';
import { api, unwrap } from '../lib/api.ts';
import { Action } from '../lib/action.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from './Alert.svelte';
import Button from './Button.svelte';
import Field from './Field.svelte';
import Input from './Input.svelte';

/**
 * Signing in with an address. Two steps in one component, because they are one act: ask, then
 * either follow the link from the mail or type the code back here.
 *
 * The code box appears rather than replacing the form, so somebody who mistyped their address can
 * see what they sent and fix it without starting again.
 */
const t = $derived(words.t);
const action = new Action();
let email = $state('');
let code = $state('');
let sent = $state<string | null>(null);

async function ask(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const address = email.trim();
  if (!address) return;

  const answered = await action.run(async () =>
    unwrap(await api.auth.email.$post({ json: { email: address } })),
  );
  if (answered) sent = address;
}

/** Asking again from the code step, where there is no form to submit. */
async function resend(): Promise<void> {
  const answered = await action.run(async () =>
    unwrap(await api.auth.email.$post({ json: { email: sent ?? email.trim() } })),
  );
  if (answered) code = '';
}

async function verify(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (Signin.typed(code).length !== Signin.DIGITS) return;

  const answered = await action.run(async () =>
    unwrap(await api.auth.email.code.$post({ json: { email: sent ?? email, code } })),
  );
  /** A session exists now, so the whole app has to be re-read rather than patched around. */
  if (answered) location.assign('/');
}
</script>

<div class="flex flex-col gap-3">
  <form onsubmit={ask} class="flex flex-col gap-3">
    <Field label={t.signIn.email.label} hint={sent ? undefined : t.signIn.email.hint}>
      <Input bind:value={email} type="email" autocomplete="email" required />
    </Field>

    {#if !sent}
      <Button type="submit" disabled={action.busy}>
        {action.busy ? t.signIn.email.sending : t.signIn.email.send}
      </Button>
    {/if}
  </form>

  {#if sent}
    <p class="text-xs text-muted">{t.signIn.email.sent(sent)}</p>

    <form onsubmit={verify} class="flex flex-col gap-3">
      <Field label={t.signIn.email.code} hint={t.signIn.email.codeHint}>
        <Input
          bind:value={code}
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength={Signin.DIGITS + Signin.GROUP}
        />
      </Field>

      <div class="flex gap-2">
        <Button type="submit" disabled={action.busy}>{t.signIn.email.verify}</Button>
        <Button disabled={action.busy} onclick={resend}>{t.signIn.email.again}</Button>
      </div>
    </form>
  {/if}

  {#if action.error}
    <Alert error={action.error} />
  {/if}
</div>
