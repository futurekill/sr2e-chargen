<script>
  import { get, mutate } from "../lib/api.js";
  import { go } from "../lib/router.svelte.js";
  let docs = $state(null), trash = $state([]), archived = $state([]), error = $state(""), name = $state(""), kind = $state("character"), busy = $state(false);
  // The Garage (docs/PLAN-garage.md): a vehicle starts from one of the core book's vehicles (p.264).
  let coreVehicles = $state([]), vehicleId = $state("");
  get("/api/catalog/entries?type=vehicle&book=sr2&limit=100").then(r => { coreVehicles = r.entries; }).catch(() => { /* the choice stays empty */ });
  // The Workshop (docs/PLAN-workshop.md): design from scratch, when this server has Rigger 2's tables.
  const DESIGN = "design";
  let canDesign = $state(false);
  get("/api/catalog/design-tables").then(() => { canDesign = true; }).catch(() => { /* no tables: no designing */ });
  // The NPC builder (docs/PLAN-npc-builder.md): blank, or from a book contact or archetype.
  let bookNpcs = $state([]), npcFrom = $state("");
  get("/api/catalog/npcs").then(r => { bookNpcs = r.npcs; }).catch(() => { /* only blank NPCs */ });
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
    try {
      const { document } = kind === "vehicle" ? await mutate("POST", "/api/documents/vehicles", vehicleId === DESIGN ? { design: true, name: name.trim() } : { catalogId: vehicleId, name: name.trim() })
        : kind === "npc" ? await mutate("POST", "/api/documents/npcs", npcFrom ? { catalogId: npcFrom, name: name.trim() } : { name: name.trim() })
        : await mutate("POST", kind === "character" ? "/api/documents/characters" : "/api/documents", { name: name.trim() });
      go(`/doc/${document.id}`);
    }
    catch (err) {
      // No answer doesn't mean it didn't happen. Pressing Start again with the same name is safe: it replays.
      if (err.code === "network") error = "The line dropped. Press Start again — if it already went through, you'll get that one, not a second.";
      else error = err.message;
    }
    busy = false;
  }
  /** A Foundry character file (its "Export Data"): read here, checked and stored by the server (docs/PLAN-M7.md). */
  async function importFoundry(ev) {
    const file = ev.currentTarget.files?.[0];
    ev.currentTarget.value = "";
    if (!file) return;
    if (file.size > 2_500_000) { error = "That file is too big for a character."; return; }
    let json;
    try { json = JSON.parse(await file.text()); } catch { error = "That file isn't JSON: use Foundry's Export Data on a character."; return; }
    busy = true;
    try { const { document } = await mutate("POST", "/api/documents/characters/import", json); go(`/doc/${document.id}`); }
    catch (err) { error = err.message; }
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
<p class="muted">Characters are built step by step: the core book's Priority system, or, with the Companion, sum-to-10 or Building Points. Vehicles live in your garage: weapons on their mounts, cargo, then bought or linked by your characters. NPCs are the gamemaster's: start from a book contact or archetype, or blank, and tailor them (core p.187). Drafts are free-text notes.</p>
{#if error}<p class="notice bad" role="alert">{error}</p>{/if}

<form class="row" onsubmit={create}>
  <label class="grow"><span>Name</span><input bind:value={name} maxlength={kind === "character" ? 120 : 200} placeholder="Street name" required></label>
  <label><span>Kind</span><select bind:value={kind}><option value="character">Character</option><option value="vehicle">Vehicle</option><option value="npc">NPC</option><option value="draft">Draft</option></select></label>
  {#if kind === "npc"}
    <label><span>Start from</span><select bind:value={npcFrom}>
      <option value="">Blank</option>
      <optgroup label="Contacts (core p.203–213)">{#each bookNpcs.filter(n => n.kind === "contact") as n (n.id)}<option value={n.id}>{n.name}</option>{/each}</optgroup>
      <optgroup label="Archetypes">{#each bookNpcs.filter(n => n.kind === "archetype") as n (n.id)}<option value={n.id}>{n.name}</option>{/each}</optgroup>
    </select></label>
  {/if}
  {#if kind === "vehicle"}
    <label><span>Model</span><select bind:value={vehicleId} required>
      <option value="" disabled>Choose…</option>
      {#if canDesign}<option value={DESIGN}>Design from scratch (Rigger 2)</option>{/if}
      {#each coreVehicles as v (v.id)}<option value={v.id}>{v.name}</option>{/each}
    </select></label>
  {/if}
  <button disabled={busy || !name.trim() || (kind === "vehicle" && !vehicleId)}>Start</button>
</form>
<p class="muted small import"><label class="button quiet" aria-disabled={busy}>Import a character from Foundry…<input type="file" accept="application/json,.json" class="sr-only" disabled={busy} onchange={importFoundry}></label>
  Use Foundry's <strong>Export Data</strong> on a finished character.</p>

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

<style>
  .import { margin-top: .75rem; }
</style>
