<script>
  /** The site footer (docs/PLAN-help-footer.md 2): the board, links, the version and the content, the fan notice. */
  import { tick } from "svelte";
  import { get } from "./api.js";
  import { prefs, setBanter } from "./prefs.svelte.js";
  import Board from "./Board.svelte";
  let about = $state(null), content = $state(null), error = $state(""), showBtn = $state();
  get("/api/about").then(a => { about = a; }).catch(() => { /* the footer stays without a version */ });
  let asked = 0;
  $effect(() => {
    const mine = ++asked;   // a late answer after sign-out (or a newer ask) is dropped (code review r1 #1)
    if (!prefs.signedIn) { content = null; return; }
    get("/api/about/content").then(c => { if (mine === asked && prefs.signedIn) content = c.content; }).catch(() => { if (mine === asked) content = null; });
  });
  const system = $derived(content?.find(c => c.id === "sr2e"));
  async function show() {
    try { await setBanter(true); error = ""; } catch (err) { error = err.message; }
  }
  /** After Hide, focus goes to the control that brings the board back (it replaces the board in place). */
  async function hidden() { await tick(); showBtn?.focus(); }
</script>

<footer class="site">
  {#if prefs.banter}<Board onHidden={hidden} />
  {:else}<p><button type="button" class="quiet small" bind:this={showBtn} onclick={show}>Show the Shadowland board</button></p>{/if}
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  <nav aria-label="Site">
    <a href="/help">Help</a>
    <a href="/help/accessibility">Accessibility</a>
    <a href="/whats-new">What's new</a>
    <a href="/help/getting-started#problems">Report a problem</a>
  </nav>
  <p class="small muted">Hoi, chummer!{#if about} {about.app}{/if}{#if system} · rules: sr2e-foundryvtt v{system.version}{#if content.length > 1} · {content.length - 1} sourcebook modules{/if}{/if}</p>
  {#if content?.length > 1}
    <details class="small"><summary>The content this node runs</summary>
      <ul class="plain">{#each content as c (c.id)}<li>{c.name} v{c.version}</li>{/each}</ul>
    </details>
  {/if}
  <p class="small muted">Unofficial fan project. Shadowrun and its marks belong to their owners; this site isn't affiliated with or endorsed by them.</p>
</footer>

<style>
  .site { border-top: 1px solid var(--line); margin-top: 3rem; padding-top: 1.25rem; }
  .site nav { margin: 0 0 .6rem; }
  .small { font-size: .85rem; }
  .site p { margin: 0 0 .5rem; }
  ul.plain { list-style: none; padding: 0; margin: .4rem 0 0; columns: 2 14rem; }
</style>
