<script>
  /**
   * Character creation (docs/PLAN-M2.md §6). Every change is ONE operation: applied here at once with the shared
   * reducer (a fast screen), then sent to the server, whose answer replaces the local copy. Changes go out one at a
   * time, in order, each on top of the revision the previous answer gave.
   */
  import { untrack, onDestroy } from "svelte";
  import { get, mutate, upload } from "../lib/api.js";
  import { derive, injuryPenalty } from "../../../shared/derive.mjs";
  import { applyOp, validate, karmaOptions, undoable, surgeryPreview, booksOf, priorityTable, freeContacts, withRacial, formMod, edgeMax, PLAY_GEAR, cardIds, cardEligible, CARD_TYPES, CATEGORIES, CATEGORY_NAMES, LETTERS, METATYPES, MAGIC_TYPES, MAGIC_NAMES, TRADITIONS, ATTRIBUTES, ATTR_NAMES, CUSTOM_SKILL_CATEGORIES, totemNames } from "../../../shared/creation.mjs";
  import { TABLES, racialProfile, metavariantNotes, metavariantFrom, ONI_SOURCE, qualityEffects, BP_NUYEN_TIERS } from "../../../shared/rules.mjs";
  import { BUYABLE, choiceSpec, defaultChoices, project, price, essenceOf, isCybereye, smallWeapon, limbTypeOf, pricedItems, bodyCostOf } from "../../../shared/purchase.mjs";
  import { saleQuoteOf, streetPrice, ratedStreetIndex, FENCE_STEPS, woundLevel } from "../../../shared/rules.mjs";
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
  const STEPS = [["concept", "Concept"], ["priorities", "Priorities"], ["metatype", "Metatype"], ["magic", "Magic"], ["attributes", "Attributes"], ["skills", "Skills"], ["resources", "Resources"], ["finish", "Finish"], ["card", "Print"]];
  // Problems whose step has no tab of its own open the tab that holds them.
  const TAB_OF = { contacts: "resources" };
  // The core book's archetypes (p.50–65): suggestions for followers, never a limit (docs/PLAN-M2d.md Draft 3).
  const ARCHETYPES = ["Bodyguard", "Combat Mage", "Decker", "Detective", "Dwarf Mercenary", "Elven Decker", "Former Company Man", "Former Wage Mage",
    "Gang Member", "Mercenary", "Rigger", "Shaman", "Street Mage", "Street Samurai", "Street Shaman", "Tribesman"];
  const SKILL_CATEGORY = { active: "Active", knowledge: "Knowledge", language: "Language", build_repair: "Build/Repair", special: "Special" };
  /** The full catalog entries this page fetched (the reducer copies an entry's data into the character). */
  const entries = new Map();
  const lookup = (id) => entries.get(id) ?? null;
  // The catalog's sourcebooks (docs/PLAN-M5a.md): the reducer checks a character's list against them.
  let catalogBookList = $state([]), bookOffers = $state({});
  const catalogBooks = $derived(catalogBookList.map(x => x.key));
  get("/api/catalog").then(m => { catalogBookList = m.books ?? []; bookOffers = m.offers ?? {}; }).catch(() => { /* no list: the books can't be changed, the rest works */ });
  const bookAbbr = (k) => catalogBookList.find(x => x.key === k)?.abbr ?? k;
  const sourcebooks = $derived(catalogBookList.filter(x => x.key !== "sr2"));
  // Metavariants (docs/PLAN-M5b.md): the Companion's race entries, fetched whole (the reducer copies their data).
  const profile = $derived(racialProfile(sys, TABLES));
  let variants = $state([]), species = $state([]);
  $effect(() => {
    if (!booksOf(body).includes("sc") || variants.length) return;
    get("/api/catalog/entries?type=race&book=sc&limit=100").then(async (r) => {
      const full = await Promise.all(r.entries.filter(e => e.book === "sc").map(e => get(`/api/catalog/entries/${encodeURIComponent(e.id)}`)));
      for (const e of full) entries.set(e.id, e);
      if (!gone) { variants = full.filter(e => ["dwarf", "elf", "ork", "troll"].includes(e.system.raceKey)); species = full.filter(e => e.system.raceKey === "shapeshifter"); }
    }).catch(() => { /* no variants listed; the core metatypes still work */ });
  });
  const variantMods = (e) => Object.entries(e.system.attributeMods ?? {}).filter(([a, v]) => v !== (racialProfile({ race: e.system.raceKey }, TABLES).mods[a] ?? 0))
    .map(([a, v]) => `${ATTR_NAMES[a]} ${v > 0 ? "+" : ""}${v}`).join(", ");
  const setBooksTo = (list) => { change({ op: "setBooks", books: list }); searchShop(); searchPlay(); };   // the shops list what the books offer
  let coreSkills = $state([]), pickSkill = $state(""), customCategory = $state("knowledge"), customName = $state("");
  get("/api/catalog/entries?type=skill&book=sr2&limit=100").then(r => { coreSkills = r.entries; }).catch(() => { /* the add list stays empty; the page still works */ });
  const skills = $derived(body.actor.items.filter(i => i.type === "skill"));
  const choicesOf = (item) => body.creation.items[item._id]?.choices ?? {};
  function skillChange(item, patch) {
    const c = choicesOf(item);
    change({ op: "setSkill", itemId: item._id, allocated: c.allocated, concentration: c.concentration, specialization: c.specialization, freeLanguage: c.freeLanguage, ...patch });
  }
  // Resources (docs/PLAN-M2c.md).
  const TYPE_NAME = { bioware: "Bioware", weapon: "Weapon", armor: "Armor", gear: "Gear", ammo: "Ammunition", cyberware: "Cyberware", spell: "Spell", focus: "Focus", adept_power: "Adept power", program: "Program", contact: "Contact", lifestyle: "Lifestyle", vehicle: "Vehicle" };
  const SHOP_TYPES = [...BUYABLE, "vehicle"];   // a vehicle is an actor: addVehicle, not addItem (S9)
  const CHOICE_NAME = { grade: "Grade", points: "Value", gain: "Bonus +", attribute: "Attribute", detail: "Detail (skill, substance…)", quantity: "Qty", bundles: "Boxes", rating: "Rating", force: "Force", strengthMinimum: "Str Min", in: "In", spell: "Spell", skill: "Skill", weapon: "Weapon", side: "Side", limb: "Built into", level: "Level", senses: "Senses (comma-separated)", kind: "As", months: "Months" };
  let shopQ = $state(""), shopType = $state(""), shop = $state([]), shopBusy = $state(false);
  let shopTimer, shopSeq = 0;
  function searchShop() {
    clearTimeout(shopTimer);
    const mine = ++shopSeq;   // only the latest search's answer is shown, even one still waiting to start (r1 #7, r2)
    shopTimer = setTimeout(async () => {
      const p = new URLSearchParams({ limit: "30", offerable: "creation" });
      for (const k of ["sr2", ...booksOf(body)]) p.append("book", k);
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
  const bought = $derived(Object.entries(body.creation.items).filter(([, r]) => r.type !== "skill" && r.type !== "quality").sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, r]) => {
    const item = body.actor.items.find(i => i._id === id), projected = item ? { system: item.system, flags: item.flags } : project(r, r.choices, body.creation.items);
    return { id, r, spec: choiceSpec(r), price: price(r, projected, body.actor.items), essence: item && r.type === "cyberware" ? essenceOf(item, body.actor.items, body.actor.system.race) : null };
  }));
  const eyes = $derived(bought.filter(x => isCybereye(x.r)));
  const cyberlimbs = $derived(bought.filter(x => x.r.type === "cyberware" && !x.r.snapshot.limbOption && limbTypeOf(x.r)));   // PLAN-M5j
  /** A bioware row's Body Cost after its grade (Shadowtech p.7), as the Body Index counts it. */
  const bioCost = (id) => { const it = body.actor.items.find(i => i._id === id); return it ? Math.round(bodyCostOf(it, body.actor.items) * 1000) / 1000 : "—"; };
  /** A choice control's accessible name, distinct per row: the item, its detail or its place in the list, the choice. */
  const ctlName = (x, k) => {
    const same = Object.entries(body.creation.items).filter(([, r]) => r.name === x.r.name).map(([id]) => id).sort();
    const which = (same.length > 1 ? ` ${same.indexOf(x.id) + 1}` : "") + (x.r.choices.detail ? ` (${x.r.choices.detail})` : "");
    return `${x.r.name}${which}: ${CHOICE_NAME[k] ?? k}`;
  };
  // Edges and Flaws (Companion p.22–35; PLAN-M5d): their own list on the Concept tab, with the same choice controls.
  const qualitiesBought = $derived(Object.entries(body.creation.items).filter(([, r]) => r.type === "quality").sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, r]) => ({ id, r, spec: choiceSpec(r), item: body.actor.items.find(i => i._id === id) })));
  // Under point-based design the GM may price Edges and Flaws in Building Points (Companion p.22–23; PLAN-M5h).
  const asBP = $derived(body?.actor?.system?.chargen?.priorityMethod === "points" && !!body?.actor?.system?.chargen?.qualitiesUseBP);
  const qualityTotals = $derived(qualitiesBought.reduce((t, x) => { const v = Number(x.item?.system.pointValue) || 0; return v > 0 ? { ...t, edges: t.edges + v } : { ...t, flaws: t.flaws + v }; }, { edges: 0, flaws: 0 }));
  // The books with Edges and Flaws: the Companion, Cyberpirates, Rigger 2.
  const QUALITY_BOOKS = ["sc", "cp", "r2"];
  let qualityList = $state([]), qualityPick = $state(""), qualityBooksLoaded = "";
  $effect(() => {
    const qb = booksOf(body).filter(k => QUALITY_BOOKS.includes(k)).sort().join(",");
    if (!qb || qualityBooksLoaded === qb) return;
    qualityBooksLoaded = qb;
    get(`/api/catalog/entries?type=quality&limit=100&offerable=creation${qb.split(",").map(k => `&book=${k}`).join("")}`).then(r => { if (!gone) qualityList = r.entries; }).catch(() => { /* the list stays empty */ });
  });
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
  let rulesSeq = 0;   // only the latest answer counts: an older reply can't restore a stale mode (r2)
  const loadRules = () => { const mine = ++rulesSeq; return get("/api/session").then(s => { if (mine === rulesSeq) saleMode = s.rules?.saleMode ?? "refund"; }).catch(() => { /* keep the last known */ }); };
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
      const p = new URLSearchParams({ limit: "20", offerable: "play" });
      for (const k of ["sr2", ...booksOf(body)]) p.append("book", k);
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
  const quoteFor = (it) => { const priced = pricedItems(body.actor.items); return saleQuoteOf(priced.find(i => i._id === it._id) ?? it, { mode: saleMode, pct: sellPct[it._id] ?? 30, items: priced }); };
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
    try { body = applyOp(body, op, lookup, { saleMode, catalogBooks }); } catch (err) { error = err.message; return; }
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
  const contactPrice = (x) => ({ buddy: "10,000¥", gang: "50,000¥", follower: "200,000¥" })[x.r.choices.kind ?? x.r.snapshot.contactType] ?? (plainContacts.indexOf(x.id) < freeContacts(sys) + qualityEffects(body.actor.items).extraContacts ? "free" : "5,000¥");
  // The steps as tabs (one panel at a time; the Rules check stays beside them). The open tab is remembered per
  // character for this browser tab (sessionStorage): the address's fragment is reserved for one-time link secrets.
  const tabs = $derived(finished ? [["karma", "Karma"], ["nuyen", "Nuyen"], ["condition", "Condition"], ...STEPS] : STEPS);
  // Condition (docs/PLAN-M4c.md): wounds, ammunition and surgery after creation.
  const cm = $derived(sys.conditionMonitor ?? { physical: { value: 0 }, stun: { value: 0 }, overflow: 0 });
  let hurtTrack = $state("physical"), hurtBoxes = $state(1), ammoUse = $state({}), surgery = $state({});
  const surgeryOf = (id) => surgery[id] ?? { successes: 2, fee: true, wound: true };
  const setSurgery = (id, k, v) => { surgery = { ...surgery, [id]: { ...surgeryOf(id), [k]: v } }; };
  const tabKeyName = `chargen.tab.${untrack(() => server.document.id)}`;
  const savedTab = (() => { try { return sessionStorage.getItem(tabKeyName); } catch { return null; } })();
  let tab = $state(savedTab ?? (untrack(() => finished) ? "karma" : "concept"));
  $effect(() => { if (!tabs.some(([id]) => id === tab)) tab = tabs[0][0]; });
  // On a phone the tab row scrolls sideways: keep the open tab in sight.
  $effect(() => { document.getElementById(`tab-${tab}`)?.scrollIntoView({ block: "nearest", inline: "nearest" }); });
  function pick(id, focus = false) {
    tab = id;
    try { sessionStorage.setItem(tabKeyName, id); } catch { /* private mode: the tab just isn't remembered */ }
    if (focus) document.getElementById(`tab-${id}`)?.focus();
  }
  /** WAI-ARIA tabs: arrows move between tabs, Home and End jump to the ends. */
  function tabKey(ev) {
    const ids = tabs.map(([id]) => id), i = ids.indexOf(tab);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[ev.key];
    if (to == null) return;
    ev.preventDefault();
    pick(ids[(to + ids.length) % ids.length], true);
  }
  /** Each tab's open problems (errors and to-dos), so the bar shows where work is left. */
  const tabProblems = $derived(Object.fromEntries(tabs.map(([id]) => {
    const own = check.problems.filter(p => p.severity !== "warning" && (TAB_OF[p.step] ?? p.step) === id);
    return [id, { count: own.length, error: own.some(p => p.severity === "error") }];
  })));
  // Deleting: typed confirmation, inline (a soft delete: the Library's Deleted list keeps it 30 days).
  let deleteOpen = $state(false), deleteTyped = $state("");
  // Its own state, not server.document: an edit's answer racing the toggle would carry the old value back.
  let archivedAt = $state(start.document.archivedAt ?? null), archiving = $state(false);
  async function toggleArchive() {
    archiving = true;
    try { archivedAt = (await mutate("POST", `/api/documents/${server.document.id}/archive`, { archived: !archivedAt })).document.archivedAt; }
    catch (err) { error = err.message; }
    archiving = false;
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
      <div class="tabs" role="tablist" aria-label="Character steps" tabindex="-1" onkeydown={tabKey}>
        {#each tabs as [id, title] (id)}
          <button type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`step-${id}`} tabindex={tab === id ? 0 : -1}
            onclick={() => pick(id)}>{title}{#if tabProblems[id]?.count}<span class="count" class:error={tabProblems[id].error} aria-label={`${tabProblems[id].count} open`}>{tabProblems[id].count}</span>{/if}</button>
        {/each}
      </div>
    </header>
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}

    {#if finished}
      <section id="step-karma" role="tabpanel" aria-labelledby="tab-karma" hidden={tab !== "karma"}>
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
      <section id="step-nuyen" role="tabpanel" aria-labelledby="tab-nuyen" hidden={tab !== "nuyen"}>
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
        <ul class="shop">{#each playShop as e (e.id)}<li><span class="name">{e.name}</span><span class="muted small">{TYPE_NAME[e.type] ?? e.type}{e.cost ? ` · list ${nuyen(e.cost)}` : ""} · {bookAbbr(e.book ?? e.listBook)}{e.citation?.page ? ` p.${e.citation.page}` : ""}</span><button type="button" class="quiet" onclick={() => startBuy(e.id)}>Buy…</button></li>{/each}</ul>
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
          {#if buying.rec.type === "cyberware"}<p class="muted small">Cyberware bought now is a spare: install it with surgery on the Condition step.</p>{/if}
        {/if}
        <h3>Sell</h3>
        {#if body.actor.items.some(i => PLAY_GEAR.includes(i.type) && !(i.type === "cyberware" && i.system.installed !== false))}
          <ul class="shop">
            {#each body.actor.items.filter(i => PLAY_GEAR.includes(i.type) && !(i.type === "cyberware" && i.system.installed !== false)) as it (it._id)}
              <li><span class="name">{it.name}{it.type === "cyberware" && it.system.installed === false ? " (spare)" : ""}</span>
                {#if saleMode === "fence"}<select aria-label={`${it.name}: agreed percentage`} value={sellPct[it._id] ?? 30} onchange={(ev) => { sellPct = { ...sellPct, [it._id]: Number(ev.currentTarget.value) }; }}>{#each FENCE_STEPS as p}<option value={p}>{p}%</option>{/each}</select>{/if}
                <span class="muted small">{nuyen(quoteFor(it).price ?? 0)}</span>
                <button type="button" class="quiet" onclick={() => change({ op: "sellItem", itemId: it._id, pct: sellPct[it._id] ?? 30, shownMode: saleMode, quoted: quoteFor(it).price })}>Sell</button></li>
            {/each}
          </ul>
        {:else}<p class="muted">Nothing to sell.</p>{/if}
        <p class="muted small">The history (with Undo) is in the Karma step. Installed cyberware isn't sold: it comes out by surgery.</p>
      </section>

      <section id="step-condition" role="tabpanel" aria-labelledby="tab-condition" hidden={tab !== "condition"}>
        <h2>Condition</h2>
        <p class="muted">Record the wounds the character carries after a run; the dice stay at the table. <span class="cite">SR2 p.111</span></p>
        <div class="monitors">
          {#each [["physical", "Physical"], ["stun", "Stun"]] as [k, name] (k)}
            <div class="monitor"><span class="label">{name}</span>
              <span class="boxes" role="img" aria-label={`${name}: ${cm[k].value} of 10 boxes filled`}>{#each Array(10) as _, i (i)}<span class="box" class:hurt={i < cm[k].value}></span>{/each}</span>
              <span class="muted small">{woundLevel(cm[k].value)}</span></div>
          {/each}
          <p>Overflow: <strong>{cm.overflow}</strong> of {derived.monitors.overflow} (Body).
            {#if cm.overflow > derived.monitors.overflow}<strong class="bad">Dead: the overflow is past the Body Rating.</strong>
            {:else if cm.overflow > 0}<strong class="bad">Dying: an extra box every 10 minutes without medical help (p.111).</strong>
            {:else if cm.stun.value >= 10 || cm.physical.value >= 10}<strong class="bad">Unconscious.</strong>{/if}</p>
          {#if injuryPenalty(body.actor)}<p>Injury: +{injuryPenalty(body.actor)} to target numbers, −{injuryPenalty(body.actor)} Initiative.</p>{/if}
        </div>
        <form class="row adders" onsubmit={(ev) => ev.preventDefault()}>
          <label><span>Monitor</span><select bind:value={hurtTrack}><option value="physical">Physical</option><option value="stun">Stun</option></select></label>
          <label><span>Boxes</span><input type="number" min="1" max="20" step="1" bind:value={hurtBoxes}></label>
          <button type="button" onclick={() => change({ op: "damage", track: hurtTrack, boxes: Number(hurtBoxes) })}>Take damage</button>
          <button type="button" class="quiet" onclick={() => change({ op: "heal", track: hurtTrack, boxes: Number(hurtBoxes) })}>Heal</button>
        </form>
        <p class="muted small">Stun past 10 boxes rolls into Physical; Physical past 10 into the overflow. Healing takes the overflow first.</p>

        <h3>Ammunition</h3>
        {#if body.actor.items.some(i => i.type === "ammo")}
          <ul class="shop">
            {#each body.actor.items.filter(i => i.type === "ammo") as it (it._id)}
              <li><span class="name">{it.name}</span><span class="muted small">{it.system.quantity ?? 0} left</span>
                <input type="number" min="1" max="1000" step="1" aria-label={`${it.name}: rounds used`} value={ammoUse[it._id] ?? 1} onchange={(ev) => { ammoUse = { ...ammoUse, [it._id]: Number(ev.currentTarget.value) }; }}>
                <button type="button" class="quiet" disabled={!(it.system.quantity > 0)} onclick={() => change({ op: "useAmmo", itemId: it._id, rounds: ammoUse[it._id] ?? 1 })}>Use</button></li>
            {/each}
          </ul>
        {:else}<p class="muted">No ammunition. Buy some on the Nuyen step.</p>{/if}

        <h3>Surgery</h3>
        {#if body.actor.items.some(i => i.type === "cyberware" && i.system.installed === false)}
          <p class="muted small">Enter the surgeon's successes (TN shown, intensive care included): 0 adds 15% to the implant's Essence, 4–5 take 10% off, 6+ take 20% off. <span class="cite">Cybertechnology p.53, SR2 p.114</span></p>
          <ul class="surgery">
            {#each body.actor.items.filter(i => i.type === "cyberware" && i.system.installed === false) as it (it._id)}
              {@const o = surgeryOf(it._id)}
              {@const pv = surgeryPreview(body, it._id, o.successes ?? 2)}
              <li>
                <strong>{it.name}</strong>
                <span class="muted small">{pv.category.label}: Essence {pv.cost}{pv.pct ? ` (${pv.pct > 0 ? "+" : ""}${pv.pct}%)` : ""}, ends at {pv.end}; surgeon's TN {pv.tn}</span>
                <div class="row adders">
                  <label><span>Successes</span><input type="number" min="0" max="30" step="1" value={o.successes ?? ""} aria-invalid={o.successes == null} oninput={(ev) => { const v = ev.currentTarget.value.trim(), n = Number(v); setSurgery(it._id, "successes", /^\d+$/.test(v) && n <= 30 ? n : null); }}></label>
                  <label class="row inline"><input type="checkbox" class="check" checked={o.fee} onchange={(ev) => setSurgery(it._id, "fee", ev.currentTarget.checked)}><span>Pay the fee ({nuyen(pv.category.fee)})</span></label>
                  <label class="row inline"><input type="checkbox" class="check" checked={o.wound} onchange={(ev) => setSurgery(it._id, "wound", ev.currentTarget.checked)}><span>Take the wound ({pv.category.wound}, {pv.category.boxes} {pv.category.boxes === 1 ? "box" : "boxes"})</span></label>
                  <button type="button" disabled={pv.end < 0 || o.successes == null} onclick={() => change({ op: "installWare", itemId: it._id, successes: o.successes, fee: o.fee, wound: o.wound })}>Install</button>
                </div>
                {#if o.successes == null}<p class="bad small">Enter the surgeon's successes: a whole number from 0 to 30.</p>{/if}
                {#if pv.end < 0}<p class="bad small">Not enough Essence: the surgery would be aborted.</p>{/if}
                {#if pv.category.key === "drastic" && sys.magic?.type && sys.magic.type !== "none"}<p class="muted small">Drastic surgery: a magician checks for Magic loss after healing (p.114).</p>{/if}
              </li>
            {/each}
          </ul>
        {:else}<p class="muted">No spare cyberware. Cyberware bought on the Nuyen step arrives as a spare.</p>{/if}
        <p class="muted small">A surgery is in the history (Karma step) and can be undone while the implant and the wounds are as it left them.</p>
      </section>
    {/if}

    {#snippet choiceControls(x)}
                      {#if x.r.type === "contact" && x.r.snapshot.contactType === "gang"}<span class="muted small">{x.r.snapshot.members} members (2D6, rolled once)</span>{/if}
                      {#if x.r.type === "contact" && x.r.snapshot.contactType === "follower"}
                        {#each [0, 1, 2, 3, 4] as n}
                          <label class="choice"><span>Archetype {n + 1}</span><input list="archetypes" value={x.r.choices.archetypes?.[n] ?? ""} maxlength="60" disabled={finished} aria-label={ctlName(x, `Archetype ${n + 1}`)}
                            onchange={(ev) => { const a = [0, 1, 2, 3, 4].map(i => x.r.choices.archetypes?.[i] ?? ""); a[n] = ev.currentTarget.value; change({ op: "setExtra", itemId: x.id, archetypes: a }); }}></label>
                        {/each}
                      {/if}
                      {#each Object.entries(x.spec) as [k, sp] (k)}
                        <label class="choice"><span>{CHOICE_NAME[k] ?? k}</span>
                          {#if k === "side"}
                            <select value={x.r.choices.side} disabled={finished} aria-label={ctlName(x, "side")} onchange={(ev) => setChoice(x.id, "side", ev.currentTarget.value)}><option value="">Choose…</option><option value="left">Left</option><option value="right">Right</option></select>
                          {:else if k === "limb"}
                            <select value={x.r.choices.limb} disabled={finished} aria-label={ctlName(x, "limb")} onchange={(ev) => setChoice(x.id, "limb", ev.currentTarget.value)}><option value="">Choose a cyberlimb…</option>{#each cyberlimbs as l (l.id)}<option value={l.id}>{l.r.name}{l.r.choices.side ? ` (${l.r.choices.side})` : ""}</option>{/each}</select>
                          {:else if sp.kind === "int"}
                            <input type="number" min={sp.lo} max={sp.hi} step="1" value={x.r.choices[k]} disabled={finished} aria-label={ctlName(x, k)}
                              onchange={(ev) => { const n = numberFrom(ev); if (Number.isInteger(n) && n >= sp.lo && n <= sp.hi) setChoice(x.id, k, n); else ev.currentTarget.value = x.r.choices[k]; }}>
                          {:else if sp.kind === "oneOf"}
                            <select value={x.r.choices[k]} disabled={finished} aria-label={ctlName(x, k)} onchange={(ev) => setChoice(x.id, k, typeof sp.values[0] === "number" ? Number(ev.currentTarget.value) : ev.currentTarget.value)}>{#each sp.values as v}<option value={v}>{v}</option>{/each}</select>
                          {:else if k === "in"}
                            <select value={x.r.choices.in} disabled={finished} aria-label={ctlName(x, "in")} onchange={(ev) => setChoice(x.id, "in", ev.currentTarget.value)}><option value="">On its own</option>{#each eyes as e (e.id)}<option value={e.id}>{e.r.name}</option>{/each}</select>
                          {:else if k === "spell"}
                            <select value={x.r.choices.spell} disabled={finished} aria-label={ctlName(x, "spell")} onchange={(ev) => setChoice(x.id, "spell", ev.currentTarget.value)}><option value="">Choose…</option>{#each spells as sp2 (sp2.id)}<option value={sp2.id}>{sp2.r.name}</option>{/each}</select>
                          {:else if k === "skill" && x.r.type === "adept_power"}
                            <select value={x.r.choices.skill} disabled={finished} aria-label={ctlName(x, "skill")} onchange={(ev) => setChoice(x.id, "skill", ev.currentTarget.value)}><option value="">Choose…</option>{#each ownSkills as sk (sk.id)}<option value={sk.id}>{sk.name}</option>{/each}</select>
                          {:else if k === "weapon"}
                            <select value={x.r.choices.weapon} disabled={finished} aria-label={ctlName(x, "weapon")} onchange={(ev) => setChoice(x.id, "weapon", ev.currentTarget.value)}><option value="">Choose…</option>{#each melee as w (w.id)}<option value={w.id}>{w.r.name} (Reach {w.r.snapshot.reach ?? 0}, {smallWeapon(w.r.snapshot) ? "small" : "large"})</option>{/each}</select>
                          {:else}
                            <input value={x.r.choices[k]} maxlength="60" disabled={finished} aria-label={ctlName(x, k)} onchange={(ev) => setChoice(x.id, k, ev.currentTarget.value)}>
                          {/if}
                        </label>
                      {/each}
    {/snippet}

    <section id="step-concept" role="tabpanel" aria-labelledby="tab-concept" hidden={tab !== "concept"}>
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
      {#if sourcebooks.length}
        <fieldset class="books">
          <legend>Sourcebooks</legend>
          <p class="muted small">The books your table uses. The core book is always on. Each book shows how many of its entries the app offers now; the rest come later.</p>
          <label class="row inline"><input type="checkbox" class="check" checked={sourcebooks.every(x => booksOf(body).includes(x.key))} onchange={(ev) => setBooksTo(ev.currentTarget.checked ? sourcebooks.map(x => x.key) : [])}><span><strong>All</strong></span></label>
          <label class="row inline"><input type="checkbox" class="check" checked disabled><span>{catalogBookList.find(x => x.key === "sr2")?.title ?? "Core book"}</span></label>
          {#each sourcebooks as x (x.key)}
            <label class="row inline"><input type="checkbox" class="check" checked={booksOf(body).includes(x.key)} onchange={(ev) => setBooksTo(ev.currentTarget.checked ? [...booksOf(body), x.key] : booksOf(body).filter(k => k !== x.key))}><span>{x.title} <span class="muted small">({x.abbr}{bookOffers[x.key] ? `: ${bookOffers[x.key].offered} offered now, ${bookOffers[x.key].later} later` : ""})</span></span></label>
          {/each}
        </fieldset>
      {/if}
      {#if booksOf(body).some(k => QUALITY_BOOKS.includes(k))}
        <fieldset class="stack quals"><legend>Edges and Flaws</legend>
          <p class="muted small">Optional, the GM's call: {asBP ? "Edges cost Building Points and Flaws add them (the GM's option, Priorities step)." : "take any Edges and Flaws whose values add up to 0."} A Bonus Attribute Point past the racial maximum costs 2. <span class="cite">Companion p.22–35</span></p>
          <p>Edges <strong>+{qualityTotals.edges}</strong>, Flaws <strong>{qualityTotals.flaws}</strong>{#if asBP}: {qualityTotals.edges + qualityTotals.flaws} Building Points.{:else}: {qualityTotals.edges + qualityTotals.flaws === 0 ? "balanced" : `${qualityTotals.edges + qualityTotals.flaws > 0 ? "+" : ""}${qualityTotals.edges + qualityTotals.flaws} to balance`}.{/if}</p>
          {#if !finished}
            <div class="row adders">
              <label class="grow"><span>Add an Edge or Flaw</span>
                <select bind:value={qualityPick}>
                  <option value="">Choose…</option>
                  {#each [["edge", "Edges"], ["flaw", "Flaws"]] as [k, label] (k)}
                    <optgroup {label}>{#each qualityList.filter(e => e.quality?.kind === k) as e (e.id)}<option value={e.id}>{e.name} ({e.quality.value > 0 ? "+" : ""}{e.quality.value}){e.book !== "sc" ? ` · ${bookAbbr(e.book)}` : ""}</option>{/each}</optgroup>
                  {/each}
                </select></label>
              <button type="button" disabled={!qualityPick} onclick={() => { buy(qualityPick); qualityPick = ""; }}>Add</button>
            </div>
          {/if}
          {#if qualitiesBought.length}
            <div class="scroll"><table class="grid bought">
              <thead><tr><th scope="col">Edge or Flaw</th><th scope="col">Choices</th><th scope="col">Value</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
              <tbody>
                {#each qualitiesBought as x (x.id)}
                  <tr><th scope="row">{x.r.name}<br><span class="muted small">{bookAbbr(x.r.snapshot.citation?.book ?? "sc")} p.{x.r.snapshot.citation?.page}</span></th>
                    <td class="choices">{@render choiceControls(x)}</td>
                    <td class="price">{(x.item?.system.pointValue ?? 0) > 0 ? "+" : ""}{x.item?.system.pointValue ?? 0}</td>
                    <td><button type="button" class="quiet" disabled={finished} aria-label={`Remove ${x.r.name}`} onclick={() => change({ op: "removeItem", itemId: x.id })}>✕</button></td></tr>
                {/each}
              </tbody>
            </table></div>
          {/if}
        </fieldset>
      {/if}
      <label class="notes"><span>Notes: who is this, and why do they run the shadows?</span>
        <textarea bind:value={notesInput} maxlength="20000" onchange={() => notesInput !== body.notes && change({ op: "setNotes", notes: notesInput })}></textarea></label>

      <div class="danger-zone">
        <div class="row">
          <button type="button" class="quiet" disabled={archiving} onclick={toggleArchive}>{archivedAt ? "Unarchive" : "Archive"}</button>
          <span class="muted">{archivedAt ? "Archived: hidden from your Library's main list." : "Hide from your Library's main list without deleting."}</span>
        </div>
        {#if !deleteOpen}
          <button type="button" class="danger" onclick={() => { deleteOpen = true; deleteTyped = ""; }}>Delete character…</button>
        {:else}
          <p><strong>Delete {body.name}?</strong> It moves to <em>Deleted</em> in your Library, where you can restore it for 30 days; after that it is gone for good.</p>
          <label class="grow"><span>Type the character's name to confirm</span><input bind:value={deleteTyped} autocomplete="off" spellcheck="false" maxlength="120"></label>
          <div class="row">
            <button type="button" class="danger" disabled={deleteTyped.trim() !== body.name.trim()} onclick={onDeleted}>Delete {body.name}</button>
            <button type="button" class="quiet" onclick={() => { deleteOpen = false; }}>Keep it</button>
          </div>
        {/if}
      </div>
    </section>

    <section id="step-priorities" role="tabpanel" aria-labelledby="tab-priorities" hidden={tab !== "priorities"}>
      <h2>Priorities</h2>
      {#if booksOf(body).includes("sc")}
        <div class="row" role="radiogroup" aria-label="Priority method">
          <label class="row inline"><input type="radio" class="check" name="pmethod" checked={(sys.chargen.priorityMethod ?? "standard") === "standard"} disabled={finished} onchange={() => change({ op: "setMethod", method: "standard" })}><span>Standard (each letter once)</span></label>
          <label class="row inline"><input type="radio" class="check" name="pmethod" checked={sys.chargen.priorityMethod === "sumto10"} disabled={finished} onchange={() => change({ op: "setMethod", method: "sumto10" })}><span>Sum-to-10 <span class="cite">Companion p.20</span></span></label>
          <label class="row inline"><input type="radio" class="check" name="pmethod" checked={sys.chargen.priorityMethod === "points"} disabled={finished} onchange={() => change({ op: "setMethod", method: "points" })}><span>Point-based <span class="cite">Companion p.20–21</span></span></label>
        </div>
      {/if}
      {#if sys.chargen.priorityMethod === "points"}
        {@const ch = sys.chargen}
        {@const bp = check.budgets?.buildingPoints}
        {@const setPts = (patch) => change({ op: "setPoints", buildingPoints: ch.buildingPoints ?? 100, nuyenTier: ch.nuyenTier ?? 500, forcePointTrade: ch.forcePointTrade ?? 0, qualitiesUseBP: !!ch.qualitiesUseBP, ...patch })}
        <p class="muted">Point-based design: spend the GM's Building Points on every part — metahuman 10, magician 20 (with 30 Force Points), physical adept 15, 2 per Attribute Point, 1 per Skill Point, and a nuyen tier. <span class="cite">Companion p.20–21</span></p>
        <div class="row adders">
          <label><span>Building Points</span><input type="number" min="1" max="1000" step="1" value={ch.buildingPoints ?? 100} disabled={finished}
            onchange={(ev) => { const n = numberFrom(ev); if (Number.isInteger(n) && n >= 1 && n <= 1000) setPts({ buildingPoints: n }); else ev.currentTarget.value = ch.buildingPoints ?? 100; }}></label>
          <label><span>Nuyen</span><select value={ch.nuyenTier ?? 500} disabled={finished} onchange={(ev) => setPts({ nuyenTier: Number(ev.currentTarget.value) })}>
            {#each Object.entries(BP_NUYEN_TIERS) as [v, cost] (v)}<option value={Number(v)}>{nuyen(Number(v))} ({cost > 0 ? "+" : ""}{cost} BP)</option>{/each}</select></label>
          {#if sys.magic.type === "full_magician"}
            <label><span>Force Points traded (BP; −15 to sell all 30)</span><input type="number" min="-15" max="500" step="1" value={ch.forcePointTrade ?? 0} disabled={finished}
              onchange={(ev) => { const n = numberFrom(ev); if (Number.isInteger(n) && n >= -15 && n <= 500) setPts({ forcePointTrade: n }); else ev.currentTarget.value = ch.forcePointTrade ?? 0; }}></label>
          {/if}
        </div>
        <label class="row inline"><input type="checkbox" class="check" checked={!!ch.qualitiesUseBP} disabled={finished} onchange={(ev) => setPts({ qualitiesUseBP: ev.currentTarget.checked })}>
          <span>The GM lets Edges cost Building Points and Flaws add them (instead of balancing to 0) <span class="cite">Companion p.22–23</span></span></label>
        {#if bp}
          <p>Building Points <strong class:bad={bp.over}>{bp.spent}</strong> of {bp.total}: race {bp.parts.race}, magic {bp.parts.magic}, attributes {bp.parts.attributes}, skills {bp.parts.skills}, nuyen {bp.parts.resources}{bp.parts.forcePoints ? `, Force Points ${bp.parts.forcePoints}` : ""}{bp.parts.qualities ? `, Edges/Flaws ${bp.parts.qualities}` : ""}.</p>
        {/if}
      {:else if sys.chargen.priorityMethod === "sumto10"}
        {@const sum = CATEGORIES.reduce((t, c) => t + ({ A: 4, B: 3, C: 2, D: 1, E: 0 }[sys.chargen.priorities[c]] ?? 0), 0)}
        <p class="muted">Sum-to-10: A counts 4, B 3, C 2, D 1, E 0. Letters may repeat; the five levels add up to at most 10. Now: <strong class:bad={sum > 10}>{sum}</strong> of 10.</p>
      {:else}
        <p class="muted">Give each of the five categories one letter, A to E. Each letter once: picking a letter another category has swaps the two. <span class="cite">SR2 p.44</span></p>
      {/if}
      {#if sys.chargen.priorityMethod !== "points"}
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
      {#if sys.race === "shapeshifter"}<p class="muted">A shapeshifter uses its own table: Race A buys the shapeshifter; Magic B a magician, C an adept. <span class="cite">Companion p.36</span></p>{/if}
      <dl class="table-rows">
        {#each LETTERS as l}
          {@const row = priorityTable(sys)[l]}
          <div><dt>{l}</dt><dd>{row.race === "shapeshifter" ? "Race: the shapeshifter (nothing else)" : `${row.attributes} attribute pts · ${row.skills} skill pts · ${nuyen(row.resources)}`}</dd></div>
        {/each}
      </dl>
      {/if}
    </section>

    <section id="step-metatype" role="tabpanel" aria-labelledby="tab-metatype" hidden={tab !== "metatype"}>
      <h2>Metatype</h2>
      <div class="row" role="radiogroup" aria-label="Metatype">
        {#each METATYPES as m}
          <label class="row inline"><input type="radio" class="check" name="metatype" checked={sys.race === m} disabled={finished} onchange={() => change({ op: "setMetatype", race: m })}><span>{m[0].toUpperCase() + m.slice(1)}</span></label>
        {/each}
      </div>
      {#if booksOf(body).includes("sc") && species.length}
        <fieldset class="stack"><legend>Shapeshifter (Shadowrun Companion)</legend>
          <p class="muted">An awakened animal that takes human form: Priority A in Race, its own priority table, no free contacts, no cyberware, a Severe allergy and vulnerability to silver; it regenerates. <span class="cite">Companion p.36–38</span></p>
          <div class="row" role="radiogroup" aria-label="Shapeshifter species (instead of a metatype above)">
            {#each species as e (e.id)}
              <label class="row inline"><input type="radio" class="check" name="species" checked={sys.race === "shapeshifter" && sys.shapeshifter?.species === e.system.species} disabled={finished}
                onchange={() => change({ op: "setMetatype", race: "shapeshifter", variant: e.id })}><span>{e.name.replace(/^Shapeshifter \((.*)\)$/, "$1")}</span></label>
            {/each}
          </div>
        </fieldset>
      {/if}
      <p class="muted">A metahuman needs Priority A in Race{opts.moreMetahumans ? " (C or better with More Metahumans)" : ""}. <span class="cite">SR2 p.44</span></p>
      {#if booksOf(body).includes("sc") && sys.race !== "human" && variants.some(e => e.system.raceKey === sys.race)}
        <fieldset class="stack"><legend>Metavariant (Shadowrun Companion)</legend>
          <p class="muted">Variants use the base metatype's priority and maximums, with their own modifiers. Other metahumans treat them as freaks: a Hostile reaction in first social contacts. <span class="cite">Companion p.39</span></p>
          <label class="row inline"><input type="radio" class="check" name="variant" checked={!profile.variant} disabled={finished} onchange={() => change({ op: "setMetatype", race: sys.race })}><span>None (standard {sys.race})</span></label>
          {#each variants.filter(e => e.system.raceKey === sys.race) as e (e.id)}
            <label class="row inline variant"><input type="radio" class="check" name="variant" checked={profile.variant === e.name} disabled={finished} onchange={() => change({ op: "setMetatype", race: sys.race, variant: e.id })}>
              <span>{e.name} <span class="muted small">{variantMods(e) || "standard modifiers"} · Companion p.{e.system.citation?.page}</span>
                {#each metavariantNotes({ race: e.system.raceKey, metavariant: metavariantFrom(e) }, TABLES).slice(1) as n}<span class="muted small note">{n}</span>{/each}</span></label>
          {/each}
        </fieldset>
      {/if}
      {#if booksOf(body).includes("sc") && profile.source === ONI_SOURCE}
        <label class="row inline"><input type="checkbox" class="check" checked={!!opts.oniPriority} disabled={finished}
          onchange={(ev) => change({ op: "setOption", key: "oniPriority", value: ev.currentTarget.checked })}>
          <span>GM allows a magical oni Race B, with Resources A and Magic C (an adept) <span class="cite">Companion p.42</span></span></label>
      {/if}
      {#if !["human", "shapeshifter"].includes(sys.race)}
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

    <section id="step-magic" role="tabpanel" aria-labelledby="tab-magic" hidden={tab !== "magic"}>
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

    <section id="step-attributes" role="tabpanel" aria-labelledby="tab-attributes" hidden={tab !== "attributes"}>
      <h2>Attributes</h2>
      <p class="muted">Buy each attribute from 1; racial modifiers apply after. <span class="cite">SR2 p.45</span></p>
      <div class="scroll"><table class="grid attrs">
        <thead><tr><th scope="col">Attribute</th><th scope="col">Bought</th><th scope="col">{derived.forms ? "Human form ±" : "Racial"}</th><th scope="col">{derived.forms ? "Human form" : "Rating"}</th>{#if derived.forms}<th scope="col">Animal form</th>{/if}<th scope="col">Max</th></tr></thead>
        <tbody>
          {#each ATTRIBUTES as a}
            {@const mod = (profile.mods[a] ?? 0) + formMod(sys, a)}
            {@const max = (profile.maxes[a] ?? 6) + edgeMax(body.actor.items, a)}
            {@const rating = withRacial(sys, a, body.actor.items)}
            <tr>
              <th scope="row">{ATTR_NAMES[a]}</th>
              <td><input type="number" min="1" max="12" step="1" value={sys[a].base} aria-label={`${ATTR_NAMES[a]} bought`} disabled={finished}
                onchange={(ev) => { const n = numberFrom(ev); if (Number.isInteger(n) && n !== sys[a].base) change({ op: "setAttribute", attr: a, base: n }); else ev.currentTarget.value = sys[a].base; }}></td>
              <td>{sign(mod)}</td>
              {#if derived.forms}
                <td class:bad={sys[a].base > 6}>{derived.natural[a]}</td><td>{derived.forms.animal.attributes[a]}</td>
                <td class="muted">6 bought</td>
              {:else}
                <td class:bad={rating > max || rating < 1}>{rating}</td>
                <td class="muted">{max}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table></div>
    </section>


    <section id="step-skills" role="tabpanel" aria-labelledby="tab-skills" hidden={tab !== "skills"}>
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

    <section id="step-resources" role="tabpanel" aria-labelledby="tab-resources" hidden={tab !== "resources"}>
      <h2>Resources</h2>
      <p class="muted">Spend your nuyen on gear at list price; magicians (adepts too) spend Force Points on bonding foci, and full magicians on spells (Force up to 6); a physical adept uses only a weapon focus, and buys its powers here with power points (its Magic Rating). No starting gear above Rating 6. Cybereyes take up to .5 Essence of accessories for free. <span class="cite">SR2 p.46, p.124–126, p.137, p.247</span></p>
      {#if !finished}
        <div class="row adders">
          <label class="grow"><span>Search the core book{booksOf(body).length ? " and your sourcebooks" : ""}</span><input bind:value={shopQ} oninput={searchShop} maxlength="64" placeholder="Ares Predator, armor jacket, wired reflexes…"></label>
          <label><span>Type</span><select bind:value={shopType} onchange={searchShop}><option value="">Everything</option>{#each SHOP_TYPES as t}<option value={t}>{TYPE_NAME[t]}</option>{/each}</select></label>
        </div>
        <ul class="shop" aria-busy={shopBusy}>
          {#each shop as e (e.id)}
            <li><span class="name">{e.name}</span><span class="muted small">{TYPE_NAME[e.type] ?? e.type}{e.cost ? ` · ${nuyen(e.cost)}` : ""} · {bookAbbr(e.book ?? e.listBook)}{e.citation?.page ? ` p.${e.citation.page}` : ""}</span><button type="button" class="quiet" onclick={() => buy(e.id)}>Add</button></li>
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
                <th scope="row">{x.r.name}<br><span class="muted small">{TYPE_NAME[x.r.type]}{x.essence != null ? ` · Essence ${x.essence}` : ""}{x.r.type === "bioware" ? ` · Body Cost ${bioCost(x.id)}` : ""}{x.r.choices.in ? " · in cybereyes" : ""}</span></th>
                <td class="choices">{@render choiceControls(x)}
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

    <section id="step-finish" role="tabpanel" aria-labelledby="tab-finish" hidden={tab !== "finish"}>
      <h2>Finish</h2>
      {#if finished && body.creation.finished.imported}
        <p>Imported from Foundry (system {body.creation.finished.imported.systemVersion}): {nuyen(sys.nuyen ?? 0)}, Good Karma {sys.karma?.current ?? 0}, Total Karma {sys.karma?.total ?? 0}. Its items are kept as Foundry had them; Karma, nuyen and condition work here. <span class="cite">SR2 p.47</span></p>
      {:else if finished}
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

    <section id="step-card" role="tabpanel" aria-labelledby="tab-card" hidden={tab !== "card"}>
      <h2>Print and share</h2>
      <h3>Foundry</h3>
      <p class="muted small">To bring this character into Foundry: create an Actor of type Character, right-click it in the Actors directory, choose <strong>Import Data</strong> and pick the file. Set the portrait yourself. Vehicles bought here are their own actors: import each the same way.</p>
      <div class="row">
        <a class="button quiet" href={`/api/documents/${server.document.id}/foundry`} download>Download for Foundry</a>
        {#each Object.keys(body.creation.vehicles ?? {}).sort() as k (k)}
          <a class="button quiet" href={`/api/documents/${server.document.id}/foundry/vehicles/${k}`} download>{body.creation.vehicles[k].source?.name ?? "Vehicle"} for Foundry</a>
        {/each}
      </div>
      {#if body.creation.finished?.imported && (sys.chargen?.vehicles ?? []).length}<p class="muted small">Its vehicles stayed in Foundry: they aren't part of this file.</p>{/if}
      <h3>Paper</h3>
      <div class="print-options row">
        <label><span>Style</span><select bind:value={sheetStyle}><option value="classic">Classic</option><option value="fohawk">Fohawk</option><option value="fohawk-ink">Fohawk (ink-saver)</option></select></label>
        <label><span>Paper</span><select bind:value={paper}><option value="letter">US Letter</option><option value="a4">A4</option></select></label>
        <label><span>Font</span><select bind:value={sheetFont}><option value="">My account's font</option><option value="standard">Standard</option><option value="readable">Readable</option></select></label>
      </div>
      <h3>Full sheet</h3>
      <p class="row"><a class="button" href={sheetHref} target="_blank" rel="noopener">Print sheet</a>
        <a class="button quiet" href={`/api/documents/${server.document.id}/statblock.md`} download>Stat block (Markdown)</a></p>
      <h3>Table card</h3>
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
      {#if check.budgets.buildingPoints}
      <div><dt>Building Points</dt><dd class:bad={check.budgets.buildingPoints.over}>{check.budgets.buildingPoints.spent} / {check.budgets.buildingPoints.total}</dd></div>
      <div><dt>Attribute points</dt><dd>{check.budgets.attributes.spent}</dd></div>
      <div><dt>Skill points</dt><dd>{check.budgets.skills.spent}</dd></div>
      {:else}
      <div><dt>Attribute points</dt><dd class:bad={pr.attributes && check.budgets.attributes.over}>{check.budgets.attributes.spent} / {pr.attributes ? check.budgets.attributes.total : "—"}</dd></div>
      <div><dt>Skill points</dt><dd class:bad={pr.skills && check.budgets.skills.over}>{check.budgets.skills.spent} / {pr.skills ? check.budgets.skills.total : "—"}</dd></div>
      {/if}
      {#if sys.magic.type === "physical_adept"}<div><dt>Power points</dt><dd class:bad={check.budgets.powerPoints?.over}>{check.budgets.powerPoints?.spent ?? 0} / {check.budgets.powerPoints?.total ?? 0}</dd></div>{/if}
      {#if sys.magic.type !== "none" || check.budgets.forcePoints.spent}<div><dt>Force Points</dt><dd class:bad={check.budgets.forcePoints.over}>{check.budgets.forcePoints.spent} / {check.budgets.forcePoints.total}</dd></div>{/if}
      <div><dt>Nuyen</dt><dd class:bad={(pr.resources || check.budgets.buildingPoints) && check.budgets.resources.over}>{nuyen(check.budgets.resources.spent)} / {pr.resources || check.budgets.buildingPoints ? nuyen(check.budgets.resources.total) : "—"}</dd></div>
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
          <li class={p.severity}><button type="button" class="plain" onclick={() => pick(TAB_OF[p.step] ?? p.step, true)} aria-label={`${p.severity === "error" ? "Rule" : p.severity === "todo" ? "To do" : "Note"}: open the ${p.step} step`}>{p.severity === "error" ? "Rule" : p.severity === "todo" ? "To do" : "Note"}</button> {p.text} <span class="cite">{p.cite.book === "sr2" ? "SR2" : bookAbbr(p.cite.book)} p.{p.cite.page}</span></li>
        {/each}
      </ul>
    {/if}
  </aside>
</div>

<style>
  .sheet { display: grid; gap: 1.5rem; grid-template-columns: minmax(0, 1fr); }
  @media (min-width: 60rem) { .sheet { grid-template-columns: minmax(0, 1fr) 19rem; align-items: start; } .panel { position: sticky; top: 1rem; } }
  section { scroll-margin-top: 1rem; }
  section[hidden] { display: none; }
  /* The step tabs: they wrap onto a second row rather than hide (every step stays in sight); on a phone, one row that
     scrolls sideways. The open tab is the one with the accent frame. */
  .tabs { display: flex; flex-wrap: wrap; gap: .4rem; margin: 1rem 0 0; padding-bottom: .9rem; border-bottom: 1px solid var(--line); }
  @media (max-width: 40rem) { .tabs { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: thin; } }
  .tabs [role="tab"] { flex: none; display: inline-flex; align-items: center; gap: .4rem; background: transparent; color: var(--muted);
    border: 1px solid var(--line); border-radius: var(--radius); padding: .4rem .7rem; font-weight: 700; }
  .tabs [role="tab"]:hover { color: var(--ink); background: var(--surface); }
  .tabs [role="tab"][aria-selected="true"] { color: var(--ink); background: var(--surface); border-color: var(--accent); }
  /* The tab already names the panel: its first heading stays for screen readers only. */
  [role="tabpanel"] > h2:first-child { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .tabs .count { min-width: 1.35rem; padding: 0 .3rem; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); font-size: .8rem; line-height: 1.25rem; text-align: center; }
  .tabs .count.error { border-color: var(--danger); color: var(--danger); }
  [role="tabpanel"] { padding-top: 1.1rem; }
  .print-options { gap: .75rem; align-items: end; margin-bottom: .25rem; }
  .print-options label { display: grid; gap: .25rem; }
  .monitors { display: grid; gap: .5rem; margin-block: 1rem; }
  .monitor { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
  .monitor .label { min-width: 5rem; font-weight: 700; }
  .boxes { display: inline-flex; gap: 3px; }
  .box { width: 1.1rem; height: 1.1rem; border: 1px solid var(--line); }
  .box.hurt { background: var(--danger); border-color: var(--danger); }
  .surgery { list-style: none; padding: 0; display: grid; gap: 1rem; }
  .surgery li { display: grid; gap: .25rem; }
  .variant { flex-wrap: nowrap; align-items: flex-start; }
  .variant > span { flex: 1 1 auto; min-width: 0; }
  .variant .note { display: block; }
  .books { border: 1px solid var(--line); padding: .75rem 1rem; margin-block: 1rem; display: grid; gap: .35rem; max-width: 40rem; }
  .books legend { font-weight: 700; padding-inline: .25rem; }
  .danger-zone { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--line); display: grid; gap: .75rem; max-width: 36rem; }
  .danger-zone p { margin: 0; }
  .panel { border: 1px solid var(--line); background: var(--surface); padding: .9rem 1rem; }
  .panel h2 { margin-top: 0; }
  .problems { list-style: none; margin: .8rem 0 0; padding: 0; display: grid; gap: .55rem; font-size: .95rem; }
  .problems button.plain { margin-right: .25rem; }
  .problems li.error button.plain { color: var(--danger); }
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
  label.inline { display: flex; flex-wrap: nowrap; align-items: flex-start; gap: .5rem; margin: 0 0 1rem; }   /* a long label wraps beside its box, not under it */
  label.inline > input { flex: none; }
  label.notes { margin-top: 1rem; }
  .table-rows { margin-bottom: .5rem; font-size: .9rem; }
  .later { margin-top: 2.5rem; }
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
</style>
