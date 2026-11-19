<script>
  import { get, mutate } from "../lib/api.js";
  import { go } from "../lib/router.svelte.js";
  let docs = $state(null), trash = $state([]), archived = $state([]), error = $state(""), name = $state(""), kind = $state("character"), busy = $state(false);
  const when = (ms) => new Date(ms).toLocaleString();

  /** Every page of a listing (a library holds up to 200; the API hands out 100 at a time). */
  async function all(query) {
    const out = [];
    for (let offset = 0; ; offset += 100) {
      const page = (await get(`/api/documents?limit=100&offset=${offset}${query}`)).documents;
      out.push(...page);
      if (page.length < 100) return out;
    }
  }
  let loads = 0;
  async function load() {
    const mine = ++loads;   // only the newest refresh lands
    try { const got = await Promise.all([all(""), all("&deleted=1"), all("&archived=1")]); if (mine === loads) { [docs, trash, archived] = got; error = ""; } }
    catch (err) { if (mine === loads) { error = err.message; docs ??= []; } }
  }
  async function create(ev) {
    ev.preventDefault();
    busy = true;
    try { const { document } = await mutate("POST", kind === "character" ? "/api/documents/characters" : "/api/documents", { name: name.trim() }); go(`/doc/${document.id}`); }
    catch (err) {
      // No answer doesn't mean it didn't happen. Pressing Start again with the same name is safe: it replays.
      if (err.code === "network") error = "The line dropped. Press Start again — if it already went through, you'll get that one, not a second.";
      else error = err.message;
    }
    busy = false;
  }
  async function restore(d) {
    try { await mutate("POST", `/api/documents/${d.id}/restore`, { revision: d.revision }); await load(); }
    catch (err) { await load(); error = err.message; }
  }
  async function archive(d, on) {
    try { await mutate("POST", `/api/documents/${d.id}/archive`, { archived: on }); await load(); }
    catch (err) { await load(); error = err.message; }
  }
  load();
</script>

<h1>Your library</h1>
<p class="muted">Characters are built step by step with the core book's Priority system. Drafts are free-text notes.</p>
{#if error}<p class="notice bad" role="alert">{error}</p>{/if}

<form class="row" onsubmit={create}>
  <label class="grow"><span>Name</span><input bind:value={name} maxlength={kind === "character" ? 120 : 200} placeholder="Street name" required></label>
  <label><span>Kind</span><select bind:value={kind}><option value="character">Character</option><option value="draft">Draft</option></select></label>
  <button disabled={busy || !name.trim()}>Start</button>
</form>

{#if docs === null}
  <p class="muted prompt">Loading…</p>
{:else if docs.length === 0}
  <p class="muted">Nothing on file yet. Name a character above to start one.</p>
{:else}
  <ul class="list">
    {#each docs as d (d.id)}
      <li><a class="name" href={`/doc/${d.id}`}>{d.name}</a><span class="meta">{d.kind} · rev {d.revision} · {when(d.updatedAt)}</span><button class="quiet" onclick={() => archive(d, true)} aria-label={`Archive ${d.name}`}>Archive</button></li>
    {/each}
  </ul>
{/if}

{#if archived.length}
  <h2>Archived</h2>
  <p class="muted">Hidden from the list above, kept as they are. Archived characters are never deleted on their own.</p>
  <ul class="list">
    {#each archived as d (d.id)}
      <li><a class="name" href={`/doc/${d.id}`}>{d.name}</a><span class="meta">archived {when(d.archivedAt)}</span><button class="quiet" onclick={() => archive(d, false)} aria-label={`Unarchive ${d.name}`}>Unarchive</button></li>
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
