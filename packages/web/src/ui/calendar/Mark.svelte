<script lang="ts">
import { Elsewhere } from '../../lib/elsewhere.ts';

/**
 * The mark of a calendar somebody already keeps.
 *
 * Each is the vendor's own logo, drawn here rather than fetched, for the reason `ui/Mark.svelte`
 * gives about the sign-in logos: a page that waits on somebody else's CDN is a page that is down
 * when they are. They keep their own colours, because a logo is somebody else's decision and does
 * not move when the club repaints. Apple's is the exception and not one: that mark is black or
 * white by design, so it takes whichever the page is written in.
 *
 * Every id inside them is prefixed with this instance's own, which is what stops the second mark on
 * a page from pointing its gradients at the first one's definitions.
 *
 * The name is on the link rather than under the mark: this is a row of three doors, and three
 * product names in a row reads as a sentence.
 */
let { where, size = 'size-5' }: { where: Elsewhere; size?: string } = $props();

const uid = $props.id();
</script>

{#if where === Elsewhere.Google}
  <svg viewBox="0 0 512 512" class={size} role="img" aria-hidden="true" fill="none">
    <g clip-path="url(#{uid}-clip0_5072_3766)">
      <path d="M390.736 121.264H121.264V390.736H390.736V121.264Z" fill="white"/>
      <path d="M390.736 512L512 390.736L451.368 380.392L390.736 390.736L379.67 446.196L390.736 512Z" fill="#EA4335"/>
      <path d="M0 390.736V471.578C0 493.912 18.088 512 40.42 512H121.264L133.714 451.368L121.264 390.736L55.198 380.392L0 390.736Z" fill="#188038"/>
      <path d="M512 121.264V40.42C512 18.088 493.912 0 471.58 0H390.736C383.36 30.072 379.671 52.2027 379.67 66.392C379.67 80.58 383.359 98.8707 390.736 121.264C417.556 128.944 437.767 132.784 451.368 132.784C464.969 132.784 485.18 128.945 512 121.264Z" fill="#1967D2"/>
      <path d="M512 121.264H390.736V390.736H512V121.264Z" fill="#FBBC04"/>
      <path d="M390.736 390.736H121.264V512H390.736V390.736Z" fill="#34A853"/>
      <path d="M390.736 0H40.422C18.088 0 0 18.088 0 40.42V390.736H121.264V121.264H390.736V0Z" fill="#4285F4"/>
      <path d="M176.54 330.308C166.468 323.504 159.494 313.568 155.688 300.428L179.066 290.796C181.186 298.88 184.891 305.145 190.182 309.592C195.436 314.038 201.836 316.228 209.314 316.228C216.959 316.228 223.527 313.903 229.018 309.254C234.51 304.606 237.272 298.678 237.272 291.504C237.272 284.16 234.375 278.164 228.582 273.516C222.788 268.868 215.512 266.544 206.822 266.544H193.314V243.404H205.44C212.917 243.404 219.216 241.382 224.336 237.338C229.456 233.298 232.016 227.772 232.016 220.732C232.016 214.468 229.726 209.482 225.146 205.744C220.566 202.004 214.77 200.118 207.73 200.118C200.858 200.118 195.402 201.938 191.36 205.608C187.319 209.289 184.282 213.937 182.534 219.116L159.394 209.482C162.458 200.792 168.084 193.112 176.336 186.476C184.588 179.84 195.132 176.506 207.932 176.506C217.398 176.506 225.92 178.326 233.466 181.996C241.01 185.668 246.938 190.754 251.216 197.222C255.496 203.722 257.616 210.998 257.616 219.082C257.616 227.334 255.63 234.308 251.656 240.034C247.682 245.76 242.796 250.138 237.002 253.204V254.584C244.483 257.669 250.982 262.735 255.798 269.238C260.682 275.806 263.142 283.654 263.142 292.818C263.142 301.978 260.816 310.164 256.168 317.338C251.52 324.514 245.088 330.172 236.934 334.282C228.75 338.392 219.554 340.482 209.348 340.482C197.524 340.514 186.612 337.112 176.54 330.308ZM320.132 214.298L294.466 232.858L281.632 213.39L327.678 180.176H345.328V336.842H320.132V214.298Z" fill="#4285F4"/>
      </g>
      <defs>
      <clipPath id="{uid}-clip0_5072_3766">
      <rect width="512" height="512" fill="white"/>
      </clipPath>
      </defs>
  </svg>
{:else if where === Elsewhere.Outlook}
  <svg viewBox="60 90.4 570.02 539.67" class={size} role="img" aria-hidden="true">
    <defs>
      <linearGradient id="{uid}-a" x1="9.989" x2="30.932" y1="22.365" y2="9.375" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse">
      <stop offset="0" style="stop-color:#20a7fa;stop-opacity:1"/>
      <stop offset=".4" style="stop-color:#3bd5ff;stop-opacity:1"/>
      <stop offset="1" style="stop-color:#c4b0ff;stop-opacity:1"/>
      </linearGradient>
      <linearGradient id="{uid}-b" x1="17.197" x2="28.856" y1="26.794" y2="8.126" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse">
      <stop offset="0" style="stop-color:#165ad9;stop-opacity:1"/>
      <stop offset=".501" style="stop-color:#1880e5;stop-opacity:1"/>
      <stop offset="1" style="stop-color:#8587ff;stop-opacity:1"/>
      </linearGradient>
      <linearGradient id="{uid}-c" x1="25.701" x2="12.756" y1="27.048" y2="16.501" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse">
      <stop offset=".237" style="stop-color:#448aff;stop-opacity:0"/>
      <stop offset=".792" style="stop-color:#0032b1;stop-opacity:.2"/>
      </linearGradient>
      <linearGradient id="{uid}-d" x1="24.053" x2="44.51" y1="31.11" y2="18.018" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse">
      <stop offset="0" style="stop-color:#1a43a6;stop-opacity:1"/>
      <stop offset=".492" style="stop-color:#2052cb;stop-opacity:1"/>
      <stop offset="1" style="stop-color:#5f20cb;stop-opacity:1"/>
      </linearGradient>
      <linearGradient id="{uid}-e" x1="29.828" x2="17.397" y1="30.327" y2="19.571" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse">
      <stop offset="0" style="stop-color:#0045b9;stop-opacity:0"/>
      <stop offset=".67" style="stop-color:#0d1f69;stop-opacity:.2"/>
      </linearGradient>
      <linearGradient id="{uid}-g" x1="41.998" x2="23.852" y1="29.943" y2="29.943" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse">
      <stop offset="0" style="stop-color:#4dc4ff;stop-opacity:1"/>
      <stop offset=".196" style="stop-color:#0fafff;stop-opacity:1"/>
      </linearGradient>
      <linearGradient id="{uid}-k" x1="3.458" x2="20.929" y1="37.872" y2="37.86" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse">
      <stop offset=".206" style="stop-color:#6ce0ff;stop-opacity:1"/>
      <stop offset=".535" style="stop-color:#50d5ff;stop-opacity:0"/>
      </linearGradient>
      <radialGradient id="{uid}-f" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(0 -405.04051 438.393 0 360.027 102.268)" gradientUnits="userSpaceOnUse">
      <stop offset=".568" style="stop-color:#275ff0;stop-opacity:0"/>
      <stop offset=".992" style="stop-color:#002177;stop-opacity:1"/>
      </radialGradient>
      <radialGradient id="{uid}-h" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="scale(173.58) rotate(-45 5.168 -1.292)" gradientUnits="userSpaceOnUse">
      <stop offset=".259" style="stop-color:#0060d1;stop-opacity:.4"/>
      <stop offset=".908" style="stop-color:#0383f1;stop-opacity:0"/>
      </radialGradient>
      <radialGradient id="{uid}-i" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(357.40702 -468.44593 423.59457 323.18709 159.471 697.08)" gradientUnits="userSpaceOnUse">
      <stop offset=".732" style="stop-color:#f4a7f7;stop-opacity:0"/>
      <stop offset="1" style="stop-color:#f4a7f7;stop-opacity:.501961"/>
      </radialGradient>
      <radialGradient id="{uid}-j" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(-170.86087 259.7254 -674.01813 -443.40415 278.562 412.979)" gradientUnits="userSpaceOnUse">
      <stop offset="0" style="stop-color:#49deff;stop-opacity:1"/>
      <stop offset=".724" style="stop-color:#29c3ff;stop-opacity:1"/>
      </radialGradient>
      <radialGradient id="{uid}-l" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="rotate(46.924 -378.504 245.25) scale(315.927)" gradientUnits="userSpaceOnUse">
      <stop offset=".039" style="stop-color:#0091ff;stop-opacity:1"/>
      <stop offset=".919" style="stop-color:#183dad;stop-opacity:1"/>
      </radialGradient>
      <radialGradient id="{uid}-m" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(0 168 -193.782 0 180 491.159)" gradientUnits="userSpaceOnUse">
      <stop offset=".558" style="stop-color:#0fa5f7;stop-opacity:0"/>
      <stop offset="1" style="stop-color:#74c6ff;stop-opacity:.501961"/>
      </radialGradient>
      </defs>
      <path d="m463.984 140.145-344.347 218.27-29.614-46.72v-40.257a43.26 43.26 0 0 1 19.72-36.293L309.91 105.258c30.496-19.79 69.777-19.793 100.277-.008Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-a)"/>
      <path d="M407.102 103.34a91.293 91.293 0 0 1 3.082 1.914l156.214 101.332-387.336 245.52-59.437-93.77L403.895 177.8c26.925-17.102 28.105-55.57 3.207-74.461Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-b)"/>
      <path d="M407.102 103.34a91.293 91.293 0 0 1 3.082 1.914l156.214 101.332-387.336 245.52-59.437-93.77L403.895 177.8c26.925-17.102 28.105-55.57 3.207-74.461Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-c)"/>
      <path d="M333.602 498.988 179.066 452.11 507.63 243.836c27.672-17.54 27.601-57.938-.133-75.379l-1.48-.93 4.261 2.649 99.996 64.867a43.263 43.263 0 0 1 19.723 36.3v38.962Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-d)"/>
      <path d="M333.602 498.988 179.066 452.11 507.63 243.836c27.672-17.54 27.601-57.938-.133-75.379l-1.48-.93 4.261 2.649 99.996 64.867a43.263 43.263 0 0 1 19.723 36.3v38.962Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-e)"/>
      <path d="M410.188 105.25c-30.5-19.785-69.782-19.781-100.282.008L109.742 235.145a43.26 43.26 0 0 0-19.719 36.292v1.97a44.479 44.479 0 0 0 20.735 36.16l248.887 156.91L609.16 309.805a44.468 44.468 0 0 0 20.824-37.664v38.168l.008-38.965c0-14.66-7.426-28.32-19.722-36.301Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-f)"/>
      <path d="M315.77 630.05h220.449c51.777 0 93.75-41.972 93.75-93.75V272.14c0 15.301-7.864 29.528-20.82 37.665l-327.907 205.89a60.712 60.712 0 0 0-28.422 51.414c.004 34.762 28.184 62.942 62.95 62.942Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-g)"/>
      <path d="M315.77 630.05h220.449c51.777 0 93.75-41.972 93.75-93.75V272.14c0 15.301-7.864 29.528-20.82 37.665l-327.907 205.89a60.712 60.712 0 0 0-28.422 51.414c.004 34.762 28.184 62.942 62.95 62.942Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-h)"/>
      <path d="M315.77 630.05h220.449c51.777 0 93.75-41.972 93.75-93.75V272.14c0 15.301-7.864 29.528-20.82 37.665l-327.907 205.89a60.712 60.712 0 0 0-28.422 51.414c.004 34.762 28.184 62.942 62.95 62.942Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-i)"/>
      <path d="M405.402 630.035H183.738c-51.777 0-93.75-41.972-93.75-93.75v-264.34a44.473 44.473 0 0 0 20.754 37.621l327.582 206.52a61.737 61.737 0 0 1 28.809 52.226c-.004 34.09-27.64 61.723-61.73 61.723Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-j)"/>
      <path d="M405.402 630.035H183.738c-51.777 0-93.75-41.972-93.75-93.75v-264.34a44.473 44.473 0 0 0 20.754 37.621l327.582 206.52a61.737 61.737 0 0 1 28.809 52.226c-.004 34.09-27.64 61.723-61.73 61.723Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-k)"/>
      <path d="M108.75 345h142.5c26.926 0 48.75 21.824 48.75 48.75v142.5c0 26.926-21.824 48.75-48.75 48.75h-142.5C81.824 585 60 563.176 60 536.25v-142.5C60 366.824 81.824 345 108.75 345Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-l)"/>
      <path d="M108.75 345h142.5c26.926 0 48.75 21.824 48.75 48.75v142.5c0 26.926-21.824 48.75-48.75 48.75h-142.5C81.824 585 60 563.176 60 536.25v-142.5C60 366.824 81.824 345 108.75 345Zm0 0" style="stroke:none;fill-rule:nonzero;fill:url(#{uid}-m)"/>
      <path d="M179.387 534c-19.848 0-36.137-6.21-48.875-18.625-12.739-12.414-19.11-28.617-19.11-48.605 0-21.11 6.465-38.18 19.395-51.22C143.73 402.517 160.66 396 181.594 396c19.781 0 35.879 6.238 48.297 18.715 12.484 12.476 18.726 28.93 18.726 49.351 0 20.985-6.469 37.899-19.398 50.75C216.352 527.606 199.742 534 179.387 534Zm.574-26.352c10.816 0 19.523-3.695 26.117-11.082 6.594-7.386 9.89-17.664 9.89-30.824 0-13.719-3.202-24.394-9.6-32.031-6.403-7.637-14.95-11.453-25.638-11.453-11.011 0-19.878 3.941-26.597 11.824-6.723 7.824-10.082 18.191-10.082 31.102 0 13.101 3.36 23.468 10.082 31.101 6.719 7.574 15.328 11.363 25.828 11.363Zm0 0" style="stroke:none;fill-rule:nonzero;fill:#fff;fill-opacity:1"/>
      <path d="M179.332 535.848c-19.77 0-36-6.375-48.691-19.13-12.688-12.753-19.036-29.398-19.036-49.929 0-21.684 6.442-39.219 19.325-52.61 12.882-13.394 29.75-20.09 50.601-20.09 19.703 0 35.742 6.411 48.114 19.227 12.437 12.82 18.652 29.72 18.652 50.7 0 21.55-6.442 38.93-19.32 52.129-12.82 13.136-29.368 19.703-49.645 19.703Zm.57-27.067c10.778 0 19.453-3.797 26.02-11.383 6.57-7.59 9.851-18.144 9.851-31.664 0-14.093-3.187-25.058-9.562-32.902-6.379-7.844-14.89-11.766-25.54-11.766-10.972 0-19.804 4.047-26.5 12.149-6.694 8.031-10.042 18.683-10.042 31.945 0 13.457 3.348 24.106 10.043 31.95 6.695 7.78 15.273 11.671 25.73 11.671Zm0 0" style="stroke:none;fill-rule:nonzero;fill:#fff;fill-opacity:1"/>
  </svg>
{:else}
  <svg viewBox="0 0 24 24" class={size} role="img" aria-hidden="true" fill="currentColor">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
  </svg>
{/if}
