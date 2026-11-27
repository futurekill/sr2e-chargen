<script>
  /**
   * The Workshop (docs/PLAN-workshop.md 4.2): design a vehicle from scratch with Rigger 2's rules (p.108–146), the
   * Foundry Workshop's steps on one page. Every number comes from the system's engine (designVehicle), computed here
   * for the preview and again on the server, which is the authority. The working design stays here until "Save
   * design"; mods save at once with their own operations, as in Foundry.
   */
  import { get } from "../lib/api.js";
  import { blankDesign, modBuildContext, designModProblems, mountOf, weaponClassOf, fitProblem, kitFor, removalProblem, CONVERSION_KITS } from "../../../shared/rules.mjs";
  import { modRated, designResult, MAX_VEHICLE_ITEMS } from "../../../shared/vehicle.mjs";
  let { body, busy, send, tables, tablesError = "" } = $props();

  const CATEGORIES = { bike: "Bikes", car: "Cars", hovercraft: "Hovercraft", boat: "Boats", fixedWing: "Fixed-wing", rotor: "Rotor craft", vector: "Vectored thrust", special: "Special" };
  const ENGINES = { electric: "Electric", methane: "Methane", gasoline: "Gasoline", diesel: "Diesel", jetPropeller: "Jet propeller", jetTurbine: "Jet turbine", sail: "Sail" };
  const QUALITY = { masterWorkmanship: ["Master Workmanship", 3], lemon: ["Lemon", 3], ruggedness: ["Ruggedness", 2], fragility: ["Fragility", 2],
    streamlined: ["Streamlined Layout", 1], complexChassis: ["Complex Chassis", 1], customBuilt: ["Custom Built", 1],
    prototype: ["Prototype Model/Used Vehicle", 1], safetyCertified: ["Safety Certified", 1], passengerTrap: ["Passenger Trap", 1] };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  let catalog = $state([]), filter = $state(""), ratingFor = $state({}), catalogError = $state("");
  (async () => {   // every vehicle mod in the catalog, as Foundry's Workshop lists every one it finds
    const out = [];
    for (let offset = 0; offset < 2000; offset += 100) {
      const page = (await get(`/api/catalog/entries?type=vehicle_mod&limit=100&offset=${offset}`)).entries;
      out.push(...page); if (page.length < 100) break;
    }
    catalog = out;
  })().catch(err => { catalogError = err.message; });

  // The working design: the saved one until edited here. Compared in a canonical form (keys sorted, empty values
  // dropped): a select bound to a field the saved design lacks (Tires: "") fills it in on first render, which is not
  // an edit (it showed "unsaved changes" on a design just opened).
  const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().filter(k => x[k] !== "" && x[k] !== undefined).map(k => [k, x[k]])) : x));
  let work = $state($state.snapshot(body.design.choices)), savedJson = $state(canon(body.design.choices));
  $effect(() => {   // a save (or a change elsewhere) arrives: take it unless there are unsaved edits
    const now = canon(body.design.choices);
    if (now !== savedJson) { if (canon(work) === savedJson) work = $state.snapshot(body.design.choices); savedJson = now; }
  });
  const dirty = $derived(canon(work) !== savedJson);
  const installed = $derived(body.actor.items.filter(i => i.flags?.sr2e?.designMod && !i.flags?.sr2e?.kitFor));
  // Weapon mounts (R2 p.131–135; docs/PLAN-workshop-mounts.md): each mount, what it holds, and what may go on it.
  const mounts = $derived(installed.filter(i => mountOf(i)).map(m => ({ item: m, spec: mountOf(m),
    weapons: body.actor.items.filter(w => w.type === "weapon" && w.flags?.sr2e?.mountId === m._id) })));
  let weaponsCatalog = $state([]), pickFor = $state({});
  (async () => {
    const out = [];
    for (const book of ["sr2", "r2"]) for (let offset = 0; offset < 1000; offset += 100) {
      const page = (await get(`/api/catalog/entries?type=weapon&book=${book}&limit=100&offset=${offset}`)).entries;
      out.push(...page); if (page.length < 100) break;
    }
    weaponsCatalog = out.filter(e => Number(e.cost) > 0 && weaponClassOf({ flags: { sr2e: { catalogId: e.id } } }));
  })().catch(err => { catalogError = err.message; });
  const fitsOn = (mt) => weaponsCatalog.map(e => { const cls = weaponClassOf({ flags: { sr2e: { catalogId: e.id } } });
    const need = 1 + (kitFor(mt.spec, cls) ? 1 : 0);   // the weapon, and its kit (code review r1 #4)
    const full = body.actor.items.length + need > MAX_VEHICLE_ITEMS ? `the vehicle holds at most ${MAX_VEHICLE_ITEMS} items` : "";
    return { e, why: fitProblem(mt.spec, cls, mt.weapons.map(w => weaponClassOf(w))) || full }; });
  const kitOf = (w) => body.actor.items.find(k => k.flags?.sr2e?.kitFor === w._id);
  const ch = $derived(tables?.chassis?.[work.chassisKey] ?? null), pp = $derived(tables?.powerPlants?.[work.powerPlantKey] ?? null);
  let category = $state("car");
  $effect(() => { if (ch) category = ch.category; });
  // The preview: the server's own design result (engine + mounts) on the WORKING design.
  const r = $derived(tables ? designResult({ ...body, design: { choices: work } }, tables) : null);
  const s = $derived(r?.stats ?? {});
  const fmtH = (h) => (h == null ? "–" : typeof h === "object" ? `${h.onRoad}/${h.offRoad}` : h);
  const nuyen = (n) => `${Math.round(num(n)).toLocaleString("en-US")}¥`;
  const cell = (v) => (typeof v === "number" ? v : v ?? "–");

  function pickChassis(key) {   // a new chassis: its plant and the options priced from it start over; Mark-Up stays (as Foundry)
    if (key !== work.chassisKey) work = { ...blankDesign(), chassisKey: key, markUp: work.markUp, ...(work.quality ? { quality: work.quality } : {}) };
  }
  function pickPlant(key) {
    if (key !== work.powerPlantKey) work = { ...work, powerPlantKey: key, speed: 0, acceleration: 0, load: 0, economySteps: 0, fuelSteps: 0, engineCustom: { speed: 0, acceleration: 0, load: 0 } };
  }
  const plants = $derived(tables && ch ? Object.values(tables.powerPlants).filter(p => p.chassis.includes(ch.key)) : []);
  const ground = $derived(!!ch && ["bike", "car"].includes(ch.category));
  const dbw = $derived(installed.some(i => i.system?.modKey === "drive-by-wire"));
  $effect(() => {   // the DBW split exists only with a DBW system (the server refuses it otherwise)
    if (dbw && !work.dbwSplit) work.dbwSplit = { acceleration: 10, speed: 0, load: 0 };
    if (!dbw && work.dbwSplit) { const { dbwSplit, ...rest } = work; work = rest; }
  });

  const bc = $derived(ch && pp ? modBuildContext(work, ch, pp, installed.map(i => ({ system: i.system }))) : null);
  const offered = $derived(catalog.filter(m => !filter.trim() || m.name.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 60)
    .map(m => ({ ...m, why: Object.values(CONVERSION_KITS).includes(m.id) ? "added for you when you mount a personal firearm on a fixed mount or turret"
      : bc ? designModProblems(m.system, bc, num(ratingFor[m.id]) || null).join("; ") : "pick a chassis and a power plant first" })));
  // An emptied number field reads as null: it means 0 (the design's fields are all numbers there).
  const clean = (o) => (o === null ? 0 : typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clean(v)])) : o);
  const save = () => send([{ op: "setDesign", design: clean($state.snapshot(work)) }]);
  const LABEL = { ambulance: "Ambulance or medical vehicle", nonCombat: "Specialized non-combat vehicle", unusual: "Unusual accessories or features",
    luxury: "Luxury vehicle", security: "Security grade", military: "Military grade", drone: "Drone" };
  const markUpTable = $derived(tables?.markUp ?? {});
  const range = (cell) => (Array.isArray(cell) ? cell : null);
