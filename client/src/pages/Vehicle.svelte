<script>
  /** A garage vehicle (docs/PLAN-garage.md): its stats, weapons on its mounts (core p.251–253), cargo, notes, price. */
  import { get, mutate } from "../lib/api.js";
  import { go } from "../lib/router.svelte.js";
  import { keepFocus, flagFocused, clearFlags } from "../lib/focus.js";
  import { page } from "../lib/page.svelte.js";
  import { mountsOf, vehiclePrice, docIdOf } from "../../../shared/vehicle.mjs";
  import { mountKindFor, mountedWeaponCost, LAUNCHER_MUNITIONS, vehicleEffective } from "../../../shared/rules.mjs";
  import VehicleDesign from "./VehicleDesign.svelte";
  let { doc } = $props();
  let status = $state("");
  let server = $state(doc), error = $state(""), busy = $state(false), notes = $state(doc.body.notes), name = $state(doc.body.name);
  const body = $derived(server.body), sys = $derived(server.body.actor.system ?? {});
  // A designed vehicle (docs/PLAN-workshop.md): the Rigger 2 tables price it and drive its Design section.
  let tables = $state(null), tablesError = $state("");
  if (doc.body.design) get("/api/catalog/design-tables").then(t => { tables = t; }).catch(err => { tablesError = err.message; });
  const designed = $derived(!!body.design);
  // A design stores BASE stats; the page shows the EFFECTIVE ones (its mods applied), as Foundry does (PLAN-workshop 4.2).
  const shown = $derived(designed && body.actor.system?.design?.version === 2 ? { ...sys, ...vehicleEffective(sys, body.actor.items).effective } : sys);
  const mounts = $derived(mountsOf(body)), price = $derived(vehiclePrice(body, tables));
  const weapons = $derived(body.actor.items.filter(i => i.flags?.sr2e?.mount)), cargo = $derived(body.actor.items.filter(i => i.flags?.sr2e?.cargo));
  const nuyen = (n) => `${Number(n || 0).toLocaleString("en-US")}¥`;

  // What can go on: the core book's weapons by mount kind, its gear and the launcher's ammunition (p.251, p.255).
  let mountable = $state({ hardpoint: [], firmpoint: [] }), cargoable = $state([]);
  let pickWeapon = $state(""), pickGear = $state(""), quantity = $state(1);
  async function every(type) {
    const out = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = (await get(`/api/catalog/entries?type=${type}&book=sr2&limit=100&offset=${offset}`)).entries;
      out.push(...page); if (page.length < 100) break;
    }
    return out;
  }
  Promise.all([every("weapon"), every("gear")]).then(([w, g]) => {
    const priced = (e) => Number(e.cost) > 0;   // catalog summaries: cost and (weapons) weaponType at the top level
    const kindOf = (e) => (e.id.startsWith("sr2e.") ? mountKindFor({ id: docIdOf(e.id), weaponType: e.weaponType }) : null);
    mountable = { hardpoint: w.filter(e => priced(e) && kindOf(e) === "hardpoint"), firmpoint: w.filter(e => priced(e) && kindOf(e) === "firmpoint") };
    cargoable = [...g.filter(priced), ...w.filter(e => priced(e) && e.id.startsWith("sr2e.") && Object.hasOwn(LAUNCHER_MUNITIONS, docIdOf(e.id)))];
  }).catch(err => { error = err.message; });

  const send = (ops) => keepFocus(async () => {
    const from = document.activeElement;   // the control that made this change, before busy disables it (r2 #1)
    busy = true; error = ""; status = "";
    try { server = await mutate("POST", `/api/documents/${server.document.id}/ops`, { revision: server.document.revision, ops }); name = server.body.name; notes = server.body.notes; clearFlags(); status = "Saved."; page.title = server.body.name; }
    catch (err) {
      flagFocused("doc-error", from);
      error = err.code === "stale" ? "This vehicle changed somewhere else. It now shows the saved version." : err.message;
      try { server = await get(`/api/documents/${server.document.id}`); } catch { /* keep the last answer */ }
    }
    busy = false;
  });
  function mount(ev) {
    ev.preventDefault();
    const kind = mountable.hardpoint.some(e => e.id === pickWeapon) ? "hardpoint" : "firmpoint";
    send([{ op: "mountWeapon", catalogId: pickWeapon, kind }]).then(() => { pickWeapon = ""; });
  }
  function load(ev) { ev.preventDefault(); send([{ op: "addGear", catalogId: pickGear, quantity: Number(quantity) }]).then(() => { pickGear = ""; quantity = 1; }); }
  const free = (k) => mounts[k].total - mounts[k].used;
  /** Delete with THIS page's revision: the edits above moved it on (code review r1 #5). */
  async function remove() {
    busy = true;
    try { await mutate("DELETE", `/api/documents/${server.document.id}`, { revision: server.document.revision }); go("/"); }
    catch (err) { error = err.message; }
    busy = false;
  }
