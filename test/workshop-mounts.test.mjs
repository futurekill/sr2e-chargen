/** Weapons on a design's Rigger 2 mounts (docs/PLAN-workshop-mounts.md; R2 p.131–135), through the app's reducer. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog, designTables } from "../tools/build-catalog.mjs";
import { entryOf } from "../server/catalog.mjs";
import { newDesignedVehicle, applyVehicleOp, vehiclePrice, vehicleActor, vehicleBooks, designResult } from "../shared/vehicle.mjs";
import { blankDesign } from "../shared/rules.mjs";

const root = new URL("../", import.meta.url);
const pins = JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir = new URL("content", root).pathname;
const built = buildCatalog({ pins, contentDir }), tables = designTables({ pins, contentDir });
const catalog = { byId: new Map(built.entries.map(e => [e.id, e])), vehicles: new Map() };
const lookup = (id) => entryOf(catalog, id);
const op = (b, o) => applyVehicleOp(b, o, lookup, { tables });
const M = (id) => `sr2e-rigger-2.r2-vehicle-mods.${id}`, W = (id) => `sr2e.weapons.${id}`;
const FIXED_FIRM = M("9899f9283b954643"), MINI = M("e9082bd14a794425"), PINTLE = M("07ce1f02240a4aca");
const AK97 = W("9a954abc8f8a3315"), PREDATOR = W("238ee9d5c429d332"), HMG = W("ee9947f739c2cac6"), VALIANT = W("8ee88fc80bdff8f4");
const sedan = () => ({ ...blankDesign(), chassisKey: "sedan", powerPlantKey: "gasoline-cars-sedan" });
const mountIdOf = (b, key) => b.actor.items.find(i => i.flags?.sr2e?.catalogId === key)._id;

function designWithMounts() {
  let b = op(newDesignedVehicle(tables, "Gunboat"), { op: "setDesign", design: { ...sedan(), cargo: 2 } });   // a turret needs the room (6 CF)
  b = op(b, { op: "addDesignMod", catalogId: FIXED_FIRM, rating: 1 });
  b = op(b, { op: "addDesignMod", catalogId: MINI, rating: 1 });
  return b;
}

test("a rifle on a fixed firmpoint brings its kit; its DP, its weight on the Load, its price at list", () => {
  let b = designWithMounts();
  const dpBefore = designResult(b, tables).dp, loadBefore = designResult(b, tables).budgets.loadUsed;
  b = op(b, { op: "mountDesignWeapon", catalogId: AK97, mountId: mountIdOf(b, FIXED_FIRM) });
  const w = b.actor.items.find(i => i.type === "weapon");
  const kit = b.actor.items.find(i => i.flags?.sr2e?.kitFor === w._id);
  assert.equal(kit.flags.sr2e.catalogId, M("678b4d77eb54b3d7"), "the Rifle/Shotgun/LMG kit");
  assert.equal(kit.flags.sr2e.designMod, true);
  const r = designResult(b, tables);
  assert.equal(r.valid, true, JSON.stringify(r.problems));
  assert.equal(r.dp, dpBefore + 2, "the kit's 2 Design Points (p.131)");
  assert.equal(r.budgets.loadUsed, loadBefore + 0.5 + Number(lookup(AK97).system.weight), "the kit's 0.5 kg and the rifle's weight (p.132)");
  const p = vehiclePrice(b, tables);
  assert.equal(p.weapons, Number(lookup(AK97).system.cost), "list price, not doubled (R20)");
  assert.equal(p.total, r.price + p.weapons);
  assert.equal(w.flags.sr2e.mount, "firmpoint");
});

test("what a mount refuses: a heavy weapon on a firmpoint, a pistol in a turret, a turret over its Weapon Value, a second weapon on a fixed mount", () => {
  let b = designWithMounts();
  const firm = mountIdOf(b, FIXED_FIRM), mini = mountIdOf(b, MINI);
  assert.throws(() => op(b, { op: "mountDesignWeapon", catalogId: HMG, mountId: firm }), /hardpoints/);
  assert.throws(() => op(b, { op: "mountDesignWeapon", catalogId: PREDATOR, mountId: mini }), /no value/);
  b = op(b, { op: "mountDesignWeapon", catalogId: VALIANT, mountId: mini });   // LMG: 1.5 of 2
  assert.throws(() => op(b, { op: "mountDesignWeapon", catalogId: AK97, mountId: mini }), /Weapon Value 2; this would make 2.5/);
  b = op(b, { op: "mountDesignWeapon", catalogId: AK97, mountId: firm });
  assert.throws(() => op(b, { op: "mountDesignWeapon", catalogId: AK97, mountId: firm }), /holds one weapon/);
  assert.throws(() => op(b, { op: "mountDesignWeapon", catalogId: AK97, mountId: "gv00000000000099" }), /isn't a weapon mount/);
});

test("an occupied mount and a linked kit can't be removed; unmounting takes the kit; the mount then goes", () => {
  let b = designWithMounts();
  const firm = mountIdOf(b, FIXED_FIRM);
  b = op(b, { op: "mountDesignWeapon", catalogId: AK97, mountId: firm });
  const w = b.actor.items.find(i => i.type === "weapon"), kit = b.actor.items.find(i => i.flags?.sr2e?.kitFor === w._id);
  assert.throws(() => op(b, { op: "removeDesignMod", itemId: firm }), /holds weapons/);
  assert.throws(() => op(b, { op: "removeDesignMod", itemId: kit._id }), /converts/);
  const n = b.actor.items.length;
  b = op(b, { op: "unmountWeapon", itemId: w._id });
  assert.equal(b.actor.items.length, n - 2, "the weapon and its kit");
  b = op(b, { op: "removeDesignMod", itemId: firm });
  assert.ok(!b.actor.items.some(i => i._id === firm));
});

test("a pintle needs no kit (p.133); the export keeps mount links; books include each weapon's", () => {
  let b = op(newDesignedVehicle(tables, "Pickup"), { op: "setDesign", design: sedan() });
  b = op(b, { op: "addDesignMod", catalogId: PINTLE, rating: 1 });
  b = op(b, { op: "mountDesignWeapon", catalogId: AK97, mountId: mountIdOf(b, PINTLE) });
  assert.equal(b.actor.items.filter(i => i.flags?.sr2e?.kitFor).length, 0);
  assert.equal(designResult(b, tables).valid, true);
  const exp = vehicleActor(b), w = exp.items.find(i => i.type === "weapon");
  assert.equal(w.flags.sr2e.mountId, mountIdOf(b, PINTLE));
  assert.deepEqual(vehicleBooks(b), ["r2"]);
  const other = structuredClone(b); other.actor.items.find(i => i.type === "weapon").system.citation = { book: "ff", page: "1" };
  assert.deepEqual(vehicleBooks(other), ["ff", "r2"], "a mounted weapon's own book joins (code review r1 #5)");
});

test("a conversion kit can't be added on its own (code review r1 #1)", () => {
  const b = designWithMounts();
  assert.throws(() => op(b, { op: "addDesignMod", catalogId: M("678b4d77eb54b3d7"), rating: 1 }), /added with the weapon/);
});
