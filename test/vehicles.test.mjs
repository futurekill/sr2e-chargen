/** Vehicles bought at creation, the app's side (docs/PLAN-S9-vehicles.md): vehicles.json, addVehicle, receipts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCatalog, vehicleSources, writeCatalog } from "../tools/build-catalog.mjs";
import { loadCatalog, entryOf, CatalogError } from "../server/catalog.mjs";
import { newCharacter, applyOp, validate } from "../shared/creation.mjs";

const root = new URL("../", import.meta.url);
const pins = JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir = new URL("content", root).pathname;
const catalog = buildCatalog({ pins, contentDir }), sources = vehicleSources({ pins, contentDir });
const byId = new Map(catalog.entries.map(e => [e.id, e]));
const lookup = (id) => { const e = byId.get(id); return e && sources[id] ? { ...e, actorSource: sources[id] } : e ?? null; };
const vehicle = (name) => { const e = catalog.entries.find(x => x.book === "sr2" && x.type === "vehicle" && x.name === name); assert.ok(e, name); return e; };
const start = () => applyOp(newCharacter("Rigger"), { op: "setPriority", category: "resources", letter: "A" }, lookup);

test("a vehicle is bought at its list price; the character keeps the whole source and the system's receipt (p.46, p.264)", () => {
  const scoot = vehicle("Dodge Scoot");
  let b = applyOp(start(), { op: "addVehicle", catalogId: scoot.id }, lookup);
  const [key] = Object.keys(b.creation.vehicles);
  assert.deepEqual(b.creation.vehicles[key].source, sources[scoot.id], "the complete source");
  assert.deepEqual(b.actor.system.chargen.vehicles, [{ name: "Dodge Scoot", source: scoot.uuid, cost: sources[scoot.id].system.cost }]);
  assert.equal(validate(b).budgets.resources.spent, sources[scoot.id].system.cost, "the system's chargenBudget counts the receipt");
  b = applyOp(b, { op: "removeVehicle", vehicleId: key }, lookup);
  assert.deepEqual([b.actor.system.chargen.vehicles, validate(b).budgets.resources.spent], [[], 0]);
});

test("refused: a Restricted vehicle (no price), a non-vehicle, a vehicle without its source, the 21st", () => {
  const restricted = catalog.entries.find(x => x.book === "sr2" && x.type === "vehicle" && !(sources[x.id]?.system.cost > 0));
  assert.ok(restricted, "the core book has Restricted vehicles");
  assert.throws(() => applyOp(start(), { op: "addVehicle", catalogId: restricted.id }, lookup), /Restricted/);
  const gun = catalog.entries.find(x => x.book === "sr2" && x.type === "weapon");
  assert.throws(() => applyOp(start(), { op: "addVehicle", catalogId: gun.id }, lookup), /isn't a vehicle/);
  const scoot = vehicle("Dodge Scoot");
  assert.throws(() => applyOp(start(), { op: "addVehicle", catalogId: scoot.id }, (id) => byId.get(id)), /full data/);
  let b = start();
  for (let i = 0; i < 20; i++) b = applyOp(b, { op: "addVehicle", catalogId: scoot.id }, lookup);
  assert.throws(() => applyOp(b, { op: "addVehicle", catalogId: scoot.id }, lookup), /at most 20/);
  assert.throws(() => applyOp(b, { op: "removeVehicle", vehicleId: "__proto__" }, lookup), /No such vehicle/);
});

test("vehicles.json: written with its own checksum, loaded and checked; entryOf gives a vehicle its source", () => {
  const dir = mkdtempSync(join(tmpdir(), "cat-"));
  const manifest = writeCatalog(catalog, dir, sources);
  assert.match(manifest.vehiclesSha256, /^[0-9a-f]{64}$/);
  const loaded = loadCatalog(dir);
  const scoot = vehicle("Dodge Scoot");
  assert.deepEqual(entryOf(loaded, scoot.id).actorSource, sources[scoot.id]);
  assert.equal(entryOf(loaded, catalog.entries.find(x => x.type === "weapon").id).actorSource, undefined);
  writeFileSync(join(dir, "vehicles.json"), JSON.stringify({ ...sources, extra: 1 }));
  assert.throws(() => loadCatalog(dir), CatalogError, "a changed vehicles.json is refused");
});
