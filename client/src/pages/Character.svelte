<script>
  /**
   * Character creation (docs/PLAN-M2.md §6). Every change is ONE operation: applied here at once with the shared
   * reducer (a fast screen), then sent to the server, whose answer replaces the local copy. Changes go out one at a
   * time, in order, each on top of the revision the previous answer gave.
   */
  import { untrack, onDestroy } from "svelte";
  import { get, mutate } from "../lib/api.js";
  import { applyOp, validate, cardIds, CARD_TYPES, CATEGORIES, CATEGORY_NAMES, LETTERS, METATYPES, MAGIC_TYPES, MAGIC_NAMES, TRADITIONS, ATTRIBUTES, ATTR_NAMES, CUSTOM_SKILL_CATEGORIES, totemNames } from "../../../shared/creation.mjs";
  import { TABLES } from "../../../shared/rules.mjs";
  import { BUYABLE, choiceSpec, project, price, essenceOf, isCybereye } from "../../../shared/purchase.mjs";
  let { doc: initial, onDeleted } = $props();

  // Plain objects, not reactive proxies: the reducer clones them (structuredClone can't clone a proxy).
  // The page reads its document ONCE (Document.svelte re-creates it per id); later answers come from the server here.
  const start = untrack(() => $state.snapshot(initial));
  let server = $state.raw(start), body = $state.raw(start.body), error = $state(""), sending = $state(0);
  let queue = Promise.resolve();
  const check = $derived(validate(body));
  const sys = $derived(body.actor.system), pr = $derived(sys.chargen.priorities), opts = $derived(body.creation.options);
  const finished = $derived(!!body.creation.finished);
  const TOTEMS = Object.entries(totemNames()).sort((a, b) => a[1].localeCompare(b[1]));
  const STEPS = [["concept", "Concept"], ["priorities", "Priorities"], ["metatype", "Metatype"], ["magic", "Magic"], ["attributes", "Attributes"], ["skills", "Skills"], ["resources", "Resources"], ["card", "Table card"]];
  const SKILL_CATEGORY = { active: "Active", knowledge: "Knowledge", language: "Language", build_repair: "Build/Repair", special: "Special" };
  /** The full catalog entries this page fetched (the reducer copies an entry's data into the character). */
  const entries = new Map();
  const lookup = (id) => entries.get(id) ?? null;
  let coreSkills = $state([]), pickSkill = $state(""), customCategory = $state("knowledge"), customName = $state("");
  get("/api/catalog/entries?type=skill&book=sr2&limit=100").then(r => { coreSkills = r.entries; }).catch(() => { /* the add list stays empty; the page still works */ });
  const skills = $derived(body.actor.items.filter(i => i.type === "skill"));
  const choicesOf = (item) => body.creation.items[item._id]?.choices ?? {};
  function skillChange(item, patch) {
    const c = choicesOf(item);
    change({ op: "setSkill", itemId: item._id, allocated: c.allocated, concentration: c.concentration, specialization: c.specialization, freeLanguage: c.freeLanguage, ...patch });
  }
  // Resources (docs/PLAN-M2c.md).
  const TYPE_NAME = { weapon: "Weapon", armor: "Armor", gear: "Gear", ammo: "Ammunition", cyberware: "Cyberware", spell: "Spell", focus: "Focus" };
  const CHOICE_NAME = { quantity: "Qty", bundles: "Boxes", rating: "Rating", force: "Force", strengthMinimum: "Str Min", in: "In", spell: "Spell", skill: "Skill" };
  let shopQ = $state(""), shopType = $state(""), shop = $state([]), shopBusy = $state(false);
  let shopTimer, shopSeq = 0;
  function searchShop() {
    clearTimeout(shopTimer);
    const mine = ++shopSeq;   // only the latest search's answer is shown, even one still waiting to start (r1 #7, r2)
    shopTimer = setTimeout(async () => {
      const p = new URLSearchParams({ book: "sr2", limit: "30" });
      for (const t of shopType ? [shopType] : BUYABLE) p.append("type", t);
      if (shopQ.trim()) p.set("q", shopQ.trim());
      shopBusy = true;
      try { const r = await get(`/api/catalog/entries?${p}`); if (!gone && mine === shopSeq) shop = r.entries; } catch (err) { if (!gone && mine === shopSeq) error = err.message; }
      if (mine === shopSeq) shopBusy = false;
    }, 250);
  }
  searchShop();
  async function buy(id) {
    try { if (!entries.has(id)) entries.set(id, await get(`/api/catalog/entries/${encodeURIComponent(id)}`)); }
    catch (err) { if (!gone) error = err.message; return; }
    if (!gone) change({ op: "addItem", catalogId: id });
  }
  /** Every bought thing (eye accessories included), with what it costs and the Essence it takes. */
  const bought = $derived(Object.entries(body.creation.items).filter(([, r]) => r.type !== "skill").sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, r]) => {
    const item = body.actor.items.find(i => i._id === id), projected = item ? { system: item.system, flags: item.flags } : project(r, r.choices);
    return { id, r, spec: choiceSpec(r), price: price(r, projected, body.actor.items), essence: item && r.type === "cyberware" ? essenceOf(item, body.actor.items) : null };
  }));
  const eyes = $derived(bought.filter(x => isCybereye(x.r)));
  const spells = $derived(bought.filter(x => x.r.type === "spell"));
  const setChoice = (id, key, value) => change({ op: "setItem", itemId: id, choices: { [key]: value } });

  async function addCoreSkill() {
    const id = pickSkill;   // read once: the list can change while the entry is on its way
    if (!id) return;
    pickSkill = "";
    try { if (!entries.has(id)) entries.set(id, await get(`/api/catalog/entries/${encodeURIComponent(id)}`)); }
    catch (err) { if (!gone) error = err.message; return; }
    if (!gone) change({ op: "addSkill", catalogId: id });   // not after the page closed (review M2b #5)
  }
  const nuyen = (n) => `${n.toLocaleString("en-US")}¥`;
  const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "");

  /**
   * Make a change: refused here (the same reducer the server runs) or shown at once, then saved. When a save fails,
   * the changes still waiting are DROPPED (code review M2a #5): each was made on top of the failed one, so sending it
   * against what the server really holds could save something the player never saw.
   */
  let epoch = 0, recovering = $state(false), gone = false;
  onDestroy(() => { gone = true; });
  function change(op) {
    if (recovering) return;   // nothing new on top of a copy that's about to be replaced (review r2)
    try { body = applyOp(body, op, lookup); } catch (err) { error = err.message; return; }
    error = ""; sending++;
    const mine = epoch;
    queue = queue.then(async () => {
      if (mine === epoch) {
        try { server = await mutate("POST", `/api/documents/${server.document.id}/ops`, { revision: server.document.revision, ops: [op] }); }
        catch (err) {
          epoch++; recovering = true;
          error = err.code === "stale" ? "This character changed somewhere else. It now shows the saved version: redo your last changes."
            : err.code === "network" ? "The line dropped. This shows what was saved: redo your last changes." : err.message;
          try { server = await get(`/api/documents/${server.document.id}`); } catch { /* keep the last answer */ }
          body = server.body; recovering = false;
        }
      }
      if (--sending === 0) body = server.body;   // the server's copy wins once nothing else is on its way
    });
  }
  const numberFrom = (ev) => Number.parseInt(ev.currentTarget.value, 10);
  // The printable sheet: paper and font remembered in this browser (a convenience; the server holds no preference yet).
  const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  // The font: "" = the account's preference (the server applies it); a choice here overrides it for this browser.
  let sheetStyle = $state(pref("sheet.style", "classic")), paper = $state(pref("sheet.paper", "letter")), sheetFont = $state(pref("sheet.fontChoice", ""));   // a new key: the old one stored a default, not a choice (r2 #1)
  $effect(() => { try { localStorage.setItem("sheet.paper", paper); localStorage.setItem("sheet.style", sheetStyle); localStorage.setItem("sheet.fontChoice", sheetFont); } catch { /* private mode */ } });
  const sheetHref = $derived(`/api/documents/${server.document.id}/sheet.pdf?style=${sheetStyle}&paper=${paper}${sheetFont ? `&font=${sheetFont}` : ""}`);
  // The table card (docs/PLAN-sheet.md slice 4): the chosen rows, and the server's fit answer after each change.
  const CARD_SECTION = { attacks: "Attacks", skills: "Active skills", cyberware: "Cyberware", powers: "Adept powers", spells: "Spells" };
  const onCard = $derived(new Set(cardIds(body)));
  const cardRows = $derived(Object.entries(CARD_SECTION).map(([k, title]) => [title, body.actor.items.filter(i => CARD_TYPES[i.type] === k && (i.type !== "skill" || i.system.category === "active"))]).filter(([, list]) => list.length));
  let fit = $state(null), fitTimer, fitSeq = 0;
  const cardQuery = $derived(`style=${sheetStyle}&paper=${paper}${sheetFont ? `&font=${sheetFont}` : ""}`);
  $effect(() => {
    void body.creation.card; void body.actor.items.length; const q = cardQuery; const rev = server.document.revision;
    clearTimeout(fitTimer);
    const mine = ++fitSeq;
    fit = null;   // an answer for another card is never shown (card r1 #5)
    fitTimer = setTimeout(async () => {
      if (sending) return;   // the answer is checked again when the save lands (the revision changes)
      try { const r = await get(`/api/documents/${server.document.id}/card/fit?${q}`); if (!gone && mine === fitSeq) fit = { ...r, rev, q }; }
      catch (err) { if (!gone && mine === fitSeq) fit = { fits: false, overflow: [], message: err.message, rev, q }; }
    }, 700);
  });
  const cardReady = $derived(!!fit?.fits && !sending && fit.rev === server.document.revision && fit.q === cardQuery);
  let nameInput = $state(start.body.name);
  let notesInput = $state(start.body.notes);
