<script>
  /** What's new (docs/PLAN-help-footer.md 2): the latest releases, from the CHANGELOG the app was built with. */
  import changelog from "../../../CHANGELOG.md?raw";
  import { releases } from "../../../shared/changelog.mjs";
  import Rich from "../help/Rich.svelte";
  const list = releases(changelog, 8);
</script>

<h1>What's new</h1>
<p class="muted">The latest releases of this app, newest first.</p>
{#each list as r (r.version)}
  <h2 id={`v${r.version.replace(/[^0-9a-z.-]/gi, "")}`}>{r.version} <span class="muted small">{r.date}{r.note ? ` · ${r.note}` : ""}</span></h2>
  {#each r.paragraphs as p, i (i)}<p><Rich text={p} /></p>{/each}
  {#if r.items.length}<ul>{#each r.items as it, i (i)}<li><Rich text={it} /></li>{/each}</ul>{/if}
{/each}

<style>
  ul { padding-left: 1.3rem; max-width: 72ch; }
  li { margin: 0 0 .5rem; }
  .small { font-size: .85rem; font-weight: 400; }
</style>