</script>

<h1>{body.name}</h1>
<p class="muted">{designed ? "Designed vehicle" : "Garage vehicle"} · revision {server.document.revision}{#if server.usedBy?.length} · used by {server.usedBy.map(u => u.bought ? `${u.name} (bought at revision ${u.bought})` : u.name).join(", ")}{/if}</p>
{#if error}<p class="notice bad" role="alert" id="doc-error">{error}</p>{/if}
<p class="sr-only" role="status">{status}</p>

<dl>
  <div><dt>Handling</dt><dd>{shown.handling ?? "–"}</dd></div>
  <div><dt>Speed</dt><dd>{shown.speed ?? "–"}</dd></div>
  <div><dt>Body</dt><dd>{shown.body ?? "–"}</dd></div>
  <div><dt>Armor</dt><dd>{shown.armor ?? "–"}</dd></div>
  <div><dt>Signature</dt><dd>{shown.signature ?? "–"}</dd></div>
  <div><dt>Pilot</dt><dd>{shown.pilot ?? "–"}</dd></div>
</dl>

{#if designed}
  <VehicleDesign {body} {busy} {send} {tables} {tablesError} />
{:else}
<h2>Weapon mounts</h2>
{#if !mounts.hardpoint.total && !mounts.firmpoint.total}
  <p class="muted">The core book gives this vehicle no hardpoints or firmpoints (p.251–253).</p>
{:else}
  <p class="muted">Hardpoints {mounts.hardpoint.used} of {mounts.hardpoint.total} used · firmpoints {mounts.firmpoint.used} of {mounts.firmpoint.total} used{mounts.upTo ? " (optional, up to that many)" : ""} · p.{mounts.page}.
    A hardpoint takes a heavy weapon and halves its recoil; a firmpoint takes a smaller firearm and gives 1 point of recoil compensation (p.251).</p>
  {#if weapons.length}
    <ul class="list">
      {#each weapons as w (w._id)}
        <li><span class="name">{w.name}</span><span class="meta">{w.flags.sr2e.mount} · {nuyen(mountedWeaponCost(w.system?.cost, docIdOf(w.flags.sr2e.catalogId)))}</span>
          <button type="button" class="quiet" disabled={busy} onclick={() => send([{ op: "unmountWeapon", itemId: w._id }])}>Remove</button></li>
      {/each}
    </ul>
  {/if}
  {#if free("hardpoint") > 0 || free("firmpoint") > 0}
    <form class="row" onsubmit={mount}>
      <label class="grow"><span>Mount a weapon</span><select bind:value={pickWeapon} required>
        <option value="" disabled>Choose…</option>
        {#if free("hardpoint") > 0}<optgroup label="Hardpoint (heavy weapons)">{#each mountable.hardpoint as e (e.id)}<option value={e.id}>{e.name} — {nuyen(mountedWeaponCost(e.cost, docIdOf(e.id)))}</option>{/each}</optgroup>{/if}
        {#if free("firmpoint") > 0}<optgroup label="Firmpoint (firearms)">{#each mountable.firmpoint as e (e.id)}<option value={e.id}>{e.name} — {nuyen(mountedWeaponCost(e.cost, docIdOf(e.id)))}</option>{/each}</optgroup>{/if}
      </select></label>
      <button disabled={busy || !pickWeapon}>Mount</button>
    </form>
  {/if}
{/if}
{/if}

<h2>Cargo</h2>
{#if cargo.length}
  <ul class="list">
    {#each cargo as c (c._id)}
      <li><span class="name">{c.name}</span><span class="meta">× {c.flags.sr2e.quantity} · {nuyen(Number(c.system?.cost) * c.flags.sr2e.quantity)}</span>
        <button type="button" class="quiet" disabled={busy} onclick={() => send([{ op: "removeGear", itemId: c._id }])}>Remove</button></li>
    {/each}
  </ul>
{:else}<p class="muted">Nothing loaded.</p>{/if}
<form class="row" onsubmit={load}>
  <label class="grow"><span>Load gear or launcher ammunition</span><select bind:value={pickGear} required>
    <option value="" disabled>Choose…</option>
    {#each cargoable as e (e.id)}<option value={e.id}>{e.name} — {nuyen(e.cost)}</option>{/each}
  </select></label>
  <label><span>Quantity</span><input type="number" min="1" max="99" bind:value={quantity} required></label>
  <button disabled={busy || !pickGear}>Load</button>
</form>

<h2>Price</h2>
<dl>
  {#if designed}<div><dt>Design (Rigger 2 p.114)</dt><dd>{price.unfinished ? "Unfinished" : nuyen(price.vehicle)}</dd></div>
  {:else}<div><dt>Vehicle (p.264)</dt><dd>{price.vehicle ? nuyen(price.vehicle) : "Restricted"}</dd></div>{/if}
  {#if price.points}<div><dt>Firmpoints fitted (p.251)</dt><dd>{nuyen(price.points)}</dd></div>{/if}
  {#if designed}<div><dt>Weapons on the mounts (list price, R20)</dt><dd>{nuyen(price.weapons)}</dd></div>
  {:else}<div><dt>Weapons (adapted ×2, p.251; vehicle weapons at list)</dt><dd>{nuyen(price.weapons)}</dd></div>{/if}
  <div><dt>Cargo</dt><dd>{nuyen(price.cargo)}</dd></div>
  <div><dt><strong>Total</strong></dt><dd><strong>{price.vehicle ? nuyen(price.total) : designed ? "Unfinished" : "Restricted"}</strong></dd></div>
</dl>

<h2>Name and notes</h2>
<form class="stack wide" onsubmit={(ev) => { ev.preventDefault(); send([{ op: "setName", name: name.trim() }, { op: "setNotes", notes }]); }}>
  <label><span>Name</span><input bind:value={name} maxlength="120" required></label>
  <label><span>Notes (exported to Foundry)</span><textarea bind:value={notes} maxlength="20000"></textarea></label>
  <div class="row"><button disabled={busy || !name.trim() || (name === body.name && notes === body.notes)}>Save</button></div>
</form>

<h2>Export</h2>
<p><a class="button quiet" href={`/api/documents/${server.document.id}/foundry`} download>{body.name} for Foundry</a></p>
<p class="muted small">In Foundry: create an Actor of type Vehicle, right-click it, choose <strong>Import Data</strong> and pick the file. Its weapons and cargo come with it.</p>

<details><summary>Delete this vehicle</summary>
  <p class="muted">It goes to the trash (restorable for 30 days). Characters who bought it keep their copy; links to it show as unavailable.</p>
  <button class="danger" disabled={busy} onclick={remove}>Delete</button>
</details>
