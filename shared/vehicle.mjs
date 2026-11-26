/**
 * The Garage (docs/PLAN-garage.md): a vehicle as its own library document. Pure and shared by the server (the
 * authority) and the client (the preview), like the character reducer in creation.mjs.
 *
 * Body: `{ schema, schemaVersion, name, notes, catalogId, nextItem, actor, design }`. `actor` is the Foundry vehicle actor
 * source from the catalog, the ONE authority: its `items` hold the mounted weapons (`flags.sr2e.mount`) and the cargo
 * (`flags.sr2e.cargo`), each with its own id from `nextItem`. Rules: core book p.251–253 (sr2e module/rules/vehicle-mounts.mjs).
 */
import { Refusal } from "./creation.mjs";
import { mountKindFor, mountPointsOf, mountedWeaponCost, LAUNCHER_MUNITIONS, designVehicle, blankDesign, workshopUpdate, chassisArt,
  engineMods, choiceFor, modBuildContext, designModProblems, checkChoices,
  mountProblems, mountedWeaponLoad, removalProblem, mountOf, weaponClassOf, fitProblem, kitFor, CONVERSION_KITS } from "./rules.mjs";

/** Version 2 (docs/PLAN-workshop.md 2): `design` = null (a catalog vehicle) or `{ choices }` (designed from scratch). */
export const VEHICLE_SCHEMA = "sr2e-chargen-vehicle", VEHICLE_SCHEMA_VERSION = 2;
export const MAX_VEHICLE_ITEMS = 30;
const CORE = "sr2";

/** The operations a vehicle document takes (field types as the character's OPS, for the route schema). */
export const VEHICLE_OPS = {
  setName: { name: "string" },
  setNotes: { notes: "string" },
  mountWeapon: { catalogId: "string", kind: "string" },
  unmountWeapon: { itemId: "string" },
  addGear: { catalogId: "string", quantity: "integer" },
  removeGear: { itemId: "string" },
  // A designed vehicle (Rigger 2 p.108–146; docs/PLAN-workshop.md 2.3): the whole working design, and its design mods.
  setDesign: { design: "design" },
  addDesignMod: { catalogId: "string", rating: "integer" },
  setDesignMod: { itemId: "string", rating: "integer" },
  removeDesignMod: { itemId: "string" },
  // A weapon on one of the design's Rigger 2 mounts (R2 p.131–135; docs/PLAN-workshop-mounts.md); `unmountWeapon` removes it.
  mountDesignWeapon: { catalogId: "string", mountId: "string" }
};
const DESIGN_OPS = new Set(["setDesign", "addDesignMod", "setDesignMod", "removeDesignMod", "mountDesignWeapon"]);
const MAX_MOD_RATING = 20;   // shortcut: a mod with no printed maximum takes any rating in Foundry; 20 only bounds the input

function cleanName(name) {
  const n = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!n || n.length > 120) throw new Refusal("A vehicle's name is 1 to 120 characters.");
  return n;
}
/** A catalog id is `package.pack.documentId`; the system's mount tables key on the document id (core pack only). */
export const docIdOf = (catalogId) => (String(catalogId ?? "").startsWith("sr2e.") ? String(catalogId).split(".").pop() : "");
const itemKey = (n) => `gv${String(n).padStart(14, "0")}`;   // 16 characters, as Foundry's ids; fixed width keeps order

/** A new vehicle from a catalog vehicle entry (core book only, as at creation; sourcebooks come with a book toggle). */
export function newVehicle(entry, name) {
  if (!entry || entry.type !== "vehicle") throw new Refusal("That isn't a vehicle in the catalog.");
  if (entry.book !== CORE) throw new Refusal("Only the core book's vehicles for now.", 264);
  if (!entry.actorSource) throw new Refusal("This vehicle's full data isn't available on this server.");
  const actor = structuredClone(entry.actorSource);
  const n = cleanName(name || entry.name);
  actor.name = n;
  actor.items = Array.isArray(actor.items) ? actor.items : [];
  return { schema: VEHICLE_SCHEMA, schemaVersion: VEHICLE_SCHEMA_VERSION, name: n, notes: "", catalogId: entry.id, nextItem: 1, actor, design: null };
}

/* ── Designed vehicles (docs/PLAN-workshop.md) ──────────────────────────────────────────────────────────────── */

