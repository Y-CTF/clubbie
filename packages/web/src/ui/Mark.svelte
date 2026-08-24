<script lang="ts">
/**
 * A sign-in provider's own logo.
 *
 * The marks are drawn here rather than fetched, because a sign-in page that waits on somebody
 * else's CDN is a sign-in page that is down when they are, and because these are the only images
 * in the app that are not a club's own upload.
 *
 * A provider with no mark gets the generic one instead of nothing: `Providers` is a table the
 * server owns, and a deployment that adds an entry to it must not get a blank button here.
 */
let { provider }: { provider: string } = $props();
</script>

{#if provider === 'eduid'}
  <!-- SWITCH edu-ID, from their design guidelines: a white disc, `eD` in their blue. -->
  <svg viewBox="0 0 192 195.58" class="size-8" role="img" aria-hidden="true">
    <path fill="#fff" d="M96,192C42.98,192,0,149.02,0,96S42.98,0,96,0s96,42.98,96,96-42.98,96-96,96" />
    <path fill="#33749e" d="M33.04,39.12h23.24v113.77h-23.24V39.12Z" />
    <path
      fill="#33749e"
      d="M81.57,39.12h37.49c32.69,0,58.49,25.16,58.49,56.89s-25.8,56.88-58.49,56.88h-37.49V39.12ZM119.06,131.57c21,0,35.09-15.86,35.09-35.57s-14.1-35.58-35.09-35.58h-14.26v71.15h14.26Z"
    />
    <path fill="#fff" d="M176.99,195.58c-4.42,0-8-3.58-8-8s3.58-8,8-8,8,3.58,8,8-3.58,8-8,8" />
  </svg>
{:else if provider === 'github'}
  <svg viewBox="0 0 16 16" class="size-8 fill-ink" role="img" aria-hidden="true">
    <path
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
         0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01
         1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95
         0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0
         1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0
         3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0
         16 8c0-4.42-3.58-8-8-8Z"
    />
  </svg>
{:else}
  <!-- Anything else: a key, which is what every one of these does. -->
  <svg viewBox="0 0 24 24" class="size-8 stroke-muted" fill="none" stroke-width="1.5" role="img" aria-hidden="true">
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M18 12v3M15 12v2" stroke-linecap="round" />
  </svg>
{/if}
