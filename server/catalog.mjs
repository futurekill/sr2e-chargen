/**
 * The catalog at run time (docs/PLAN-catalog.md §6): read once at start, checked, kept in memory. It is build output
 * (tools/build-catalog.mjs), the same for everyone and read-only. The routes are in routes/catalog.mjs.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { offerReason } from "../shared/purchase.mjs";

export class CatalogError extends Error {}

const SUMMARY = ["id", "name", "type", "kind", "book", "listBook", "package", "citation", "cost", "category"];
const summary = (e) => ({ ...Object.fromEntries(SUMMARY.map(k => [k, e[k]])),
  // An Edge or Flaw's kind and printed value, for the picker (PLAN-M5d).
  ...(e.type === "quality" ? { quality: { kind: e.system?.kind ?? "", value: Number(e.system?.pointValue) || 0 } } : {}),
  // A weapon's type, for the Garage's mount picker (docs/PLAN-garage.md 4; code review r1 #2).
  ...(e.type === "weapon" ? { weaponType: e.system?.weaponType ?? "" } : {}),
  // A vehicle mod's rule data (no prose), for the Workshop's mod picker (docs/PLAN-workshop.md 1.5).
  ...(e.type === "vehicle_mod" ? { system: e.system } : {}) });

/**
 * Load `dir/catalog.json` and `dir/manifest.json`. Throws CatalogError when it is absent, damaged (the manifest's
 * checksum), empty, or misshapen. `pins` (optional) must equal the manifest's pins exactly: a stale catalog is refused.
 */
export function loadCatalog(dir, { pins = null } = {}) {
  const file = join(dir, "catalog.json"), manifestFile = join(dir, "manifest.json");
  if (!existsSync(file) || !existsSync(manifestFile)) throw new CatalogError(`no catalog in ${dir} (run: npm run build:catalog)`);
  const body = readFileSync(file);
  let manifest, catalog;
  try { manifest = JSON.parse(readFileSync(manifestFile, "utf8")); catalog = JSON.parse(body.toString("utf8")); }
  catch (err) { throw new CatalogError(`the catalog is not valid JSON (${err.message})`); }
  if (createHash("sha256").update(body).digest("hex") !== manifest.sha256) throw new CatalogError("the catalog doesn't match its manifest's checksum");
  if (!Array.isArray(catalog.entries) || !catalog.entries.length) throw new CatalogError("the catalog is empty");
  if (!Array.isArray(catalog.books) || !Array.isArray(catalog.pins)) throw new CatalogError("the catalog has no books or pins");
  const byId = new Map();
  for (const e of catalog.entries) {
    if (typeof e?.id !== "string" || typeof e.name !== "string" || typeof e.type !== "string" || typeof e.listBook !== "string" || !e.system || !e.text)
      throw new CatalogError(`a catalog entry is misshapen (${e?.id ?? "no id"})`);
    if (byId.has(e.id)) throw new CatalogError(`duplicate catalog id ${e.id}`);
    byId.set(e.id, e);
  }
  // Implant weapons (PLAN-M5l, code review r1 #3): every paired implant names its weapon and the weapon names it back,
  // so a catalog built before the pairing (or tampered with) can't quietly sell implants without their weapons.
  for (const e of catalog.entries) {
    if (e.type === "cyberware" && typeof e.flags?.sr2e?.pairedWeapon === "string") {
      const w = byId.get(e.pairedWeaponId);
      if (w?.type !== "weapon" || w.pairedWareId !== e.id) throw new CatalogError(`${e.id}: its paired weapon is missing; rebuild the catalog`);
    }
    if (e.pairedWareId !== undefined && byId.get(e.pairedWareId)?.pairedWeaponId !== e.id) throw new CatalogError(`${e.id}: its paired implant is missing; rebuild the catalog`);
  }
  // The manifest is what the routes hand out: it must be exactly what the checked catalog body implies — never
  // trusted on its own (its checksum line only proves the BODY).
  const { entries, ...rest } = catalog, implied = { ...rest, entries: entries.length };
  const claimed = { ...manifest }; delete claimed.sha256; delete claimed.vehiclesSha256; delete claimed.designSha256; delete claimed.npcsSha256;   // each file's checksum is checked on its own
  if (JSON.stringify(claimed) !== JSON.stringify(implied)) throw new CatalogError("the catalog's manifest doesn't describe its catalog");
  if (pins) {
    const key = (list) => JSON.stringify(list.map(p => [p.dir, p.tag, p.commit]));
    if (key(pins) !== key(catalog.pins)) throw new CatalogError("the catalog was built from other pins than content-pins.json (run: npm run build:catalog)");
  }
  // Vehicles' complete sources (docs/PLAN-S9-vehicles.md Draft 4/5): checked against their own checksum; a catalog
  // built without them (older builds, test fixtures) simply has none, and buying a vehicle is refused.
  const vehicles = new Map();
  const vf = join(dir, "vehicles.json");
  if (!manifest.vehiclesSha256 && existsSync(vf)) throw new CatalogError("vehicles.json is there but the manifest has no checksum for it");   // r1 #3
  if (manifest.vehiclesSha256) {
    if (!existsSync(vf)) throw new CatalogError("the manifest names vehicles.json but it is missing");
    const vbody = readFileSync(vf);
    if (createHash("sha256").update(vbody).digest("hex") !== manifest.vehiclesSha256) throw new CatalogError("vehicles.json doesn't match its manifest's checksum");
    for (const [id, src] of Object.entries(JSON.parse(vbody.toString("utf8")))) {
      const e = byId.get(id);
      // The source must be THAT entry's (r1 #2): its type, its document id (the id's last part) and its name.
      const price = typeof src?.system?.cost === "number" ? src.system.cost : null;   // the price charged must be the catalog's
      if (e?.type !== "vehicle" || src?.type !== "vehicle" || src._id !== id.split(".").pop() || src.name !== e.name || price !== e.cost)
        throw new CatalogError(`vehicles.json holds ${id}, which is not that catalog vehicle's source`);
      vehicles.set(id, src);
    }
  }
  // Rigger 2's vehicle-design tables (docs/PLAN-workshop.md 1.2), checked like vehicles.json; none = no designing.
  let design = null;
  const df = join(dir, "design-tables.json");
  if (!manifest.designSha256 && existsSync(df)) throw new CatalogError("design-tables.json is there but the manifest has no checksum for it");
  if (manifest.designSha256) {
    if (!existsSync(df)) throw new CatalogError("the manifest names design-tables.json but it is missing");
    const dbody = readFileSync(df);
    if (createHash("sha256").update(dbody).digest("hex") !== manifest.designSha256) throw new CatalogError("design-tables.json doesn't match its manifest's checksum");
    design = JSON.parse(dbody.toString("utf8"));
    if (!design?.chassis || !design.powerPlants || !design.fuel || !design.markUp || !design.pin?.commit) throw new CatalogError("design-tables.json is misshapen");
    design.etag = `"${manifest.designSha256.slice(0, 32)}"`;
  }
  // Book NPCs' complete sources (docs/PLAN-npc-builder.md 1), checked like vehicles.json; none = no book NPCs.
  const npcs = new Map();
  const nf = join(dir, "npcs.json");
  if (!manifest.npcsSha256 && existsSync(nf)) throw new CatalogError("npcs.json is there but the manifest has no checksum for it");
  if (manifest.npcsSha256) {
    if (!existsSync(nf)) throw new CatalogError("the manifest names npcs.json but it is missing");
    const nbody = readFileSync(nf);
    if (createHash("sha256").update(nbody).digest("hex") !== manifest.npcsSha256) throw new CatalogError("npcs.json doesn't match its manifest's checksum");
    for (const [id, rec] of Object.entries(JSON.parse(nbody.toString("utf8")))) {
      const e = byId.get(id), src = rec?.source;
      const okRange = rec?.prRange === null || (Array.isArray(rec?.prRange) && rec.prRange.length === 2 && rec.prRange.every(Number.isInteger));
      if (!["npc", "character"].includes(e?.type) || src?.type !== e.type || src._id !== id.split(".").pop() || src.name !== e.name || !okRange)
        throw new CatalogError(`npcs.json holds ${id}, which is not that catalog entry's source`);
      npcs.set(id, rec);
    }
  }
  // Search index: name and category, lower-cased once. Sorted by name for stable pages.
  const sorted = [...catalog.entries].sort((a, b) => a.name.localeCompare(b.name, "en") || (a.id < b.id ? -1 : 1));
  const index = sorted.map(e => ({ e, hay: `${e.name}\n${(e.category ?? []).join("\n")}`.toLowerCase() }));
  return { manifest, byId, index, vehicles, design, npcs, size: catalog.entries.length, offers: bookOffers(catalog.entries, catalog.books.map(x => x.key)) };
}