const noTables = () => new Refusal("This server has no Rigger 2 design tables, so vehicles can't be designed here.", 108);
const hasTables = (t) => !!t && Object.keys(t.chassis ?? {}).length > 0;
const designModsOf = (b) => b.actor.items.filter(i => i.flags?.sr2e?.designMod);
const modView = (i) => ({ name: i.name, system: i.system, customization: false });
/** Whether a mod's rating changes anything (the Foundry Workshop's own test: a per-level cost or a formula of R). */
export const modRated = (s = {}) => !!(s.dpPerLevel || s.dpTable?.length || s.cfPerLevel || /R/.test(`${s.dpFormula ?? ""}${s.cfFormula ?? ""}${s.loadFormula ?? ""}`));
const setPath = (o, path, v) => { const k = path.split("."), last = k.pop(); let t = o; for (const x of k) t = (t[x] ??= {}); t[last] = v; };

/** A new designed vehicle: an empty working design (the Workshop's blank one). */
export function newDesignedVehicle(tables, name) {
  if (!hasTables(tables)) throw noTables();
  const b = { schema: VEHICLE_SCHEMA, schemaVersion: VEHICLE_SCHEMA_VERSION, name: cleanName(name || "New vehicle"), notes: "", catalogId: null,
    nextItem: 1, actor: { items: [] }, design: { choices: blankDesign() } };
  rebuild(b, tables);
  return b;
}

/** The engine's result for a designed vehicle, exactly as the Foundry Workshop computes it. */
export function designResult(body, tables) {
  // ONE design result (PLAN-workshop-mounts 1.4): the engine (with the fixed mounts' weapon weight) + the mount check.
  const items = body.actor.items;
  const r = designVehicle(body.design.choices, tables, { mods: engineMods(designModsOf(body).map(modView)), weaponLoad: mountedWeaponLoad(items) });
  const mp = mountProblems(items);
  if (mp.length) { r.problems.push(...mp); r.valid = false; }
  return r;
}

/**
 * Rebuild a designed vehicle's `actor` from its choices (docs/PLAN-workshop.md 2.2): always the v2 design (a draft
 * still reopens in Foundry's Workshop); the saved stats only with both a chassis and a power plant; the chassis art
 * whenever there is a chassis. The design mods (with their stored choice) and the cargo are kept.
 */
function rebuild(b, tables) {
  const c = b.design.choices, ch = tables.chassis?.[c.chassisKey], pp = tables.powerPlants?.[c.powerPlantKey];
  const actor = { name: b.name, type: "vehicle", img: "icons/svg/car.svg", system: { design: { version: 2, baseVersion: 2, choices: structuredClone(c) } },
    items: [], effects: [], flags: {}, prototypeToken: { name: b.name } };
  if (ch && pp) for (const [k, v] of Object.entries(workshopUpdate(c, designResult(b, tables), ch, pp, b.name))) setPath(actor, k, v);
  const art = ch ? chassisArt(ch) : null;
  if (art) for (const [k, v] of Object.entries(art)) setPath(actor, k, v);
  actor.items = b.actor.items.map(i => (i.flags?.sr2e?.designMod
    ? { ...i, system: { ...i.system, custom: { ...(i.system.custom ?? {}), choice: choiceFor(c, i.system) } } } : i));
  b.actor = actor;
}

const mounted = (body, kind) => body.actor.items.filter(i => i.flags?.sr2e?.mount === kind);
const ours = (body, itemId, what) => {
  const i = typeof itemId === "string" ? body.actor.items.find(x => x._id === itemId && x.flags?.sr2e?.[what]) : null;
  if (!i) throw new Refusal(what === "mount" ? "No such mounted weapon on this vehicle." : "No such cargo on this vehicle.");
  return i;
};
const listPrice = (e) => Number(e?.system?.cost);

/** Mount points free and used: `{ hardpoint: { total, used }, firmpoint: { total, used }, upTo, pointCost, page }`. */
export function mountsOf(body) {
  const p = mountPointsOf(docIdOf(body.catalogId));
  return { hardpoint: { total: p.hardpoints, used: mounted(body, "hardpoint").length },
    firmpoint: { total: p.firmpoints, used: mounted(body, "firmpoint").length }, upTo: p.upTo, pointCost: p.pointCost, page: p.page };
}

/** Apply one operation: the next body, or a `Refusal`. `lookup(catalogId)` gives a catalog entry; `tables` the Rigger 2
 *  design tables (a designed vehicle's ops need them). */
