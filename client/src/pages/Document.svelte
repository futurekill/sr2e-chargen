<script>
  import { get, mutate } from "../lib/api.js";
  import { go } from "../lib/router.svelte.js";
  import Character from "./Character.svelte";
  let { id } = $props();
  let doc = $state(null), name = $state(""), notes = $state(""), revisions = $state([]), error = $state(""), saved = $state(""), busy = $state(false);
  let lost = null;   // the save that got no answer (it may or may not have landed)
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
    busy = true; saved = ""; error = "";
    try {
      const payload = { name: name.trim(), notes, revision: doc.document.revision };
      // After a save that got no answer: the SAME text goes out as the same request (the server replays it if it
      // landed — no second revision). CHANGED text first finds out where the draft stands, then goes on top.
      if (lost && (lost.name !== payload.name || lost.notes !== payload.notes)) payload.revision = (await get(`/api/documents/${id}`)).document.revision;
      else if (lost) payload.revision = lost.revision;
      lost = payload;
      await mutate("PUT", `/api/documents/${id}`, payload);
      lost = null;
      await load(); saved = "Saved.";
    } catch (err) {
      if (err.code !== "network") lost = null;
      error = err.code === "stale" ? "This draft changed somewhere else. Reload to see it — your text is still in the boxes."
        : err.code === "network" ? "The line dropped, so the save may not have landed. Your text is still here: press Save again." : err.message;
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
{:else if doc.document.kind === "character"}
  <Character {doc} onDeleted={remove} />
{:else}
  <h1>{doc.document.name}</h1>
  <p class="muted">{doc.document.kind} · revision {doc.document.revision} · saved {when(doc.document.updatedAt)}</p>
  <form class="stack wide" onsubmit={save}>
    <!-- Locked while a save is in flight: what comes back replaces the boxes, so nothing typed meanwhile can be lost. -->
    <label><span>Name</span><input bind:value={name} maxlength="200" required readonly={busy}></label>
    <label><span>Notes</span><textarea bind:value={notes} maxlength="100000" readonly={busy}></textarea></label>
    <div class="row">
      <button disabled={busy || !dirty || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
      <a class="button quiet" href={`/api/documents/${id}/download`} download>Download JSON</a>
      <button type="button" class="danger" onclick={remove}>Delete</button>
    </div>
  </form>

  <details>
    <summary>Stored JSON</summary>
    <pre class="json">{JSON.stringify(doc.body, null, 2)}</pre>
  </details>

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
