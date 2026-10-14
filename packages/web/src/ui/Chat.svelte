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
  /** The frame's origin, and the message its button posts once it has drawn. */
  ORIGIN: 'https://oauth.telegram.org',
  RESIZE: 'resize',
} as const;

const t = $derived(words.t);
const action = new Action();
let host = $state<HTMLDivElement | null>(null);
/**
 * Whether Telegram drew its button. On an origin the bot has no `/setdomain` for it still serves
 * a frame, holding the words "Bot domain invalid" and nothing that posts a message.
 */
let drawn = $state(true);
/** Who Telegram vouched for, once it has, while an address is still owed. */
let proved = $state<string | null>(null);

$effect(() => {
  const named = `clubbieChat${Math.random().toString(36).slice(2)}`;
  (globalThis as Record<string, unknown>)[named] = async (payload: Record<string, unknown>) => {
    const answered = await action.run(async () =>
      unwrap(await api.auth.telegram.$post({ json: payload as never })),
    );
    if (!answered) return;
    /**
     * A chat that belongs to nobody yet has no session to reload into: the page would come back
     * identical, and the person would not know their tap had done anything. Tell them what is
     * owed instead; the chat is parked server-side and linked when the address is proved.
     */
    if (answered.enrol) {
      proved = String(payload.first_name ?? payload.username ?? '');
      return;
    }
    location.assign('/');
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
  let answered = false;
  const heard = (event: MessageEvent) => {
    if (event.origin !== Chat.ORIGIN) return;
    try {
      const body = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (body?.event === Chat.RESIZE) answered = true;
    } catch {
      /** Not ours to read. */
    }
  };
  window.addEventListener('message', heard);
  const waiting = setTimeout(() => {
    drawn = answered;
  }, Chat.PATIENCE);

  return () => {
    window.removeEventListener('message', heard);
    clearTimeout(waiting);
    script.remove();
    delete (globalThis as Record<string, unknown>)[named];
  };
});

</script>

<div class="flex flex-col items-center gap-2">
  <div bind:this={host} class:hidden={!drawn} aria-label={t.signIn.continueWith(Login.NAME)}></div>

  {#if !drawn}
    <p class="text-xs text-muted">
      {t.signIn.chatUnavailable}
      <span class="mt-1 block font-mono text-[0.7rem]">{t.signIn.chatDomain(username)}</span>
    </p>
  {/if}

  {#if proved !== null}
    <p class="text-xs text-muted" role="status">{t.signIn.chatProved(proved)}</p>
  {/if}

  {#if action.error}
    <Alert error={action.error} />
  {/if}
</div>