export function applyVehicleOp(body, op, lookup = () => null, { tables = null } = {}) {
  if (!op || typeof op !== "object" || !Object.hasOwn(VEHICLE_OPS, op.op)) throw new Refusal("Unknown operation.");
  const b = structuredClone(body);
  b.design ??= null;   // a version 1 body is a catalog vehicle (PLAN-workshop 2.1)
  b.schemaVersion = VEHICLE_SCHEMA_VERSION;
  if (DESIGN_OPS.has(op.op) && !b.design) throw new Refusal("This vehicle comes from the catalog: only a vehicle designed from scratch has a design.");
  if (b.design && !hasTables(tables)) throw noTables();
  const add = (item) => {
    if (b.actor.items.length >= MAX_VEHICLE_ITEMS) throw new Refusal(`A vehicle holds at most ${MAX_VEHICLE_ITEMS} weapons and items here.`);
    let n = b.nextItem ?? 1;
    while (b.actor.items.some(i => i._id === itemKey(n))) n++;
    b.actor.items.push({ ...item, _id: itemKey(n) });
    b.nextItem = n + 1;
  };
  const snapshot = (e, flags) => ({ name: e.name, type: e.type, img: e.img ?? null, system: structuredClone(e.system ?? {}),
    flags: { sr2e: { catalogId: e.id, ...flags } }, ...(e.uuid ? { _stats: { compendiumSource: e.uuid } } : {}) });
  switch (op.op) {
    case "setName": b.name = b.actor.name = cleanName(op.name); break;
    case "setNotes":
      if (typeof op.notes !== "string" || op.notes.length > 20000) throw new Refusal("Notes are at most 20,000 characters.");
      b.notes = op.notes; break;
    case "mountWeapon": {   // p.251: a hardpoint takes a heavy weapon, a firmpoint a smaller firearm; bought separately
      if (b.design) throw new Refusal("A designed vehicle's weapon mounts are Rigger 2 mods; mounting weapons on them comes later.", 131);
      const e = lookup(op.catalogId);
      if (!e || e.type !== "weapon") throw new Refusal("That isn't a weapon in the catalog.");
      if (e.book !== CORE) throw new Refusal("Only the core book's weapons for now.", 251);
      const kind = mountKindFor({ id: docIdOf(e.id), weaponType: e.system?.weaponType });
      if (!kind) throw new Refusal(`${e.name} doesn't go on a vehicle mount: a hardpoint takes a heavy weapon, a firmpoint a smaller firearm.`, 251);
      if (op.kind !== kind) throw new Refusal(`${e.name} goes on a ${kind}, not a ${op.kind}.`, 251);
      if (!(listPrice(e) > 0)) throw new Refusal(`${e.name} has no list price, so its mounting can't be priced.`, 251);
      const m = mountsOf(b)[kind];
      if (m.used >= m.total) throw new Refusal(m.total ? `Every ${kind} on this vehicle is taken (${m.total}).` : `This vehicle has no ${kind}s.`, 251);
      add(snapshot(e, { mount: kind }));
      break;
    }
    case "unmountWeapon": {   // a design's weapon takes its conversion kit with it (PLAN-workshop-mounts 1.2)
      const i = ours(b, op.itemId, "mount");
      b.actor.items = b.actor.items.filter(x => x !== i && x.flags?.sr2e?.kitFor !== i._id);
      break;
    }
    case "addGear": {   // cargo: gear, or the launcher's missiles and rockets (p.255). No capacity rule in the core book.
      const e = lookup(op.catalogId);
      const munition = e && Object.hasOwn(LAUNCHER_MUNITIONS, docIdOf(e.id));
      if (!e || (e.type !== "gear" && !munition)) throw new Refusal("That isn't gear (or launcher ammunition) in the catalog.");
      if (e.book !== CORE) throw new Refusal("Only the core book's gear for now.");
      if (!Number.isInteger(op.quantity) || op.quantity < 1 || op.quantity > 99) throw new Refusal("A quantity is 1 to 99.");
      if (!(listPrice(e) > 0)) throw new Refusal(`${e.name} has no fixed list price, so it can't be priced as cargo.`);
      add(snapshot(e, { cargo: true, quantity: op.quantity }));
      break;
    }
    case "removeGear": { const i = ours(b, op.itemId, "cargo"); b.actor.items = b.actor.items.filter(x => x !== i); break; }
    case "setDesign": {   // the whole working design, as the Workshop saves it (PLAN-workshop 2.3)
      const why = checkChoices(op.design, tables);
      if (why.length) throw new Refusal(`That design isn't well-formed: ${why.slice(0, 3).join("; ")}.`);
      if (op.design.gmDP) throw new Refusal("Design options the gamemaster sets (p.117) aren't available here: there is no gamemaster in the app.", 117);
      if (op.design.dbwSplit && !designModsOf(b).some(i => i.system?.modKey === "drive-by-wire"))
        throw new Refusal("A drive-by-wire split needs a drive-by-wire system installed in design.", 124);
      b.design.choices = structuredClone(op.design);
      break;
    }
    case "addDesignMod":
    case "setDesignMod": {   // a mod installed in design, at a rating (p.118–146)
      const c = b.design.choices, ch = tables.chassis[c.chassisKey], pp = tables.powerPlants[c.powerPlantKey];
      if (!ch || !pp) throw new Refusal("Pick a chassis and a power plant first.", 109);
      const item = op.op === "setDesignMod" ? designModsOf(b).find(i => i._id === op.itemId) : null;
      if (op.op === "setDesignMod" && !item) throw new Refusal("No such modification on this design.");
      const e = item ? null : lookup(op.catalogId);
      if (!item && (!e || e.type !== "vehicle_mod")) throw new Refusal("That isn't a vehicle modification in the catalog.");
      // A conversion kit comes only with the weapon it converts (mountDesignWeapon; code review r1 #1).
      if (!item && Object.values(CONVERSION_KITS).includes(e.id)) throw new Refusal("A Firearm Conversion Kit is added with the weapon it converts: mount the weapon.", 131);
      const sys = item ? item.system : e.system;
      if (!Number.isInteger(op.rating) || op.rating < 1 || op.rating > MAX_MOD_RATING) throw new Refusal(`A rating is 1 to ${MAX_MOD_RATING}.`);
      const rating = modRated(sys) ? op.rating : Math.max(1, Number(sys.rating) || 1);
      if (op.op === "setDesignMod" && !modRated(sys)) throw new Refusal(`${item.name} has no rating to change.`);
      const others = designModsOf(b).filter(i => i !== item).map(modView);
      const why = designModProblems(sys, modBuildContext(c, ch, pp, others), rating);
      if (why.length) throw new Refusal(`${item?.name ?? e.name} can't go on this design: ${why.join("; ")}.`, 118);
      if (item) item.system = { ...item.system, rating };
      else { const snap = snapshot(e, { designMod: true }); snap.system.rating = rating; add(snap); }
      break;
    }
    case "mountDesignWeapon": {   // R2 p.131–135: the mount must take the weapon; a personal firearm brings its kit
      const mountItem = designModsOf(b).find(x => x._id === op.mountId), spec = mountOf(mountItem);
      if (!spec) throw new Refusal("That isn't a weapon mount on this design.", 131);
      const e = lookup(op.catalogId);
      if (!e || e.type !== "weapon") throw new Refusal("That isn't a weapon in the catalog.");
      const cls = weaponClassOf({ flags: { sr2e: { catalogId: e.id } } });
      if (!cls) throw new Refusal(`${e.name} can't be put on a Rigger 2 mount here yet (core-book and Rigger 2 vehicle weapons only).`, 131);
      const others = b.actor.items.filter(x => x.type === "weapon" && x.flags?.sr2e?.mountId === mountItem._id).map(x => weaponClassOf(x));
      const why = fitProblem(spec, cls, others);
      if (why) throw new Refusal(`${e.name} can't go on ${mountItem.name}: ${why}.`, spec.kind === "turret" ? 135 : 131);
      if (!(listPrice(e) > 0)) throw new Refusal(`${e.name} has no list price, so it can't be priced.`);
      if (spec.kind === "fixed" && !(typeof e.system?.weight === "number" && Number.isFinite(e.system.weight) && e.system.weight >= 0))
        throw new Refusal(`${e.name}'s weight isn't known, so a fixed mount's Load can't be counted.`, 132);
      const kitKey = kitFor(spec, cls), kit = kitKey ? lookup(kitKey) : null;
      if (kitKey && kit?.type !== "vehicle_mod") throw new Refusal("The Firearm Conversion Kit isn't in this server's catalog.", 131);
      if (kitKey && b.actor.items.length + 2 > MAX_VEHICLE_ITEMS) throw new Refusal(`A vehicle holds at most ${MAX_VEHICLE_ITEMS} weapons and items here.`);
      add(snapshot(e, { mount: spec.point ?? "turret", mountId: mountItem._id }));
      const weaponId = b.actor.items.at(-1)._id;
      if (kit) { const k = snapshot(kit, { designMod: true, kitFor: weaponId }); k.system.rating = Math.max(1, Number(k.system.rating) || 1); add(k); }
      break;
    }
    case "removeDesignMod": {
      const i = designModsOf(b).find(x => x._id === op.itemId);
      if (!i) throw new Refusal("No such modification on this design.");
      const why = removalProblem(b.actor.items, i._id);   // an occupied mount, or a kit whose weapon is mounted, stays
      if (why) throw new Refusal(why, 131);
      b.actor.items = b.actor.items.filter(x => x !== i);
      // The split goes with the LAST drive-by-wire system (code review r1 #3).
      if (b.design.choices.dbwSplit && !designModsOf(b).some(x => x.system?.modKey === "drive-by-wire")) delete b.design.choices.dbwSplit;
      break;
    }
  }
  if (b.design) rebuild(b, tables);
  return b;
}

