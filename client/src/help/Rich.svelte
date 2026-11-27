<script>
  /** One help string, its tokens rendered as text, <strong> and internal links (Svelte escapes every value). */
  import { tokens } from "./markup.js";
  let { text } = $props();
</script>
{#each tokens(text) as t, i (i)}{#if t.bold}<strong>{t.bold}</strong>{:else if t.link}<a href={t.href}>{t.link}</a>{:else}{t.text}{/if}{/each}
