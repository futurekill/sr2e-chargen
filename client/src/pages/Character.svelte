<script>
  /**
   * Character creation (docs/PLAN-M2.md §6). Every change is ONE operation: applied here at once with the shared
   * reducer (a fast screen), then sent to the server, whose answer replaces the local copy. Changes go out one at a
   * time, in order, each on top of the revision the previous answer gave.
   */
  import { untrack, onDestroy } from "svelte";
  import { get, mutate, upload } from "../lib/api.js";
  import { derive } from "../../../shared/derive.mjs";
  import { applyOp, validate, karmaOptions, undoable, PLAY_GEAR, cardIds, cardEligible, CARD_TYPES, CATEGORIES, CATEGORY_NAMES, LETTERS, METATYPES, MAGIC_TYPES, MAGIC_NAMES, TRADITIONS, ATTRIBUTES, ATTR_NAMES, CUSTOM_SKILL_CATEGORIES, totemNames } from "../../../shared/creation.mjs";
  import { TABLES } from "../../../shared/rules.mjs";
  import { BUYABLE, choiceSpec, defaultChoices, project, price, essenceOf, isCybereye, smallWeapon } from "../../../shared/purchase.mjs";
  import { saleQuoteOf, streetPrice, ratedStreetIndex, FENCE_STEPS } from "../../../shared/rules.mjs";
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
  const STEPS = [["concept", "Concept"], ["priorities", "Priorities"], ["metatype", "Metatype"], ["magic", "Magic"], ["attributes", "Attributes"], ["skills", "Skills"], ["resources", "Resources"], ["card", "Table card"], ["finish", "Finish"]];
  // The core book's archetypes (p.50–65): suggestions for followers, never a limit (docs/PLAN-M2d.md Draft 3).
  const ARCHETYPES = ["Bodyguard", "Combat Mage", "Decker", "Detective", "Dwarf Mercenary", "Elven Decker", "Former Company Man", "Former Wage Mage",
    "Gang Member", "Mercenary", "Rigger", "Shaman", "Street Mage", "Street Samurai", "Street Shaman", "Tribesman"];
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
  const TYPE_NAME = { weapon: "Weapon", armor: "Armor", gear: "Gear", ammo: "Ammunition", cyberware: "Cyberware", spell: "Spell", focus: "Focus", adept_power: "Adept power", program: "Program", contact: "Contact", lifestyle: "Lifestyle", vehicle: "Vehicle" };
  const SHOP_TYPES = [...BUYABLE, "vehicle"];   // a vehicle is an actor: addVehicle, not addItem (S9)
  const CHOICE_NAME = { quantity: "Qty", bundles: "Boxes", rating: "Rating", force: "Force", strengthMinimum: "Str Min", in: "In", spell: "Spell", skill: "Skill", weapon: "Weapon", level: "Level", senses: "Senses (comma-separated)", kind: "As", months: "Months" };
  let shopQ = $state(""), shopType = $state(""), shop = $state([]), shopBusy = $state(false);
  let shopTimer, shopSeq = 0;
  function searchShop() {
    clearTimeout(shopTimer);
    const mine = ++shopSeq;   // only the latest search's answer is shown, even one still waiting to start (r1 #7, r2)
    shopTimer = setTimeout(async () => {
      const p = new URLSearchParams({ book: "sr2", limit: "30" });
      for (const t of shopType ? [shopType] : SHOP_TYPES) p.append("type", t);
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
    if (!gone) change(entries.get(id)?.type === "vehicle" ? { op: "addVehicle", catalogId: id } : { op: "addItem", catalogId: id });
  }
  const vehicles = $derived(Object.keys(body.creation.vehicles ?? {}).sort().map(k => ({ id: k, v: body.creation.vehicles[k].source })));
  /** Every bought thing (eye accessories included), with what it costs and the Essence it takes. */
  const bought = $derived(Object.entries(body.creation.items).filter(([, r]) => r.type !== "skill").sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, r]) => {
    const item = body.actor.items.find(i => i._id === id), projected = item ? { system: item.system, flags: item.flags } : project(r, r.choices, body.creation.items);
    return { id, r, spec: choiceSpec(r), price: price(r, projected, body.actor.items), essence: item && r.type === "cyberware" ? essenceOf(item, body.actor.items) : null };
  }));
  const eyes = $derived(bought.filter(x => isCybereye(x.r)));
  const spells = $derived(bought.filter(x => x.r.type === "spell"));
  const ownSkills = $derived(Object.entries(body.creation.items).filter(([, r]) => r.type === "skill").map(([id, r]) => ({ id, name: r.name })));
  const melee = $derived(bought.filter(x => x.r.type === "weapon" && x.r.snapshot.weaponType === "melee"));
  const setChoice = (id, key, value) => change({ op: "setItem", itemId: id, choices: { [key]: value } });

  // After creation (docs/PLAN-M4a.md): Karma awards, advancement, the history and undo.
  const derived = $derived(derive({ actor: body.actor, options: { moreMetahumans: !!body.creation.options.moreMetahumans } }));
  const advOptions = $derived(finished ? karmaOptions(body) : []);
  const lastUndoable = $derived(finished ? undoable(body) : null);
  let awardAmount = $state(5), awardNote = $state(""), advPick = $state(""), gmApproved = $state(false), libraryConfirmed = $state(false);
  let addTo = $state(""), addKind = $state("newConcentration"), addName = $state(""), learnSkill = $state(""), learnCategory = $state("knowledge"), learnName = $state("");
  function raise() {
    const o = advOptions[Number(advPick)];
    if (!o) return;
    change({ op: "spendKarma", target: { ...o.target, ...(o.needs.includes("gmApproved") ? { gmApproved } : {}), ...(o.needs.includes("libraryConfirmed") ? { libraryConfirmed } : {}) } });
    advPick = ""; gmApproved = false; libraryConfirmed = false;
  }
  async function learn() {
    const id = learnSkill; if (!id) return;
    learnSkill = "";
    try { if (!entries.has(id)) entries.set(id, await get(`/api/catalog/entries/${encodeURIComponent(id)}`)); }
    catch (err) { if (!gone) error = err.message; return; }
    if (!gone) change({ op: "spendKarma", target: { newSkill: id } });
  }
  // Nuyen after creation (docs/PLAN-M4b.md, RULINGS R6/R7). The GM's sale mode comes from the server.
  let saleMode = $state("refund");
  const loadRules = () => get("/api/session").then(s => { saleMode = s.rules?.saleMode ?? "refund"; }).catch(() => { /* keep the last known */ });
  loadRules();
  // The GM may switch the mode while this page is open: re-read it when the page is shown again, and after a refusal.
  const onVisible = () => { if (document.visibilityState === "visible") loadRules(); };
  document.addEventListener("visibilitychange", onVisible);
  onDestroy(() => document.removeEventListener("visibilitychange", onVisible));
  let cashAmount = $state(0), cashDir = $state("in"), cashNote = $state(""), playQ = $state(""), playShop = $state([]), buying = $state(null), sellPct = $state({});
  let playTimer, playSeq = 0;
  function searchPlay() {
    clearTimeout(playTimer);
    const mine = ++playSeq;   // only the latest search's answer is shown (as the Resources shop)
    playTimer = setTimeout(async () => {
      const p = new URLSearchParams({ book: "sr2", limit: "20" });
      for (const t of PLAY_GEAR) p.append("type", t);
      if (playQ.trim()) p.set("q", playQ.trim());
      try { const r = await get(`/api/catalog/entries?${p}`); if (!gone && mine === playSeq) playShop = r.entries; } catch (err) { if (!gone && mine === playSeq) error = err.message; }
    }, 250);
  }
  searchPlay();
  /** Start buying an entry: its in-play choices with defaults, the street price shown, the price agreed prefilled. */
  async function startBuy(id) {
    try { if (!entries.has(id)) entries.set(id, await get(`/api/catalog/entries/${encodeURIComponent(id)}`)); }
    catch (err) { if (!gone) error = err.message; return; }
    const e = entries.get(id), rec = { type: e.type, name: e.name, snapshot: e.system, flags: e.flags ?? {}, source: e._stats?.compendiumSource ?? null, catalogId: e.id };
    const choices = defaultChoices(rec, { inPlay: true });
    buying = { id, rec, choices, price: streetFor(rec, choices) };
  }
  function streetFor(rec, choices) {
    rec = $state.snapshot(rec); choices = $state.snapshot(choices);   // plain copies: project() clones them
    const pr = project(rec, choices, body.creation.items), s = pr.system;
    return Math.round(streetPrice(price(rec, pr, body.actor.items), ratedStreetIndex(s.ratingStats, s.rating, s.streetIndex)));
  }
  const quoteFor = (it) => saleQuoteOf(it, { mode: saleMode, pct: sellPct[it._id] ?? 30, items: body.actor.items });
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
    try { body = applyOp(body, op, lookup, { saleMode }); } catch (err) { error = err.message; return; }
    error = ""; sending++;
    const mine = epoch;
    queue = queue.then(async () => {
      if (mine === epoch) {
        try { server = await mutate("POST", `/api/documents/${server.document.id}/ops`, { revision: server.document.revision, ops: [op] }); }
        catch (err) {
          epoch++; recovering = true;
          if (/how selling works/.test(err.message ?? "")) loadRules();   // the GM switched the sale mode
          error = err.code === "stale" ? "This character changed somewhere else. It now shows the saved version: redo your last changes."
            : err.code === "network" ? "The line dropped. This shows what was saved: redo your last changes." : err.message;
          try { server = await get(`/api/documents/${server.document.id}`); } catch { /* keep the last answer */ }
          body = server.body; recovering = false;
        }
      }
      if (--sending === 0) body = server.body;   // the server's copy wins once nothing else is on its way
    });
  }
  /** An op only the server can apply (it rolls dice: a gang's members, the finish): no local copy first. */
  function send(op) {
    if (recovering) return;
    error = ""; sending++;
    const mine = epoch;
    queue = queue.then(async () => {
      if (mine !== epoch) { if (--sending === 0) body = server.body; return; }   // dropped with the failed edit before it (r2)
      try { server = await mutate("POST", `/api/documents/${server.document.id}/ops`, { revision: server.document.revision, ops: [op] }); }
      catch (err) {
        // As change(): edits queued behind this one were made on a copy that is now gone, so they are dropped (M2d code r1 #2).
        epoch++; recovering = true;
        error = err.code === "stale" ? "This character changed somewhere else. It now shows the saved version: redo your last changes." : err.message;
        try { server = await get(`/api/documents/${server.document.id}`); } catch { /* keep the last answer */ }
        body = server.body; recovering = false;
      }
      if (--sending === 0) body = server.body;
    });
  }
  let extraName = $state(""), confirmFinish = $state(false);
  const ALLERGY_FIELDS = { rarity: ["uncommon", "common"], severity: ["nuisance", "mild", "moderate", "severe"], bonus: ["attributes", "skills", "force", "nuyen"] };
  const allergy = $derived(sys.chargen.allergy ?? { substance: "", rarity: "", severity: "", rarityBonus: "", severityBonus: "" });
  const setAllergy = (k, v) => change({ op: "setAllergy", ...allergy, [k]: v });
  // Each contact row's charge (p.46): the first two ordinary contacts (in the order bought) are free.
  const plainContacts = $derived(bought.filter(x => x.r.type === "contact" && (x.r.choices.kind ?? x.r.snapshot.contactType) === "contact").map(x => x.id));
  const contactPrice = (x) => ({ buddy: "10,000¥", gang: "50,000¥", follower: "200,000¥" })[x.r.choices.kind ?? x.r.snapshot.contactType] ?? (plainContacts.indexOf(x.id) < 2 ? "free" : "5,000¥");
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
  const cardRows = $derived(Object.entries(CARD_SECTION).map(([k, title]) => [title, body.actor.items.filter(i => cardEligible(i) && CARD_TYPES[i.type] === k)]).filter(([, list]) => list.length));
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
  // Portrait (docs/PLAN-portrait.md): uploaded raw, re-encoded on the server; shown from the owner-only route.
  const hasPortrait = $derived(!!(body.creation?.portrait?.assetId || body.creation?.portrait?.stock));
  let stock = $state([]), showStock = $state(false);
  get("/api/catalog/portraits").then(r => { if (!gone) stock = r.portraits; }).catch(() => { /* no gallery: uploads still work */ });
  async function pickStock(id) {
    picBusy = true; error = "";
    await (queue = queue.then(async () => {
      try { server = await mutate("POST", `/api/documents/${server.document.id}/portrait/stock`, { revision: server.document.revision, stock: id }); if (!sending) body = server.body; showStock = false; }
      catch (err) { error = err.message; }
    }));
    picBusy = false;
  }
  let picBusy = $state(false);
  async function pickPortrait(ev) {
    const file = ev.currentTarget.files?.[0];
    ev.currentTarget.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { error = "A portrait is a JPEG, PNG or WebP image."; return; }
    if (file.size > 8 * 1024 * 1024) { error = "That image is over 8 MB."; return; }
    picBusy = true; error = "";
    // On the same queue as every other change, so no two writes start from the same revision (r1 #2).
    await (queue = queue.then(async () => {
      try { server = await upload(`/api/documents/${server.document.id}/portrait?revision=${server.document.revision}`, file); if (!sending) body = server.body; }
      catch (err) { error = err.code === "busy" ? "The server is busy. Try again in a moment." : err.message; }
    }));
    picBusy = false;
  }
  async function removePortrait() {
    picBusy = true; error = "";
    await (queue = queue.then(async () => {
      try { server = await mutate("DELETE", `/api/documents/${server.document.id}/portrait?revision=${server.document.revision}`, {}); if (!sending) body = server.body; }
      catch (err) { error = err.message; }
    }));
    picBusy = false;
  }
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
      <nav aria-label="Steps" class="row">{#each finished ? [["karma", "Karma"], ["nuyen", "Nuyen"], ...STEPS] : STEPS as [id, title]}<a href={`#step-${id}`}>{title}</a>{/each}</nav>
    </header>
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}

    {#if finished}
      <section id="step-karma">
        <h2>Karma</h2>
        <p class="muted">Good Karma {sys.karma?.current ?? 0} · Total {sys.karma?.total ?? 0} · Karma Pool {derived.karmaPool}. An award adds to Total; one-tenth of Total (rounded up) is the Karma Pool, the rest Good Karma to spend. <span class="cite">SR2 p.190–191</span></p>
        <form class="row adders" onsubmit={(ev) => { ev.preventDefault(); if (Number.isInteger(awardAmount) && awardAmount >= 1 && awardAmount <= 200) { change({ op: "awardKarma", amount: awardAmount, note: awardNote }); awardNote = ""; } }}>
          <label><span>Award</span><input type="number" min="1" max="200" step="1" bind:value={awardAmount}></label>
          <label class="grow"><span>For (optional)</span><input bind:value={awardNote} maxlength="120" placeholder="the run, a good scene…"></label>
          <button>Award Karma</button>
        </form>
        <h3>Raise</h3>
        <div class="row adders">
          <label class="grow"><span>Attribute or skill</span><select bind:value={advPick}><option value="">Choose…</option>
            {#each advOptions as o, i}<option value={String(i)} disabled={o.cost > (sys.karma?.current ?? 0)}>{o.label} — {o.cost} Karma{o.needs.includes("gmApproved") ? " (above the racial maximum: double, GM approval)" : ""}{o.needs.includes("libraryConfirmed") ? " (needs a sorcery library)" : ""}</option>{/each}</select></label>
          {#if advOptions[Number(advPick)]?.needs.includes("gmApproved")}<label class="row inline"><input type="checkbox" class="check" bind:checked={gmApproved}><span>The GM approves</span></label>{/if}
          {#if advOptions[Number(advPick)]?.needs.includes("libraryConfirmed")}<label class="row inline"><input type="checkbox" class="check" bind:checked={libraryConfirmed}><span>A sorcery library rated at least the new rating</span></label>{/if}
          <button type="button" disabled={advPick === ""} onclick={raise}>Raise</button>
        </div>
        <div class="row adders">
          <label><span>Add to</span><select bind:value={addTo}><option value="">Skill…</option>{#each body.actor.items.filter(i => i.type === "skill") as sk (sk._id)}<option value={sk._id}>{sk.name}</option>{/each}</select></label>
          <label><span>A new</span><select bind:value={addKind}><option value="newConcentration">Concentration</option><option value="newSpecialization">Specialization</option></select></label>
          <label class="grow"><span>Named</span><input bind:value={addName} maxlength="60"></label>
          <button type="button" class="quiet" disabled={!addTo || !addName.trim()} onclick={() => { change({ op: "spendKarma", target: { itemId: addTo, [addKind]: addName } }); addName = ""; }}>Add</button>
        </div>
        <div class="row adders">
          <label class="grow"><span>Learn a skill (1 Karma)</span><select bind:value={learnSkill}><option value="">Core skill…</option>{#each coreSkills.filter(e => !body.actor.items.some(i => i.type === "skill" && i.name === e.name)) as e (e.id)}<option value={e.id}>{e.name}</option>{/each}</select></label>
          <button type="button" class="quiet" disabled={!learnSkill} onclick={learn}>Learn</button>
          <label><span>or your own</span><select bind:value={learnCategory}>{#each CUSTOM_SKILL_CATEGORIES as c}<option value={c}>{SKILL_CATEGORY[c]}</option>{/each}</select></label>
          <label class="grow"><span>Named</span><input bind:value={learnName} maxlength="60"></label>
          <button type="button" class="quiet" disabled={!learnName.trim()} onclick={() => { change({ op: "spendKarma", target: { newCustomSkill: { category: learnCategory, name: learnName } } }); learnName = ""; }}>Learn</button>
        </div>
        <p class="muted">Costs: an attribute, its new rating (double above the racial maximum); a skill, 2 × the new rating (a language 1 ×); a Concentration 1.5 ×, a Specialization 1 ×; a new skill 1. Reaction, Essence and Magic are never raised with Karma. <span class="cite">SR2 p.190–191</span></p>
        <h3>History</h3>
        {#if body.ledger?.length}
          <ol class="ledger" reversed>
            {#each [...body.ledger].reverse() as e (e.id)}
              <li class:muted={e.undoneBy}><span>{e.summary}{e.note ? ` — ${e.note}` : ""}{e.undoneBy ? " (undone)" : ""}</span>
                {#if lastUndoable?.id === e.id}<button type="button" class="quiet" onclick={() => change({ op: "undo", entryId: e.id })}>Undo</button>{/if}</li>
            {/each}
          </ol>
        {:else}
          <p class="muted">No Karma yet.</p>
        {/if}
      </section>
    {/if}

    {#if finished}
      <section id="step-nuyen">
        <h2>Nuyen</h2>
        <p class="muted">{nuyen(sys.nuyen ?? 0)} to spend. Buying: the street price is shown (list × Street Index); enter the price you agreed. Selling: {saleMode === "fence" ? "through a fence — 30% of the list value, 5% more or less per extra Negotiation success, 10–50%" : "what was paid comes back"}. <span class="cite">SR2 p.184, p.188</span></p>
        <form class="row adders" onsubmit={(ev) => { ev.preventDefault(); const n = Number(cashAmount); if (Number.isInteger(n) && n > 0) { change({ op: "nuyen", amount: cashDir === "in" ? n : -n, note: cashNote }); cashNote = ""; cashAmount = 0; } }}>
          <label><span>Money</span><select bind:value={cashDir}><option value="in">Received</option><option value="out">Paid</option></select></label>
          <label><span>Amount (¥)</span><input type="number" min="1" max="10000000" step="1" bind:value={cashAmount}></label>
          <label class="grow"><span>For (optional)</span><input bind:value={cashNote} maxlength="120" placeholder="the run's pay, rent…"></label>
          <button>Record</button>
        </form>
        <h3>Buy</h3>
        <label class="grow"><span>Search weapons, armor, gear, ammunition, cyberware, programs</span><input bind:value={playQ} oninput={searchPlay} maxlength="64"></label>
        <ul class="shop">{#each playShop as e (e.id)}<li><span class="name">{e.name}</span><span class="muted small">{TYPE_NAME[e.type] ?? e.type}{e.cost ? ` · list ${nuyen(e.cost)}` : ""}</span><button type="button" class="quiet" onclick={() => startBuy(e.id)}>Buy…</button></li>{/each}</ul>
        {#if buying}
          <div class="row adders">
            <strong>{buying.rec.name}</strong>
            {#each Object.entries(choiceSpec(buying.rec, { inPlay: true })) as [k, sp] (k)}
              <label><span>{CHOICE_NAME[k] ?? k}</span>
                {#if sp.kind === "oneOf"}<select value={buying.choices[k]} onchange={(ev) => { buying.choices[k] = typeof sp.values[0] === "number" ? Number(ev.currentTarget.value) : ev.currentTarget.value; buying.price = streetFor(buying.rec, buying.choices); }}>{#each sp.values as v}<option value={v}>{v}</option>{/each}</select>
                {:else if sp.kind === "int"}<input type="number" min={sp.lo} max={sp.hi} value={buying.choices[k]} onchange={(ev) => { const n = numberFrom(ev); if (Number.isInteger(n) && n >= sp.lo && n <= sp.hi) { buying.choices[k] = n; buying.price = streetFor(buying.rec, buying.choices); } }}>
                {:else}<input value={buying.choices[k]} maxlength="60" onchange={(ev) => { buying.choices[k] = ev.currentTarget.value; }}>{/if}</label>
            {/each}
            <span class="muted small">street {nuyen(streetFor(buying.rec, buying.choices))}</span>
            <label><span>Price agreed (¥)</span><input type="number" min="0" max="10000000" step="1" bind:value={buying.price}></label>
            <button type="button" onclick={() => { change({ op: "buyItem", catalogId: buying.id, choices: $state.snapshot(buying.choices), price: Number(buying.price) }); buying = null; }}>Buy</button>
            <button type="button" class="quiet" onclick={() => { buying = null; }}>Cancel</button>
          </div>
          {#if buying.rec.type === "cyberware"}<p class="muted small">Cyberware bought now is a spare: installing it is surgery (coming next).</p>{/if}
        {/if}
        <h3>Sell</h3>
        {#if body.actor.items.some(i => PLAY_GEAR.includes(i.type))}
          <ul class="shop">
            {#each body.actor.items.filter(i => PLAY_GEAR.includes(i.type)) as it (it._id)}
              <li><span class="name">{it.name}{it.type === "cyberware" && it.system.installed === false ? " (spare)" : ""}</span>
                {#if saleMode === "fence"}<select aria-label={`${it.name}: agreed percentage`} value={sellPct[it._id] ?? 30} onchange={(ev) => { sellPct = { ...sellPct, [it._id]: Number(ev.currentTarget.value) }; }}>{#each FENCE_STEPS as p}<option value={p}>{p}%</option>{/each}</select>{/if}
                <span class="muted small">{nuyen(quoteFor(it).price ?? 0)}</span>
                <button type="button" class="quiet" onclick={() => change({ op: "sellItem", itemId: it._id, pct: sellPct[it._id] ?? 30, shownMode: saleMode, quoted: quoteFor(it).price })}>Sell</button></li>
            {/each}
          </ul>
        {:else}<p class="muted">Nothing to sell.</p>{/if}
        <p class="muted small">The history (with Undo) is in the Karma step.</p>
      </section>
    {/if}

    <section id="step-concept">
      <h2>Concept</h2>
      <div class="row portrait">
        {#if hasPortrait}<img src={`/api/documents/${server.document.id}/portrait?revision=${server.document.revision}`} alt={`Portrait of ${body.name}`} width="120" height="120">{:else}<div class="nopic muted">No portrait</div>{/if}
        {#if !finished}
          <label class="button quiet" aria-disabled={picBusy}>{picBusy ? "Working…" : hasPortrait ? "Change portrait" : "Upload portrait"}
            <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" disabled={picBusy || sending > 0} onchange={pickPortrait}></label>
          {#if stock.length}<button type="button" class="quiet" aria-expanded={showStock} disabled={picBusy || sending > 0} onclick={() => (showStock = !showStock)}>Choose a premade one</button>{/if}
          {#if hasPortrait}<button type="button" class="quiet" disabled={picBusy || sending > 0} onclick={removePortrait}>Remove</button>{/if}
        {/if}
      </div>
      {#if showStock && !finished}
        <ul class="stock" aria-label="Premade portraits">
          {#each stock as p, i (p.id)}
            <li><button type="button" class="plain pick" class:chosen={body.creation?.portrait?.stock === p.id} aria-pressed={body.creation?.portrait?.stock === p.id} aria-label={`Premade portrait ${i + 1}`} disabled={picBusy || sending > 0} onclick={() => pickStock(p.id)}>
              <img src={`/api/catalog/portraits/${p.id}`} alt="" width="88" height="88" loading="lazy"></button></li>
          {/each}
        </ul>
      {/if}
      <form class="stack wide" onsubmit={(ev) => { ev.preventDefault(); if (nameInput.trim() && nameInput.trim() !== body.name) change({ op: "setName", name: nameInput }); }}>
        <div class="row">
          <label class="grow"><span>Street name</span><input bind:value={nameInput} maxlength="120" required></label>
          <button disabled={!nameInput.trim() || nameInput.trim() === body.name}>Rename</button>
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
      {#if sys.race !== "human"}
        <fieldset class="stack"><legend>Allergy (optional)</legend>
          <p class="muted">A metahuman may take an allergy for extra points: one bonus for how common it is, one for its severity. <span class="cite">SR2 p.46, p.220</span></p>
          <div class="row">
            <label class="grow"><span>Substance</span><input value={allergy.substance} maxlength="60" disabled={finished} onchange={(ev) => setAllergy("substance", ev.currentTarget.value)}></label>
            <label><span>How common</span><select value={allergy.rarity} disabled={finished} onchange={(ev) => setAllergy("rarity", ev.currentTarget.value)}><option value="">—</option>{#each ALLERGY_FIELDS.rarity as v}<option value={v}>{v}</option>{/each}</select></label>
            <label><span>Bonus</span><select value={allergy.rarityBonus} disabled={finished} onchange={(ev) => setAllergy("rarityBonus", ev.currentTarget.value)}><option value="">—</option>{#each ALLERGY_FIELDS.bonus as v}<option value={v}>{v}</option>{/each}</select></label>
            <label><span>Severity</span><select value={allergy.severity} disabled={finished} onchange={(ev) => setAllergy("severity", ev.currentTarget.value)}><option value="">—</option>{#each ALLERGY_FIELDS.severity as v}<option value={v}>{v}</option>{/each}</select></label>
            <label><span>Bonus</span><select value={allergy.severityBonus} disabled={finished} onchange={(ev) => setAllergy("severityBonus", ev.currentTarget.value)}><option value="">—</option>{#each ALLERGY_FIELDS.bonus as v}<option value={v}>{v}</option>{/each}</select></label>
          </div>
          {#if !finished && Object.values(allergy).some(Boolean)}<button type="button" class="quiet" onclick={() => change({ op: "setAllergy", substance: "", rarity: "", severity: "", rarityBonus: "", severityBonus: "" })}>No allergy</button>{/if}
        </fieldset>
      {/if}
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
      <p class="muted">Spend your nuyen on gear at list price; magicians (adepts too) spend Force Points on bonding foci, and full magicians on spells (Force up to 6); a physical adept uses only a weapon focus, and buys its powers here with power points (its Magic Rating). No starting gear above Rating 6. Cybereyes take up to .5 Essence of accessories for free. <span class="cite">SR2 p.46, p.124–126, p.137, p.247</span></p>
      {#if !finished}
        <div class="row adders">
          <label class="grow"><span>Search the core book</span><input bind:value={shopQ} oninput={searchShop} maxlength="64" placeholder="Ares Predator, armor jacket, wired reflexes…"></label>
          <label><span>Type</span><select bind:value={shopType} onchange={searchShop}><option value="">Everything</option>{#each SHOP_TYPES as t}<option value={t}>{TYPE_NAME[t]}</option>{/each}</select></label>
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
                  {#if x.r.type === "contact" && x.r.snapshot.contactType === "gang"}<span class="muted small">{x.r.snapshot.members} members (2D6, rolled once)</span>{/if}
                  {#if x.r.type === "contact" && x.r.snapshot.contactType === "follower"}
                    {#each [0, 1, 2, 3, 4] as n}
                      <label class="choice"><span>Archetype {n + 1}</span><input list="archetypes" value={x.r.choices.archetypes?.[n] ?? ""} maxlength="60" disabled={finished}
                        onchange={(ev) => { const a = [0, 1, 2, 3, 4].map(i => x.r.choices.archetypes?.[i] ?? ""); a[n] = ev.currentTarget.value; change({ op: "setExtra", itemId: x.id, archetypes: a }); }}></label>
                    {/each}
                  {/if}
                  {#each Object.entries(x.spec) as [k, sp] (k)}
                    <label class="choice"><span>{CHOICE_NAME[k] ?? k}</span>
                      {#if sp.kind === "int"}
                        <input type="number" min={sp.lo} max={sp.hi} step="1" value={x.r.choices[k]} disabled={finished}
                          onchange={(ev) => { const n = numberFrom(ev); if (Number.isInteger(n) && n >= sp.lo && n <= sp.hi) setChoice(x.id, k, n); else ev.currentTarget.value = x.r.choices[k]; }}>
                      {:else if sp.kind === "oneOf"}
                        <select value={x.r.choices[k]} disabled={finished} onchange={(ev) => setChoice(x.id, k, typeof sp.values[0] === "number" ? Number(ev.currentTarget.value) : ev.currentTarget.value)}>{#each sp.values as v}<option value={v}>{v}</option>{/each}</select>
                      {:else if k === "in"}
                        <select value={x.r.choices.in} disabled={finished} onchange={(ev) => setChoice(x.id, "in", ev.currentTarget.value)}><option value="">On its own</option>{#each eyes as e (e.id)}<option value={e.id}>{e.r.name}</option>{/each}</select>
                      {:else if k === "spell"}
                        <select value={x.r.choices.spell} disabled={finished} onchange={(ev) => setChoice(x.id, "spell", ev.currentTarget.value)}><option value="">Choose…</option>{#each spells as sp2 (sp2.id)}<option value={sp2.id}>{sp2.r.name}</option>{/each}</select>
                      {:else if k === "skill" && x.r.type === "adept_power"}
                        <select value={x.r.choices.skill} disabled={finished} onchange={(ev) => setChoice(x.id, "skill", ev.currentTarget.value)}><option value="">Choose…</option>{#each ownSkills as sk (sk.id)}<option value={sk.id}>{sk.name}</option>{/each}</select>
                      {:else if k === "weapon"}
                        <select value={x.r.choices.weapon} disabled={finished} onchange={(ev) => setChoice(x.id, "weapon", ev.currentTarget.value)}><option value="">Choose…</option>{#each melee as w (w.id)}<option value={w.id}>{w.r.name} (Reach {w.r.snapshot.reach ?? 0}, {smallWeapon(w.r.snapshot) ? "small" : "large"})</option>{/each}</select>
                      {:else}
                        <input value={x.r.choices[k]} maxlength="60" disabled={finished} onchange={(ev) => setChoice(x.id, k, ev.currentTarget.value)}>
                      {/if}
                    </label>
                  {/each}
                </td>
                <td class="price">{x.r.type === "contact" ? contactPrice(x) : x.r.type === "adept_power" ? `${check.budgets?.powerPoints?.costs[x.id] ?? "—"} PP` : x.r.type === "spell" ? `${x.r.choices.force} FP` : nuyen(x.price)}{#if x.r.choices.in}<br><span class="muted small">in the eyes' price</span>{/if}</td>
                <td><button type="button" class="quiet" disabled={finished} aria-label={`Remove ${x.r.name}`} onclick={() => change({ op: "removeItem", itemId: x.id })}>✕</button></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      {:else}
        <p class="muted">Nothing bought yet.</p>
      {/if}
      {#if vehicles.length}
        <h3>Vehicles</h3>
        <div class="scroll"><table class="grid bought">
          <thead><tr><th scope="col">Vehicle</th><th scope="col">Handling · Speed · Body · Armor</th><th scope="col">Price</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {#each vehicles as x (x.id)}
              <tr><th scope="row">{x.v.name}</th><td>{x.v.system.handling} · {x.v.system.speed} · {x.v.system.body} · {x.v.system.armor}</td><td class="price">{nuyen(x.v.system.cost)}</td>
                <td><button type="button" class="quiet" disabled={finished} aria-label={`Remove ${x.v.name}`} onclick={() => change({ op: "removeVehicle", vehicleId: x.id })}>✕</button></td></tr>
            {/each}
          </tbody>
        </table></div>
      {/if}
      <datalist id="archetypes">{#each ARCHETYPES as a}<option value={a}></option>{/each}</datalist>
      {#if !finished}
        <h3>Contacts, extras and lifestyle</h3>
        <p class="muted">Search the Contact type above for contacts (two are free, then 5,000¥; one may be your buddy, 10,000¥) and the Lifestyle type for where you live (months paid ahead; none bought means the street). A gang or tribe (50,000¥, 2D6 members rolled once) and followers (200,000¥, five different archetypes) are added here. <span class="cite">SR2 p.43–44, p.46</span></p>
        <form class="row adders" onsubmit={(ev) => ev.preventDefault()}>
          <label class="grow"><span>Gang or followers' name</span><input bind:value={extraName} maxlength="60"></label>
          <button type="button" class="quiet" disabled={!extraName.trim()} onclick={() => { send({ op: "addExtra", kind: "gang", name: extraName }); extraName = ""; }}>Add a gang or tribe</button>
          <button type="button" class="quiet" disabled={!extraName.trim()} onclick={() => { change({ op: "addExtra", kind: "follower", name: extraName }); extraName = ""; }}>Add followers</button>
        </form>
      {/if}
    </section>

    <section id="step-finish">
      <h2>Finish</h2>
      {#if finished}
        <p>Finished. {nuyen(body.creation.finished.leftover)} unspent became {nuyen(Math.floor(body.creation.finished.leftover / 10))}, plus 3D6 = {body.creation.finished.roll} × 1,000¥: <strong>{nuyen(body.creation.finished.nuyen)}</strong> to start with. Karma Pool {body.creation.finished.karmaPool}. Name and notes can still change. <span class="cite">SR2 p.47</span></p>
      {:else if !check.finishable}
        <p class="muted">Finishing needs a clean rules check: no error and no to-do left.</p>
      {:else if !confirmFinish}
        <p class="muted">{nuyen(Math.max(0, check.budgets.resources.remaining))} unspent becomes {nuyen(Math.floor(Math.max(0, check.budgets.resources.remaining) / 10))} (10:1), plus 3D6 × 1,000¥ rolled by the server. Creation then closes. <span class="cite">SR2 p.47</span></p>
        <button type="button" onclick={() => { confirmFinish = true; }}>Finish this character</button>
      {:else}
        <p role="alert">Finish now? Nothing about creation can change afterwards.</p>
        <div class="row"><button type="button" onclick={() => { confirmFinish = false; send({ op: "finish" }); }}>Yes, finish and roll</button><button type="button" class="quiet" onclick={() => { confirmFinish = false; }}>Not yet</button></div>
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
      {#if finished}
        <div><dt>Good Karma</dt><dd>{sys.karma?.current ?? 0}</dd></div>
        <div><dt>Total Karma</dt><dd>{sys.karma?.total ?? 0}</dd></div>
        <div><dt>Karma Pool</dt><dd>{derived.karmaPoolAvailable} / {derived.karmaPool}</dd></div>
        {#if sys.magic.type === "physical_adept"}<div><dt>Power points</dt><dd class:bad={check.budgets?.powerPoints?.over}>{check.budgets?.powerPoints?.spent ?? 0} / {check.budgets?.powerPoints?.total ?? 0}</dd></div>{/if}
        <div><dt>Nuyen</dt><dd>{nuyen(sys.nuyen ?? 0)}</dd></div>
      {:else}
      <div><dt>Attribute points</dt><dd class:bad={pr.attributes && check.budgets.attributes.over}>{check.budgets.attributes.spent} / {pr.attributes ? check.budgets.attributes.total : "—"}</dd></div>
      <div><dt>Skill points</dt><dd class:bad={pr.skills && check.budgets.skills.over}>{check.budgets.skills.spent} / {pr.skills ? check.budgets.skills.total : "—"}</dd></div>
      {#if sys.magic.type === "physical_adept"}<div><dt>Power points</dt><dd class:bad={check.budgets.powerPoints?.over}>{check.budgets.powerPoints?.spent ?? 0} / {check.budgets.powerPoints?.total ?? 0}</dd></div>{/if}
      {#if sys.magic.type !== "none" || check.budgets.forcePoints.spent}<div><dt>Force Points</dt><dd class:bad={check.budgets.forcePoints.over}>{check.budgets.forcePoints.spent} / {check.budgets.forcePoints.total}</dd></div>{/if}
      <div><dt>Nuyen</dt><dd class:bad={pr.resources && check.budgets.resources.over}>{nuyen(check.budgets.resources.spent)} / {pr.resources ? nuyen(check.budgets.resources.total) : "—"}</dd></div>
      {/if}
      <div><dt>Essence</dt><dd class:bad={check.essence < 0}>{check.essence}</dd></div>
      {#if sys.magic.type !== "none"}<div><dt>Magic</dt><dd class:bad={check.magic < 1}>{check.magic}</dd></div>{/if}
    </dl>
    {#if finished}
      <p class="good">Finished: {nuyen(body.creation.finished.nuyen)} to start with. <span class="cite">SR2 p.47</span></p>
    {:else if check.problems.length === 0}
      <p class="good">No problems: ready to finish (the Finish step).</p>
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
  .portrait { margin: 0 0 1rem; align-items: center; }
  .portrait img, .nopic { width: 120px; height: 120px; object-fit: cover; border: 1px solid var(--line); }
  .nopic { display: grid; place-items: center; font-size: .85rem; }
  ul.stock { list-style: none; margin: 0 0 1rem; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: .6rem; }
  .pick { display: grid; gap: .25rem; justify-items: center; text-decoration: none; font-weight: 400; color: var(--ink); }
  .pick img { width: 88px; height: 88px; object-fit: cover; border: 2px solid var(--line); }
  .pick.chosen img { border-color: var(--accent); }
  .pick.chosen img { outline: 2px solid var(--accent); outline-offset: 2px; }
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
