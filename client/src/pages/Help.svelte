<script>
  /** The in-app help (docs/PLAN-help-footer.md 1): the index, or one section with its parts as anchors. */
  import { SECTIONS } from "../help/sections.js";
  import Rich from "../help/Rich.svelte";
  let { id = null } = $props();
  const at = $derived(id ? SECTIONS.findIndex(s => s.id === id) : -1);
  const sec = $derived(at >= 0 ? SECTIONS[at] : null);
</script>

{#if id && !sec}
  <h1>No such help page</h1>
  <p><a href="/help">All help topics</a></p>
{:else if !sec}
  <h1>Help</h1>
  <p class="muted">How to use every part of the app. Each page also has a <strong>How this works</strong> link to its own topic.</p>
  <ul class="list">
    {#each SECTIONS as s (s.id)}<li><a class="name" href={`/help/${s.id}`}>{s.title}</a><span class="meta"><Rich text={s.intro.split(". ")[0] + "."} /></span></li>{/each}
  </ul>
{:else}
  <p><a href="/help">← All help topics</a></p>
  <h1>{sec.title}</h1>
  <p><Rich text={sec.intro} /></p>
  {#if sec.parts.length > 1}
    <nav aria-label="On this page"><ul class="toc">{#each sec.parts as p (p.id)}<li><a href={`/help/${sec.id}#${p.id}`}>{p.title}</a></li>{/each}</ul></nav>
  {/if}
  {#each sec.parts as p (p.id)}
    <h2 id={p.id}>{p.title}</h2>
    {#each (sec.shots ?? []).filter(s => s.part === p.id) as shot (shot.file)}
      <figure class="shot"><img src={`/help/${shot.file}`} alt={shot.alt} loading="lazy" width="1280" height="720"></figure>
    {/each}
    {#if p.steps?.length}<ol>{#each p.steps as t, i (i)}<li><Rich text={t} /></li>{/each}</ol>{/if}
    {#each p.notes ?? [] as n, i (i)}<p class="muted small"><Rich text={n} /></p>{/each}
  {/each}
  <nav class="pager" aria-label="More help">
    {#if at > 0}<a href={`/help/${SECTIONS[at - 1].id}`}>← {SECTIONS[at - 1].title}</a>{/if}
    {#if at < SECTIONS.length - 1}<a href={`/help/${SECTIONS[at + 1].id}`}>{SECTIONS[at + 1].title} →</a>{/if}
  </nav>
{/if}

<style>
  ol { padding-left: 1.4rem; max-width: 68ch; }
  ol li { margin: 0 0 .45rem; }
  .toc { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: .3rem 1rem; margin: 0 0 1rem; }
  .shot { margin: .5rem 0 1rem; }
  .shot img { max-width: 100%; height: auto; border: 1px solid var(--line); }
  .pager { display: flex; justify-content: space-between; gap: 1rem; margin-top: 2.5rem; border-top: 1px solid var(--line); padding-top: 1rem; }
  .small { font-size: .9rem; }
</style>