</script>

<section aria-labelledby="design-h">
<h2 id="design-h">Design (Rigger 2 p.108–146)</h2>
{#if tablesError}<p class="notice bad" role="alert">{tablesError}</p>
{:else if !tables}<p class="muted">Loading the design tables…</p>
{:else}
  <div class="summary" aria-live="polite">
    <p><strong>{ch?.name ?? "No chassis"}</strong>{#if pp} · {pp.label ?? pp.name}{/if}</p>
    {#if r?.stats && ch && pp}
      <p class="small">Handling {fmtH(s.handling)} · Speed {s.stallSpeed != null ? `${s.stallSpeed}/` : ""}{cell(s.speed)} · Accel {cell(s.acceleration)} · Body {cell(s.body)} · Armor {cell(s.armor)} · Sig {cell(s.signature)} · Autonav {cell(s.autonav)} · Pilot {cell(s.pilot)} · Sensor {cell(s.sensor)}</p>
      {#if r.budgets}<p class="small">Cargo {r.budgets.cfUsed} of {r.budgets.cargo} CF used · Load {r.budgets.loadUsed} of {r.budgets.load} kg used</p>{/if}
    {/if}
    {#if r?.dpLines?.length}<details><summary>Design Points, line by line</summary><!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll-x" role="region" aria-label="Design Points, line by line" tabindex="0"><table class="dp"><caption class="sr-only">Design Points, line by line</caption>
      <thead><tr><th scope="col">Item</th><th scope="col">Design Points</th><th scope="col">Page</th></tr></thead><tbody>
      {#each r.dpLines as l, i (i)}<tr><th scope="row">{l.label}</th><td class="n">{l.dp}</td><td class="muted">{l.page ?? ""}</td></tr>{/each}
    </tbody></table></div></details>{/if}
    <p>Design Points <strong>{r?.dp ?? 0}</strong> · Mark-Up ×{r?.markUp?.total ?? "–"} · Price <strong>{r?.valid ? nuyen(r.price) : "unfinished"}</strong>{#if dirty} · <em>unsaved changes</em>{/if}</p>
    {#if r?.problems?.length}<ul class="problems" aria-label="Why this design isn't finished">{#each r.problems as p, i (i)}<li>{p.msg} <span class="muted">({p.page})</span></li>{/each}</ul>{/if}
    <div class="row"><button type="button" disabled={busy || !dirty} onclick={save}>Save design</button>
      <button type="button" class="quiet" disabled={busy || !dirty} onclick={() => { work = $state.snapshot(body.design.choices); }}>Undo changes</button></div>
  </div>

  <h3>Chassis <span class="muted small">(p.109, table p.170)</span></h3>
  <div class="row">
    <label><span>Type</span><select bind:value={category}>{#each Object.entries(CATEGORIES) as [k, label] (k)}<option value={k}>{label}</option>{/each}</select></label>
    <label class="grow"><span>Chassis</span><select value={work.chassisKey} onchange={(e) => pickChassis(e.currentTarget.value)}>
      <option value="" disabled>Choose…</option>
      {#each Object.values(tables.chassis).filter(c => c.category === category) as c (c.key)}<option value={c.key}>{c.name}{c.drone ? " (drone)" : ""} — Body {c.body}, {cell(c.dp)} DP</option>{/each}
    </select></label>
  </div>

  {#if ch}
    <h3>Power plant <span class="muted small">(p.112, table p.167)</span></h3>
    <label><span>Power plant</span><select value={work.powerPlantKey} onchange={(e) => pickPlant(e.currentTarget.value)}>
      <option value="" disabled>Choose…</option>
      {#each plants as p (p.key)}<option value={p.key}>{ENGINES[p.engine] ?? p.engine}: {p.label ?? p.name}</option>{/each}
    </select></label>
  {/if}

  {#if ch && pp}
    <h3>Design options <span class="muted small">(p.115–118)</span></h3>
    <div class="grid">
      <label><span>Speed +/− (2 DP each, p.117)</span><input type="number" step="1" bind:value={work.speed}></label>
      {#if pp.acceleration}<label><span>Acceleration +/− (2 DP each, p.115)</span><input type="number" step="1" bind:value={work.acceleration}></label>{/if}
      <label><span>Load +/− kg (10 kg steps, p.117)</span><input type="number" step="10" bind:value={work.load}></label>
      <label><span>Cargo +/− CF (5 DP each, p.116)</span><input type="number" step="1" bind:value={work.cargo}></label>
      <label><span>Handling bought (25 DP each; negative = worse, free; p.116)</span><input type="number" step="1" bind:value={work.handling}></label>
      {#if ground && typeof ch.handling === "object"}<label><span>Handling track</span><select bind:value={work.handlingTrack}><option value="onRoad">On-road</option><option value="offRoad">Off-road</option></select></label>{/if}
      {#if pp.economy?.start != null}<label><span>Economy +5% steps (p.116)</span><input type="number" min="0" step="1" bind:value={work.economySteps}></label>{/if}
      {#if tables.fuel?.[pp.engine]}<label><span>Fuel tank steps (p.116)</span><input type="number" min="0" step="1" bind:value={work.fuelSteps}></label>{/if}
      <label><span>Signature levels (200 DP each, p.117)</span><input type="number" min="0" step="1" bind:value={work.signature}></label>
      <label class="check"><input type="checkbox" bind:checked={work.smartMaterials}> <span>Smart materials (p.117)</span></label>
      {#if ground}<label><span>Tires (p.146)</span><select bind:value={work.tires}><option value="">As the book assumes</option><option value="standard">Standard</option><option value="performance">Performance</option><option value="offRoad">Off-road</option><option value="dualPurpose">Dual-purpose</option></select></label>{/if}
      {#if ch.category === "fixedWing"}<label><span>Takeoff (p.116)</span><select bind:value={work.takeoff}><option value="">Standard</option><option value="stol">STOL (250 DP)</option><option value="vstol">VSTOL (400 DP)</option></select></label>{/if}
      {#if ch.category === "boat" && ch.subtype !== "skiff" && pp.engine !== "sail"}<label class="check"><input type="checkbox" bind:checked={work.hydrofoil}> <span>Hydrofoil (p.116)</span></label>{/if}
      <label><span>Living amenities (p.117)</span><select bind:value={work.amenities.level}><option value="">None</option><option value="basic">Basic</option><option value="improved">Improved</option><option value="high">High</option></select></label>
      {#if work.amenities.level}<label><span>Occupants, driver included</span><input type="number" min="1" step="1" bind:value={work.amenities.occupants}></label>{/if}
      <label><span>Medical-treatment patients (p.117)</span><input type="number" min="0" step="1" bind:value={work.medicalPatients}></label>
      <label><span>Structural agility (needs drive-by-wire, p.118)</span><input type="number" min="0" step="1" bind:value={work.structuralAgility}></label>
      <label><span>Engine customization: Speed levels (p.120)</span><input type="number" min="0" step="1" bind:value={work.engineCustom.speed}></label>
      {#if pp.acceleration}<label><span>Engine customization: Acceleration levels</span><input type="number" min="0" step="1" bind:value={work.engineCustom.acceleration}></label>{/if}
      <label><span>Engine customization: Load levels</span><input type="number" min="0" step="1" bind:value={work.engineCustom.load}></label>
    </div>

    <h3>Modifications <span class="muted small">(p.118–146)</span></h3>
    {#if installed.length}
      <ul class="list">
        {#each installed as m (m._id)}
          {@const blocked = removalProblem(body.actor.items, m._id)}
          <li><span class="name">{m.name}</span>
            {#if modRated(m.system)}<label class="inline"><span class="sr-only">{m.name} rating</span><input type="number" min="1" max="20" value={m.system.rating}
              onchange={(e) => send([{ op: "setDesignMod", itemId: m._id, rating: Math.floor(num(e.currentTarget.value)) }])} disabled={busy}></label>
            {:else}<span class="meta">rating {m.system.rating ?? 1}</span>{/if}
            <button type="button" class="quiet" disabled={busy || !!blocked} title={blocked} onclick={() => send([{ op: "removeDesignMod", itemId: m._id }])}>Remove</button>
            {#if blocked}<span class="muted small">Unmount its weapons first.</span>{/if}</li>
        {/each}
      </ul>
    {:else}<p class="muted">None installed.</p>{/if}
    {#if mounts.length}
      <h4>Weapons on the mounts <span class="muted small">(p.131–135; weapons bought separately at list price)</span></h4>
      {#each mounts as mt (mt.item._id)}
        <div class="mount">
          <p><strong>{mt.item.name}</strong> <span class="muted small">{mt.spec.kind === "turret" ? `Weapon Value ${mt.weapons.reduce((t, w) => t + (weaponClassOf(w)?.wv ?? 0), 0)} of ${mt.spec.wv}${mt.spec.house ? " (house ruling)" : ""}` : mt.spec.point}{mt.spec.kit ? " · personal firearms need a conversion kit" : " · no conversion kit needed"}</span></p>
          {#if mt.weapons.length}<ul class="list">
            {#each mt.weapons as w (w._id)}<li><span class="name">{w.name}</span><span class="meta">{Number(w.system?.cost || 0).toLocaleString("en-US")}¥{kitOf(w) ? ` · ${kitOf(w).name}` : ""}</span>
              <button type="button" class="quiet" disabled={busy} onclick={() => send([{ op: "unmountWeapon", itemId: w._id }])}>Unmount</button></li>{/each}
          </ul>{/if}
          <div class="row">
            <label class="grow"><span>Mount a weapon on {mt.item.name}</span><select bind:value={pickFor[mt.item._id]}>
              <option value="">Choose…</option>
              {#each fitsOn(mt) as f (f.e.id)}<option value={f.e.id} disabled={!!f.why}>{f.e.name} — {Number(f.e.cost).toLocaleString("en-US")}¥{f.why ? ` (${f.why})` : ""}</option>{/each}
            </select></label>
            <button type="button" disabled={busy || dirty || !pickFor[mt.item._id]} onclick={() => send([{ op: "mountDesignWeapon", catalogId: pickFor[mt.item._id], mountId: mt.item._id }]).then(() => { pickFor[mt.item._id] = ""; })}>Mount</button>
          </div>
        </div>
      {/each}
    {/if}
    {#if dbw && work.dbwSplit}
      <fieldset class="row"><legend>Drive-by-wire's +10% split (p.124; whole percents, 10 in all)</legend>
        <label><span>Acceleration %</span><input type="number" min="0" max="10" step="1" bind:value={work.dbwSplit.acceleration}></label>
        <label><span>Speed %</span><input type="number" min="0" max="10" step="1" bind:value={work.dbwSplit.speed}></label>
        <label><span>Load %</span><input type="number" min="0" max="10" step="1" bind:value={work.dbwSplit.load}></label>
      </fieldset>
    {/if}
    {#if catalogError}<p class="notice bad" role="alert">{catalogError}</p>{/if}
    <label><span>Find a modification</span><input type="search" bind:value={filter} placeholder="Name"></label>
    <ul class="list">
      {#each offered as m (m.id)}
        <li><span class="name">{m.name}</span><span class="meta">{m.book}{m.citation?.page ? ` p.${m.citation.page}` : ""}{m.why ? ` · ${m.why}` : ""}</span>
          {#if modRated(m.system)}<label class="inline"><span class="sr-only">{m.name} rating</span><input type="number" min="1" max="20" placeholder="1" bind:value={ratingFor[m.id]}></label>{/if}
          <button type="button" disabled={busy || !!m.why || dirty} title={dirty ? "Save the design first" : ""}
            onclick={() => send([{ op: "addDesignMod", catalogId: m.id, rating: Math.max(1, Math.floor(num(ratingFor[m.id]) || 1)) }])}>Add</button></li>
      {/each}
    </ul>
    {#if dirty}<p class="muted small">Save the design before adding modifications: they are checked against the saved design.</p>{/if}

    <h3>Price <span class="muted small">(Mark-Up, p.114)</span></h3>
    <div class="grid">
      {#if range(markUpTable.base?.[ch.category])}<label><span>Base Mark-Up ({markUpTable.base[ch.category][0]}–{markUpTable.base[ch.category][1]})</span><input type="number" step="0.05" bind:value={work.markUp.base}></label>{/if}
      {#each Object.entries(markUpTable.features ?? {}).filter(([k]) => k !== "smartMaterials") as [k, c] (k)}
        {#if range(c)}<label><span>{LABEL[k] ?? k} (+0, or {c[0]}–{c[1]})</span><input type="number" min="0" max={c[1]} step="0.05" value={work.markUp.features[k] ?? 0} oninput={(e) => { work.markUp.features[k] = num(e.currentTarget.value); }}></label>
        {:else}<label class="check"><input type="checkbox" checked={!!work.markUp.features[k]} onchange={(e) => { work.markUp.features[k] = e.currentTarget.checked; }}> <span>{LABEL[k] ?? k} (+{c})</span></label>{/if}
      {/each}
      {#each Object.entries(markUpTable.multipliers ?? {}) as [k, c] (k)}
        {#if range(c)}<label><span>{LABEL[k] ?? k} (none, or ×{c[0]}–{c[1]})</span><input type="number" min="0" max={c[1]} step="0.05" value={work.markUp.multipliers[k] ?? 0} oninput={(e) => { work.markUp.multipliers[k] = num(e.currentTarget.value); }}></label>
        {:else}<label class="check"><input type="checkbox" checked={!!work.markUp.multipliers[k]} onchange={(e) => { work.markUp.multipliers[k] = e.currentTarget.checked; }}> <span>{LABEL[k] ?? k} (×{c}){k === "drone" && ch.drone ? " — this chassis is a drone" : ""}</span></label>{/if}
      {/each}
      <label><span>Round the price</span><select bind:value={work.markUp.round}><option value={0}>No</option><option value={500}>to 500¥</option><option value={1000}>to 1,000¥</option></select></label>
    </div>
    <details><summary>Quality Factors (optional rule, p.84–85; at most two)</summary>
      <div class="grid">
        {#each Object.entries(QUALITY) as [k, [label, max]] (k)}
          <label><span>{label}</span><select value={work.quality?.[k] ?? 0} onchange={(e) => { const n = num(e.currentTarget.value); const q = { ...(work.quality ?? {}) }; if (n) q[k] = n; else delete q[k]; work.quality = q; }}>
            {#each Array.from({ length: max + 1 }, (_, i) => i) as n (n)}<option value={n}>{n}</option>{/each}</select></label>
        {/each}
      </div>
    </details>
  {/if}
{/if}
</section>

<style>
  .summary { border: 1px solid var(--line); background: var(--surface); padding: .7rem .85rem; margin: 0 0 1rem; }
  .summary p { margin: .2rem 0; }
  .problems { color: var(--danger); margin: .3rem 0; padding-left: 1.2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr)); gap: .6rem 1rem; margin-bottom: 1rem; }
  .grid label, .row label { display: flex; flex-direction: column; gap: .2rem; }
  .grid label.check { flex-direction: row; align-items: center; }
  .inline input { width: 4.5rem; }
  fieldset { border: 1px solid var(--line); margin: .5rem 0; }
  .dp td { padding: .1rem .6rem .1rem 0; }
  .mount { border-left: 3px solid var(--line); padding-left: .7rem; margin: .6rem 0; }
  .dp .n { text-align: right; font-variant-numeric: tabular-nums; }
</style>
