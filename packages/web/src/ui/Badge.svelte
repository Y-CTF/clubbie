<script lang="ts">
import { Tint, type Tinted } from '../lib/tint.ts';

/**
 * The word is always the caller's, because the caller is the one holding a catalogue. A badge that
 * fell back to the value would print `waitlist` at a German reader.
 */
let { kind, children }: { kind: Tinted; children: import('svelte').Snippet } = $props();
</script>

<span class="badge" style={Tint[kind]}>{@render children()}</span>
