<script>
  import { get, mutate } from "../lib/api.js";
  import { go } from "../lib/router.svelte.js";
  let { id } = $props();
  let doc = $state(null), name = $state(""), notes = $state(""), revisions = $state([]), error = $state(""), saved = $state(""), busy = $state(false);
  let saveKey = crypto.randomUUID();   // one key per SAVE attempt: a retry of the same save reuses it
  const when = (ms) => new Date(ms).toLocaleString();
  const dirty = $derived(doc && (name !== doc.body.name || notes !== doc.body.notes));

  async function load() {
    try {
      doc = await get(`/api/documents/${id}`);
      name = doc.body.name; notes = doc.body.notes;
      revisions = (await get(`/api/documents/${id}/revisions`)).revisions;
      error = "";
    } catch (err) { error = err.message; }
  }
  async function save(ev) {
    ev.preventDefault();
    busy = true; saved = "";
    try {
      await mutate("PUT", `/api/documents/${id}`, { name: name.trim(), notes, revision: doc.document.revision }, saveKey);
      saveKey = crypto.randomUUID();
      await load(); saved = "Saved.";
    } catch (err) {
      error = err.code === "stale" ? "This draft changed somewhere else. Reload to see it — your text is still in the boxes." : err.message;
      if (err.code !== "network") saveKey = crypto.randomUUID();
    }
    busy = false;
  }
  async function bringBack(n) {
    try { await mutate("POST", `/api/documents/${id}/revisions/${n}/restore`, { revision: doc.document.revision }); await load(); saved = `Revision ${n} is current again.`; }
    catch (err) { error = err.message; }
  }
  async function remove() {
    try { await mutate("DELETE", `/api/documents/${id}`, { revision: doc.document.revision }); go("/"); }
    catch (err) { error = err.message; }
  }
  load();
</script>

<p><a href="/">← Library</a></p>
{#if error}<p class="notice bad" role="alert">{error}</p>{/if}
{#if saved}<p class="notice good" role="status">{saved}</p>{/if}

{#if !doc}
  {#if !error}<p class="muted prompt">Loading…</p>{/if}
{:else}
  <h1>{doc.document.name}</h1>
  <p class="muted">{doc.document.kind} · revision {doc.document.revision} · saved {when(doc.document.updatedAt)}</p>
  <form class="stack wide" onsubmit={save}>
    <label><span>Name</span><input bind:value={name} maxlength="200" required></label>
    <label><span>Notes</span><textarea bind:value={notes} maxlength="100000"></textarea></label>
    <div class="row">
      <button disabled={busy || !dirty || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
      <a class="button quiet" href={`/api/documents/${id}/download`} download>Download JSON</a>
      <button type="button" class="danger" onclick={remove}>Delete</button>
    </div>
  </form>

  <h2>History</h2>
  <ul class="list">
    {#each revisions as r (r.revision)}
      <li>
        <span class="name">Revision {r.revision}{r.note ? ` — ${r.note}` : ""}</span>
        <span class="meta">{when(r.createdAt)}</span>
        {#if r.revision !== doc.document.revision}<button class="quiet" onclick={() => bringBack(r.revision)}>Bring back</button>{/if}
      </li>
    {/each}
  </ul>
{/if}