/**
 * What the vehicle costs as it stands (docs/PLAN-garage.md 6): its list price (p.264; 0 = "Restricted", no price),
 * the Scorpion's price per firmpoint fitted (p.251), each mounted weapon at twice its list price ("Adaptation … doubles
 * its cost", p.251; a core Vehicle Weapon at list price, it is built for a mount) and each cargo item at list price × its quantity. `{ total, vehicle, points, weapons, cargo }`.
 */
export function vehiclePrice(body, tables = null) {
  const cargoOf = (b) => b.actor.items.filter(i => i.flags?.sr2e?.cargo).reduce((t, i) => t + (Number(i.system?.cost) || 0) * (i.flags.sr2e.quantity ?? 1), 0);
  if (body.design) {   // designed (PLAN-workshop 3): the engine's price (DP × Mark-Up, rounded, + nuyen-priced parts) when finished
    // Weapons: bought separately at list price, not doubled — Rigger 2's conversion kit is the adaptation (R20).
    const weapons = body.actor.items.filter(i => i.type === "weapon" && i.flags?.sr2e?.mountId).reduce((t, i) => t + (Number(i.system?.cost) || 0), 0);
    const r = hasTables(tables) ? designResult(body, tables) : null, cargo = cargoOf(body), ok = !!r?.valid;
    return { total: ok ? r.price + weapons + cargo : 0, vehicle: ok ? r.price : 0, points: 0, weapons, cargo, unfinished: !ok,
      problems: r ? r.problems : [{ code: "noTables", msg: noTables().message, page: "p.108" }] };
  }
  const vehicle = Number(body.actor.system?.cost) || 0;
  const m = mountsOf(body);
  const points = m.pointCost * (m.firmpoint.used + m.hardpoint.used);
  const weapons = body.actor.items.filter(i => i.flags?.sr2e?.mount).reduce((t, i) => t + mountedWeaponCost(i.system?.cost, docIdOf(i.flags.sr2e.catalogId)), 0);
  const cargo = cargoOf(body);
  return { total: vehicle + points + weapons + cargo, vehicle, points, weapons, cargo, unfinished: false, problems: [] };
}

/** The sourcebooks a garage vehicle needs (PLAN-workshop 3.2): Rigger 2 for a design, and every item's cited book. */
export function vehicleBooks(body) {
  const out = new Set(body.design ? ["r2"] : []);
  for (const i of body.actor.items ?? []) { const k = i.system?.citation?.book; if (typeof k === "string" && k) out.add(k); }
  out.delete(CORE);
  return [...out].sort();
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The Foundry vehicle actor this document describes: its name, its notes added to `system.notes`, its items. */
export function vehicleActor(body) {
  const a = structuredClone(body.actor);
  a.name = body.name;
  if (a.prototypeToken) a.prototypeToken = { ...a.prototypeToken, name: body.name };   // the token follows a rename (r1 #8)
  const extra = String(body.notes ?? "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  if (extra) a.system = { ...a.system, notes: `${a.system?.notes ?? ""}${extra}` };
  return a;
}