/** One entry, as the routes and the ops reducer see it: a vehicle carries its complete actor source (S9). */
export function entryOf(catalog, id) {
  const e = catalog?.byId.get(id);
  if (!e) return null;
  const src = e.type === "vehicle" ? catalog.vehicles?.get(id) : null;
  return src ? { ...e, actorSource: src } : e;
}

/**
 * Whether a character with these books may buy the entry ("creation" | "play"), as the reducer decides: a vehicle by
 * addVehicle (core, with a list price), a skill by addSkill (core), the rest by offerReason (code review M5a r1 #3).
 */
export function offeredBy(e, books, mode) {
  const core = (e.book ?? e.listBook) === "sr2";
  if (e.type === "vehicle") return core && Number(e.cost) > 0;   // addVehicle at creation, buyVehicle in play (PLAN-play-vehicles 2)
  if (e.type === "skill") return core;
  return offerReason(e, books, { inPlay: mode === "play" }) === null;
}
/** Per sourcebook, with every book on: how many entries are offered at creation now and how many wait (r1 #5). */
function bookOffers(entries, books) {
  const out = {};
  for (const e of entries) {
    const k = e.book ?? e.listBook;
    if (!k || k === "sr2") continue;
    const o = out[k] ??= { offered: 0, later: 0 };
    if (offeredBy(e, books, "creation")) o.offered++; else o.later++;
  }
  return out;
}
/** A page of summaries. `books` / `types`: arrays (empty = all); `q`: a plain substring, case-insensitive. */
export function searchCatalog(catalog, { books = [], types = [], q = "", offset = 0, limit = 50, offerable = null } = {}) {
  const needle = String(q).trim().toLowerCase(), bookSet = new Set(books), typeSet = new Set(types);
  // `offerable` ("creation" | "play"): only what a character with exactly these books may buy (docs/PLAN-M5a.md).
  // A vehicle is bought with addVehicle (S9), core only for now: offered when it is the core book's.
  const offers = (e) => !offerable || offeredBy(e, books, offerable);
  const hits = catalog.index.filter(({ e, hay }) => (!bookSet.size || bookSet.has(e.listBook)) && (!typeSet.size || typeSet.has(e.type)) && (!needle || hay.includes(needle)) && offers(e));
  return { total: hits.length, offset, entries: hits.slice(offset, offset + Math.min(100, Math.max(1, limit))).map(({ e }) => summary(e)) };
}
