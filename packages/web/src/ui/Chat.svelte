<script lang="ts">
import { Login } from '@clubbie/auth';
import { api, unwrap } from '../lib/api.ts';
import { Action } from '../lib/action.svelte.ts';
import { words } from '../lib/words/index.svelte.ts';
import Alert from './Alert.svelte';

/**
 * Telegram's login button, which is a script Telegram serves and an element it replaces.
 *
 * The callback has to be reachable by name from a global script, so it is attached to `window`
 * for as long as the component is mounted and taken back off with it.
 */
let { username }: { username: string } = $props();

/**
 * The script Telegram serves, pinned to the version whose attributes these are, and how long to
 * wait before deciding it is not going to draw anything.
 */
const Chat = {
  SCRIPT: 'https://telegram.org/js/telegram-widget.js?22',
  SIZE: 'large',
  PATIENCE: 4000,
} as const;

const t = $derived(words.t);
const action = new Action();
let host = $state<HTMLDivElement | null>(null);
/** Whether Telegram drew its button. It refuses on an origin the bot has no `/setdomain` for. */
let drawn = $state(true);

$effect(() => {
  const named = `clubbieChat${Math.random().toString(36).slice(2)}`;
  (globalThis as Record<string, unknown>)[named] = async (payload: Record<string, unknown>) => {
    const answered = await action.run(async () =>
      unwrap(await api.auth.telegram.$post({ json: payload as never })),
    );
    /** Either a session exists or an address is now owed, and both change the whole page. */
    if (answered) location.assign('/');
  };

  const script = document.createElement('script');
  script.async = true;
  script.src = Chat.SCRIPT;
  script.dataset.telegramLogin = username;
  script.dataset.size = Chat.SIZE;
  script.dataset.userpic = 'false';
  script.dataset.onauth = `${named}(user)`;
  host?.append(script);

  /**
   * Telegram answers an unregistered origin with a page saying so and draws nothing, which on a
   * sign-in page is a blank gap nobody can diagnose. The iframe either appears or this says why.
   */
  const waiting = setTimeout(() => {
    drawn = Boolean(host?.querySelector('iframe'));
  }, Chat.PATIENCE);

  return () => {
    clearTimeout(waiting);
    script.remove();
    delete (globalThis as Record<string, unknown>)[named];
  };
});

</script>

<div class="flex flex-col items-center gap-2">
  <div bind:this={host} aria-label={t.signIn.continueWith(Login.NAME)}></div>

  {#if !drawn}
    <p class="text-xs text-muted">
      {t.signIn.chatUnavailable}
      <span class="mt-1 block font-mono text-[0.7rem]">{t.signIn.chatDomain(username)}</span>
    </p>
  {/if}

  {#if action.error}
    <Alert error={action.error} />
  {/if}
</div>
