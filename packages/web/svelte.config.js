import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * The SPA's Svelte configuration. It exists mostly to say two things out loud that were previously
 * being inferred: components are TypeScript, and the app is in runes mode.
 *
 * `runes: true` is not decoration. Without it a component that used `export let` or a bare `$:`
 * would compile in legacy mode and quietly behave differently from every other component here;
 * with it, that is an error. Everything in `src/` is already written in runes.
 *
 * It is `.js` rather than `.ts` because this is the one file the Svelte tooling loads itself,
 * before any of the pipeline that would compile TypeScript for it.
 */
export default {
  preprocess: vitePreprocess(),
  compilerOptions: { runes: true },
};
