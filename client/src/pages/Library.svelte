<script>
  import { get, mutate } from "../lib/api.js";
  import { go } from "../lib/router.svelte.js";
  let docs = $state(null), trash = $state([]), error = $state(""), name = $state(""), busy = $state(false);
  const when = (ms) => new Date(ms).toLocaleString();

  async function load() {
    try { [docs, trash] = await Promise.all([get("/api/documents"), get("/api/documents?deleted=1")]).then(r => r.map(x => x.documents)); error = ""; }
    catch (err) { error = err.message; docs ??= []; }
  }
  async function create(ev) {
    ev.preventDefault();
    busy = true;
    try { const { document } = await mutate("POST", "/api/documents", { name: name.trim() }); go(`/doc/${document.id}`); }
    catch (err) { error = err.message; }
    busy = false;
  }
  async function restore(d) {
    try { await mutate("POST", `/api/documents/${d.id}/restore`, { revision: d.revision }); await load(); }
    catch (err) { error = err.message; await load(); }
  }
  load();
</script>

<h1>Your library</h1>
<p class="muted">Drafts only for now: characters arrive when the rules engine does.</p>
{#if error}<p class="notice bad" role="alert">{error}</p>{/if}

<form class="row" onsubmit={create}>
  <label class="grow"><span>New draft</span><input bind:value={name} maxlength="200" placeholder="Street name" required></label>
  <button disabled={busy || !name.trim()}>Start</button>
</form>

{#if docs === null}
  <p class="muted prompt">Loading…</p>
{:else if docs.length === 0}
  <p class="muted">Nothing on file yet. Name a draft above to start one.</p>
{:else}
  <ul class="list">
    {#each docs as d (d.id)}
      <li><a class="name" href={`/doc/${d.id}`}>{d.name}</a><span class="meta">{d.kind} · rev {d.revision} · {when(d.updatedAt)}</span></li>
    {/each}
  </ul>
{/if}

{#if trash.length}
  <h2>Deleted</h2>
  <p class="muted">Gone for good 30 days after deletion.</p>
  <ul class="list">
    {#each trash as d (d.id)}
      <li><span class="name">{d.name}</span><span class="meta">deleted {when(d.deletedAt)}</span><button class="quiet" onclick={() => restore(d)}>Restore</button></li>
    {/each}
  </ul>
{/if}