</script>

<div class="sheet" inert={recovering} aria-busy={recovering}>
  <div class="steps">
    <header>
      <h1>{body.name}</h1>
      <p class="muted">character · revision {server.document.revision} · {sending ? "saving…" : "saved"}{finished ? " · finished" : ""}</p>
      <div class="row print">
        <a class="button quiet" href={sheetHref} target="_blank" rel="noopener">Print sheet</a>
        <a class="button quiet" href={`/api/documents/${server.document.id}/statblock.md`} download>Stat block (Markdown)</a>
        <label class="row inline"><span class="sr-only">Style</span><select bind:value={sheetStyle} aria-label="Sheet style"><option value="classic">Classic</option><option value="fohawk">Fohawk</option><option value="fohawk-ink">Fohawk (ink-saver)</option></select></label>
        <label class="row inline"><span class="sr-only">Paper</span><select bind:value={paper} aria-label="Paper"><option value="letter">US Letter</option><option value="a4">A4</option></select></label>
        <label class="row inline"><span class="sr-only">Font</span><select bind:value={sheetFont} aria-label="Sheet font"><option value="">My account's font</option><option value="standard">Standard font</option><option value="readable">Readable font</option></select></label>
      </div>
      <nav aria-label="Steps" class="row">{#each STEPS as [id, title]}<a href={`#step-${id}`}>{title}</a>{/each}</nav>
    </header>
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}

    <section id="step-concept">
      <h2>Concept</h2>
      <form class="stack wide" onsubmit={(ev) => { ev.preventDefault(); if (nameInput.trim() && nameInput.trim() !== body.name) change({ op: "setName", name: nameInput }); }}>
        <div class="row">
          <label class="grow"><span>Street name</span><input bind:value={nameInput} maxlength="120" required disabled={finished}></label>
          <button disabled={finished || !nameInput.trim() || nameInput.trim() === body.name}>Rename</button>
        </div>
      </form>
      <label class="notes"><span>Notes: who is this, and why do they run the shadows?</span>
        <textarea bind:value={notesInput} maxlength="20000" onchange={() => notesInput !== body.notes && change({ op: "setNotes", notes: notesInput })}></textarea></label>
    </section>

    <section id="step-priorities">
      <h2>Priorities</h2>
      <p class="muted">Give each of the five categories one letter, A to E. Each letter once: picking a letter another category has swaps the two. <span class="cite">SR2 p.44</span></p>
      <div class="scroll"><table class="grid">
        <thead><tr><th scope="col">Category</th>{#each LETTERS as l}<th scope="col">{l}</th>{/each}</tr></thead>
        <tbody>
          {#each CATEGORIES as c}
            <tr>
              <th scope="row">{CATEGORY_NAMES[c]}</th>
              {#each LETTERS as l}
                <td><input type="radio" class="check" name={`prio-${c}`} aria-label={`${CATEGORY_NAMES[c]} ${l}`} checked={pr[c] === l} disabled={finished}
                  onchange={() => change({ op: "setPriority", category: c, letter: l })}></td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table></div>
      <label class="row inline"><input type="checkbox" class="check" checked={opts.moreMetahumans} disabled={finished}
        onchange={(ev) => change({ op: "setOption", key: "moreMetahumans", value: ev.currentTarget.checked })}>
        <span>Optional rule: More Metahumans (metahumans at Race C; magic at A or B for everyone) <span class="cite">SR2 p.46</span></span></label>
      <dl class="table-rows">
        {#each LETTERS as l}
          <div><dt>{l}</dt><dd>{TABLES.priorities[l].attributes} attribute pts · {TABLES.priorities[l].skills} skill pts · {nuyen(TABLES.priorities[l].resources)}</dd></div>
        {/each}
      </dl>
    </section>

    <section id="step-metatype">
      <h2>Metatype</h2>
      <div class="row" role="radiogroup" aria-label="Metatype">
        {#each METATYPES as m}
          <label class="row inline"><input type="radio" class="check" name="metatype" checked={sys.race === m} disabled={finished} onchange={() => change({ op: "setMetatype", race: m })}><span>{m[0].toUpperCase() + m.slice(1)}</span></label>
        {/each}
      </div>
      <p class="muted">A metahuman needs Priority A in Race{opts.moreMetahumans ? " (C or better with More Metahumans)" : ""}. <span class="cite">SR2 p.44</span></p>
    </section>

    <section id="step-magic">
      <h2>Magic</h2>
      <div class="row">
        <label><span>Magic</span>
          <select value={sys.magic.type} disabled={finished} onchange={(ev) => change({ op: "setMagic", type: ev.currentTarget.value })}>
            {#each MAGIC_TYPES as t}<option value={t}>{MAGIC_NAMES[t][0].toUpperCase() + MAGIC_NAMES[t].slice(1)}</option>{/each}
          </select></label>
        {#if sys.magic.type === "full_magician"}
          <label><span>Tradition</span>
            <select value={sys.magic.tradition} disabled={finished} onchange={(ev) => change({ op: "setTradition", tradition: ev.currentTarget.value })}>
              <option value="none">Choose…</option>
              {#each TRADITIONS as t}<option value={t}>{t[0].toUpperCase() + t.slice(1)}</option>{/each}
            </select></label>
          {#if sys.magic.tradition === "shamanic"}
            <label><span>Totem <span class="cite">SR2 p.119</span></span>
              <select value={sys.magic.totem} disabled={finished} onchange={(ev) => change({ op: "setTotem", totem: ev.currentTarget.value })}>
                <option value="">Choose…</option>
                {#each TOTEMS as [k, name]}<option value={k}>{name}</option>{/each}
              </select></label>
          {/if}
        {/if}
      </div>
    </section>

    <section id="step-attributes">
      <h2>Attributes</h2>
      <p class="muted">Buy each attribute from 1; racial modifiers apply after. <span class="cite">SR2 p.45</span></p>
      <div class="scroll"><table class="grid attrs">
        <thead><tr><th scope="col">Attribute</th><th scope="col">Bought</th><th scope="col">Racial</th><th scope="col">Rating</th><th scope="col">Max</th></tr></thead>
        <tbody>
          {#each ATTRIBUTES as a}
            {@const mod = TABLES.racialModifiers[sys.race]?.[a] ?? 0}
            {@const max = TABLES.racialMaximums[sys.race]?.[a] ?? 6}
            {@const rating = sys[a].base + mod}
            <tr>
              <th scope="row">{ATTR_NAMES[a]}</th>
              <td><input type="number" min="1" max="12" step="1" value={sys[a].base} aria-label={`${ATTR_NAMES[a]} bought`} disabled={finished}
                onchange={(ev) => { const n = numberFrom(ev); if (Number.isInteger(n) && n !== sys[a].base) change({ op: "setAttribute", attr: a, base: n }); else ev.currentTarget.value = sys[a].base; }}></td>
              <td>{sign(mod)}</td>
              <td class:bad={rating > max || rating < 1}>{rating}</td>
              <td class="muted">{max}</td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    </section>


    <section id="step-skills">
      <h2>Skills</h2>
      <p class="muted">Put Skill Points into each skill; no skill rating may start above 6. A concentration takes 1 from the skill and gives +1 in the narrow field; a specialization takes 2 and gives +2 (Firearms 5 → Firearms 3, Pistols 5, Ares Predator 7), and only those may start above 6. Your native language is free at Intelligence + 2. <span class="cite">SR2 p.45, p.70, p.74</span></p>
      {#if !finished}
        <div class="row adders">
          <label><span>From the core book</span>
            <select bind:value={pickSkill}>
              <option value="">Choose a skill…</option>
              {#each ["active", "knowledge", "language"] as cat}
                <optgroup label={SKILL_CATEGORY[cat]}>
                  {#each coreSkills.filter(e => e.category?.includes(cat)) as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
                </optgroup>
              {/each}
            </select></label>
          <button type="button" disabled={!pickSkill} onclick={addCoreSkill}>Add</button>
        </div>
        <form class="row adders" onsubmit={(ev) => { ev.preventDefault(); if (customName.trim()) { change({ op: "addCustomSkill", category: customCategory, name: customName }); customName = ""; } }}>
          <label><span>Your own</span>
            <select bind:value={customCategory}>{#each CUSTOM_SKILL_CATEGORIES as c}<option value={c}>{SKILL_CATEGORY[c]}</option>{/each}</select></label>
          <label class="grow"><span>Name</span><input bind:value={customName} maxlength="60" placeholder="Seattle Gangs, Or'zet, Car B/R…"></label>
          <button disabled={!customName.trim()}>Add</button>
        </form>
      {/if}
      {#if skills.length}
        <div class="scroll"><table class="grid skills">
          <thead><tr><th scope="col">Skill</th><th scope="col">Points</th><th scope="col">Concentration</th><th scope="col">Specialization</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {#each skills as item (item._id)}
              {@const c = choicesOf(item)}
              {@const s = item.system}
              <tr>
                <th scope="row">{item.name} <strong class="rating">{s.rating}</strong><br><span class="muted small">{SKILL_CATEGORY[s.category] ?? s.category}{s.isMagical ? " · magical" : ""}{#if s.concentration.name}{` · ${s.concentration.name} ${s.concentration.rating}`}{/if}{#if s.specialization.name}{` · ${s.specialization.name} ${s.specialization.rating}`}{/if}</span></th>
                <td>
                  {#if s.category === "language"}
                    <select value={c.freeLanguage} aria-label={`${item.name}: free language`} disabled={finished} onchange={(ev) => skillChange(item, { freeLanguage: ev.currentTarget.value })}>
                      <option value="">Bought</option><option value="native">Native (free)</option><option value="dialect">Street dialect (free)</option>
                    </select>
                  {/if}
                  {#if !c.freeLanguage}
                    <input type="number" min="1" max={c.specialization ? 8 : c.concentration ? 7 : 6} step="1" value={c.allocated} aria-label={`${item.name} points`} disabled={finished}
                      onchange={(ev) => { const n = numberFrom(ev); if (Number.isInteger(n) && n >= 0 && n <= 12) skillChange(item, { allocated: n }); else ev.currentTarget.value = c.allocated; }}>
                  {/if}
                </td>
                <td><input value={c.concentration} maxlength="60" aria-label={`${item.name} concentration`} disabled={finished || !!c.freeLanguage}
                  onchange={(ev) => skillChange(item, { concentration: ev.currentTarget.value, specialization: ev.currentTarget.value.trim() ? c.specialization : "" })}></td>
                <td><input value={c.specialization} maxlength="60" aria-label={`${item.name} specialization`} disabled={finished || !c.concentration}
                  onchange={(ev) => skillChange(item, { specialization: ev.currentTarget.value })}></td>
                <td><button type="button" class="quiet" disabled={finished} aria-label={`Remove ${item.name}`} onclick={() => change({ op: "removeSkill", itemId: item._id })}>✕</button></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      {:else}
        <p class="muted">No skills yet.</p>
      {/if}
    </section>

    <section id="step-resources">
      <h2>Resources</h2>
      <p class="muted">Spend your nuyen on gear at list price; magicians spend Force Points on spells (Force up to 6) and on bonding foci. No starting gear above Rating 6. Cybereyes take up to .5 Essence of accessories for free. <span class="cite">SR2 p.46, p.137, p.247</span></p>
      {#if !finished}
        <div class="row adders">
          <label class="grow"><span>Search the core book</span><input bind:value={shopQ} oninput={searchShop} maxlength="64" placeholder="Ares Predator, armor jacket, wired reflexes…"></label>
          <label><span>Type</span><select bind:value={shopType} onchange={searchShop}><option value="">Everything</option>{#each BUYABLE as t}<option value={t}>{TYPE_NAME[t]}</option>{/each}</select></label>
        </div>
        <ul class="shop" aria-busy={shopBusy}>
          {#each shop as e (e.id)}
            <li><span class="name">{e.name}</span><span class="muted small">{TYPE_NAME[e.type] ?? e.type}{e.cost ? ` · ${nuyen(e.cost)}` : ""}{e.citation?.page ? ` · p.${e.citation.page}` : ""}</span><button type="button" class="quiet" onclick={() => buy(e.id)}>Add</button></li>
          {:else}
            <li class="muted">{shopBusy ? "Searching…" : "Nothing matches."}</li>
          {/each}
        </ul>
      {/if}
      {#if bought.length}
        <div class="scroll"><table class="grid bought">
          <thead><tr><th scope="col">Item</th><th scope="col">Choices</th><th scope="col">Price</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {#each bought as x (x.id)}
              <tr>
                <th scope="row">{x.r.name}<br><span class="muted small">{TYPE_NAME[x.r.type]}{x.essence != null ? ` · Essence ${x.essence}` : ""}{x.r.choices.in ? " · in cybereyes" : ""}</span></th>
                <td class="choices">
                  {#each Object.entries(x.spec) as [k, sp] (k)}
                    <label class="choice"><span>{CHOICE_NAME[k] ?? k}</span>
                      {#if sp.kind === "int"}
                        <input type="number" min={sp.lo} max={sp.hi} step="1" value={x.r.choices[k]} disabled={finished}
                          onchange={(ev) => { const n = numberFrom(ev); if (Number.isInteger(n) && n >= sp.lo && n <= sp.hi) setChoice(x.id, k, n); else ev.currentTarget.value = x.r.choices[k]; }}>
                      {:else if sp.kind === "oneOf"}
                        <select value={x.r.choices[k]} disabled={finished} onchange={(ev) => setChoice(x.id, k, Number(ev.currentTarget.value))}>{#each sp.values as v}<option value={v}>{v}</option>{/each}</select>
                      {:else if k === "in"}
                        <select value={x.r.choices.in} disabled={finished} onchange={(ev) => setChoice(x.id, "in", ev.currentTarget.value)}><option value="">On its own</option>{#each eyes as e (e.id)}<option value={e.id}>{e.r.name}</option>{/each}</select>
                      {:else if k === "spell"}
                        <select value={x.r.choices.spell} disabled={finished} onchange={(ev) => setChoice(x.id, "spell", ev.currentTarget.value)}><option value="">Choose…</option>{#each spells as sp2 (sp2.id)}<option value={sp2.id}>{sp2.r.name}</option>{/each}</select>
                      {:else}
                        <input value={x.r.choices[k]} maxlength="60" disabled={finished} onchange={(ev) => setChoice(x.id, k, ev.currentTarget.value)}>
                      {/if}
                    </label>
                  {/each}
                </td>
                <td class="price">{x.r.type === "spell" ? `${x.r.choices.force} FP` : nuyen(x.price)}{#if x.r.choices.in}<br><span class="muted small">in the eyes' price</span>{/if}</td>
                <td><button type="button" class="quiet" disabled={finished} aria-label={`Remove ${x.r.name}`} onclick={() => change({ op: "removeItem", itemId: x.id })}>✕</button></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      {:else}
        <p class="muted">Nothing bought yet.</p>
      {/if}
    </section>

    <section id="step-card">
      <h2>Table card</h2>
      <p class="muted">One page for the table: attributes, pools, monitors, and the rows you tick below. Everything stays on the full sheet.</p>
      {#each cardRows as [title, list] (title)}
        <fieldset class="books"><legend>{title}</legend>
          {#each list as item (item._id)}
            <label class="row inline"><input type="checkbox" class="check" checked={onCard.has(item._id)} onchange={(ev) => change({ op: "setCard", itemId: item._id, on: ev.currentTarget.checked })}><span>{item.name}</span></label>
          {/each}
        </fieldset>
      {:else}
        <p class="muted">Nothing to choose yet: weapons, active skills, cyberware, powers and spells appear here.</p>
      {/each}
      <p class="row" role="status">
        {#if !fit}<span class="muted">Checking the fit…</span>
        {:else if fit.fits}<span class="good-text">Fits on one page.</span>
        {:else}<span class="bad">{fit.message || "It doesn't fit."}</span>{/if}
        <a class="button quiet" class:disabled={!cardReady} aria-disabled={!cardReady} href={cardReady ? `/api/documents/${server.document.id}/card.pdf?${cardQuery}` : undefined} target="_blank" rel="noopener">Print card</a>
      </p>
    </section>

    <p class="row later"><button type="button" class="danger" onclick={onDeleted}>Delete character</button></p>
  </div>

  <aside class="panel" aria-label="Rules check">
    <h2>Rules check</h2>
    <dl>
      <div><dt>Attribute points</dt><dd class:bad={pr.attributes && check.budgets.attributes.over}>{check.budgets.attributes.spent} / {pr.attributes ? check.budgets.attributes.total : "—"}</dd></div>
      <div><dt>Skill points</dt><dd class:bad={pr.skills && check.budgets.skills.over}>{check.budgets.skills.spent} / {pr.skills ? check.budgets.skills.total : "—"}</dd></div>
      {#if sys.magic.type === "full_magician" || check.budgets.forcePoints.spent}<div><dt>Force Points</dt><dd class:bad={check.budgets.forcePoints.over}>{check.budgets.forcePoints.spent} / {check.budgets.forcePoints.total}</dd></div>{/if}
      <div><dt>Nuyen</dt><dd class:bad={pr.resources && check.budgets.resources.over}>{nuyen(check.budgets.resources.spent)} / {pr.resources ? nuyen(check.budgets.resources.total) : "—"}</dd></div>
      <div><dt>Essence</dt><dd class:bad={check.essence < 0}>{check.essence}</dd></div>
      {#if sys.magic.type !== "none"}<div><dt>Magic</dt><dd class:bad={check.magic < 1}>{check.magic}</dd></div>{/if}
    </dl>
    {#if check.problems.length === 0}
      <p class="good">No problems in these steps. Contacts, lifestyle and finishing come next.</p>
    {:else}
      <ul class="problems">
        {#each check.problems as p, i (i)}
          <li class={p.severity}><a href={`#step-${p.step}`}>{p.severity === "error" ? "Rule" : p.severity === "todo" ? "To do" : "Note"}</a> {p.text} <span class="cite">SR2 p.{p.cite.page}</span></li>
        {/each}
      </ul>
    {/if}
  </aside>
</div>

<style>
  .sheet { display: grid; gap: 1.5rem; grid-template-columns: minmax(0, 1fr); }
  @media (min-width: 60rem) { .sheet { grid-template-columns: minmax(0, 1fr) 19rem; align-items: start; } .panel { position: sticky; top: 1rem; } }
  section { scroll-margin-top: 1rem; }
  .panel { border: 1px solid var(--line); background: var(--surface); padding: .9rem 1rem; }
  .panel h2 { margin-top: 0; }
  .problems { list-style: none; margin: .8rem 0 0; padding: 0; display: grid; gap: .55rem; font-size: .95rem; }
  .problems a { font-weight: 700; margin-right: .25rem; }
  .problems li.error a { color: var(--danger); }
  .problems li.warning { color: var(--muted); }
  .good { color: var(--ok); margin: .8rem 0 0; }
  .bad { color: var(--danger); font-weight: 700; }
  .cite { color: var(--muted); font-size: .85rem; white-space: nowrap; }
  table.grid { border-collapse: collapse; margin: 0 0 1rem; }
  .scroll { overflow-x: auto; }
  table.grid th, table.grid td { padding: .3rem .4rem; border-bottom: 1px solid var(--line); text-align: center; }
  table.grid th[scope="row"] { text-align: left; font-weight: 400; }
  table.grid thead th { color: var(--muted); font-weight: 400; font-size: .9rem; }
  table.attrs input { width: 3.75rem; text-align: right; padding: .3rem .45rem; }
  label.inline { display: flex; gap: .5rem; margin: 0 0 1rem; }
  label.notes { margin-top: 1rem; }
  .table-rows { margin-bottom: .5rem; font-size: .9rem; }
  .later { margin-top: 2.5rem; }
  .print { margin: 0 0 .75rem; }
  .good-text { color: var(--ok); }
  a.disabled { opacity: .55; pointer-events: none; }
  .print label.inline { margin: 0; }
  .adders { margin: 0 0 .9rem; align-items: end; }
  table.skills input:not([type="number"]) { width: 9rem; padding: .3rem .45rem; }
  table.skills input[type="number"] { width: 3.75rem; text-align: right; padding: .3rem .45rem; }
  table.skills select { padding: .3rem .4rem; margin-bottom: .25rem; }
  table.skills th[scope="row"] { min-width: 10rem; max-width: 16rem; }
  table.skills select { width: 100%; max-width: 9rem; }
  .rating { color: var(--accent); }
  .small { font-size: .82rem; }
  ul.shop { list-style: none; margin: 0 0 1rem; padding: 0; max-height: 18rem; overflow: auto; border-top: 1px solid var(--line); }
  ul.shop li { display: flex; gap: .25rem .75rem; align-items: center; flex-wrap: wrap; padding: .35rem 0; border-bottom: 1px solid var(--line); }
  ul.shop .name { font-weight: 700; margin-right: auto; }
  table.bought td.choices { text-align: left; }
  label.choice { display: inline-grid; gap: .1rem; margin: 0 .5rem .25rem 0; vertical-align: top; }
  label.choice > span { font-size: .78rem; }
  label.choice input[type="number"] { width: 4.5rem; padding: .25rem .4rem; text-align: right; }
  label.choice input:not([type="number"]) { width: 8rem; padding: .25rem .4rem; }
  label.choice select { padding: .25rem .35rem; max-width: 10rem; }
  td.price { white-space: nowrap; text-align: right; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
