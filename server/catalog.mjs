/**
 * The catalog at run time (docs/PLAN-catalog.md §6): read once at start, checked, kept in memory. It is build output
 * (tools/build-catalog.mjs), the same for everyone and read-only. The routes are in routes/catalog.mjs.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export class CatalogError extends Error {}

const SUMMARY = ["id", "name", "type", "kind", "book", "listBook", "package", "citation", "cost", "category"];
const summary = (e) => Object.fromEntries(SUMMARY.map(k => [k, e[k]]));

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
  // The manifest is what the routes hand out: it must be exactly what the checked catalog body implies — never
  // trusted on its own (its checksum line only proves the BODY).
  const { entries, ...rest } = catalog, implied = { ...rest, entries: entries.length };
  const claimed = { ...manifest }; delete claimed.sha256; delete claimed.vehiclesSha256;   // each file's checksum is checked on its own
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
  // Search index: name and category, lower-cased once. Sorted by name for stable pages.
  const sorted = [...catalog.entries].sort((a, b) => a.name.localeCompare(b.name, "en") || (a.id < b.id ? -1 : 1));
  const index = sorted.map(e => ({ e, hay: `${e.name}\n${(e.category ?? []).join("\n")}`.toLowerCase() }));
  return { manifest, byId, index, vehicles, size: catalog.entries.length };
}

/** One entry, as the routes and the ops reducer see it: a vehicle carries its complete actor source (S9). */
export function entryOf(catalog, id) {
  const e = catalog?.byId.get(id);
  if (!e) return null;
  const src = e.type === "vehicle" ? catalog.vehicles?.get(id) : null;
  return src ? { ...e, actorSource: src } : e;
}

/** A page of summaries. `books` / `types`: arrays (empty = all); `q`: a plain substring, case-insensitive. */
export function searchCatalog(catalog, { books = [], types = [], q = "", offset = 0, limit = 50 } = {}) {
  const needle = String(q).trim().toLowerCase(), bookSet = new Set(books), typeSet = new Set(types);
  const hits = catalog.index.filter(({ e, hay }) => (!bookSet.size || bookSet.has(e.listBook)) && (!typeSet.size || typeSet.has(e.type)) && (!needle || hay.includes(needle)));
  return { total: hits.length, offset, entries: hits.slice(offset, offset + Math.min(100, Math.max(1, limit))).map(({ e }) => summary(e)) };
}
