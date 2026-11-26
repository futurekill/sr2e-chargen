/** The Garage (docs/PLAN-garage.md): vehicle documents, mounts by the core rules (p.251–253), buying and linking. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { buildCatalog, vehicleSources } from "../tools/build-catalog.mjs";
import { entryOf } from "../server/catalog.mjs";
import { newCharacter, applyOp, validate } from "../shared/creation.mjs";
import { newVehicle, applyVehicleOp, vehiclePrice, vehicleActor, mountsOf, MAX_VEHICLE_ITEMS } from "../shared/vehicle.mjs";
import { vehicleToFoundry } from "../shared/foundry.mjs";
import { sheetModel } from "../server/sheet/model.mjs";
import { testContext, PW } from "./helpers.mjs";
import { buildApp } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import * as A from "../server/auth/accounts.mjs";

const root = new URL("../", import.meta.url);
const pins = JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir = new URL("content", root).pathname;
const built = buildCatalog({ pins, contentDir }), sources = vehicleSources({ pins, contentDir });
const catalog = { byId: new Map(built.entries.map(e => [e.id, e])), vehicles: new Map(Object.entries(sources)),
  index: built.entries.map(e => ({ e, hay: `${e.name}\n${(e.category ?? []).join("\n")}`.toLowerCase() })), manifest: { books: [] } };
const lookup = (id) => entryOf(catalog, id);
const SCORPION = "sr2e.vehicles.c9330e180d1d7e0e", PATROL = "sr2e.vehicles.5af822ac2cddf8b8", SCOOT = "sr2e.vehicles.05ac5ce3c478b0f0";
const VALIANT = "sr2e.weapons.8ee88fc80bdff8f4", HMG = "sr2e.weapons.ee9947f739c2cac6", AVM = "sr2e.weapons.64d1f53fa35c8d71";
const UBGL = "sr2e.weapons.92a4f1ecb7c5ab6b", KATANA = built.entries.find(e => e.book === "sr2" && e.type === "weapon" && e.name === "Katana").id;
const gear = built.entries.find(e => e.book === "sr2" && e.type === "gear" && Number(e.system?.cost) > 0);
const op = (b, o) => applyVehicleOp(b, o, lookup);

test("a garage vehicle: mounts by the printed points and the weapon's kind (p.251–253)", () => {
  let b = newVehicle(lookup(SCORPION), "Red Scorpion");
  assert.equal(b.actor.name, "Red Scorpion");
  for (let i = 0; i < 3; i++) b = op(b, { op: "mountWeapon", catalogId: VALIANT, kind: "firmpoint" });
  assert.deepEqual(mountsOf(b).firmpoint, { total: 3, used: 3 });
  assert.throws(() => op(b, { op: "mountWeapon", catalogId: VALIANT, kind: "firmpoint" }), /Every firmpoint .* taken/);
  assert.throws(() => op(b, { op: "mountWeapon", catalogId: HMG, kind: "hardpoint" }), /no hardpoints/);
  assert.throws(() => op(b, { op: "mountWeapon", catalogId: VALIANT, kind: "hardpoint" }), /goes on a firmpoint/);
  assert.throws(() => op(b, { op: "mountWeapon", catalogId: KATANA, kind: "firmpoint" }), /doesn't go on a vehicle mount/);
  assert.throws(() => op(b, { op: "mountWeapon", catalogId: UBGL, kind: "hardpoint" }), /doesn't go on a vehicle mount/, "an under-barrel launcher is an accessory");
  const ids = b.actor.items.map(i => i._id);
  assert.equal(new Set(ids).size, 3, "each mounted copy has its own id");
  b = op(b, { op: "unmountWeapon", itemId: ids[1] });
  b = op(b, { op: "mountWeapon", catalogId: VALIANT, kind: "firmpoint" });
  assert.ok(!b.actor.items.slice(0, 2).some(i => i._id === b.actor.items[2]._id) && !ids.includes(b.actor.items[2]._id), "a new id, never a reused one");
  let p = newVehicle(lookup(PATROL));
  p = op(p, { op: "mountWeapon", catalogId: HMG, kind: "hardpoint" });
  p = op(p, { op: "mountWeapon", catalogId: VALIANT, kind: "firmpoint" });
  assert.deepEqual([mountsOf(p).hardpoint.used, mountsOf(p).firmpoint.used], [1, 1]);
  assert.throws(() => op(newVehicle(lookup(SCOOT)), { op: "mountWeapon", catalogId: VALIANT, kind: "firmpoint" }), /no firmpoints/);
});

test("the price: list + the Scorpion's points + weapons doubled + cargo × quantity (p.251, p.264)", () => {
  let b = newVehicle(lookup(SCORPION));
  b = op(b, { op: "mountWeapon", catalogId: VALIANT, kind: "firmpoint" });
  b = op(b, { op: "addGear", catalogId: gear.id, quantity: 3 });
  const valiant = Number(lookup(VALIANT).system.cost);
  assert.deepEqual(vehiclePrice(b), { total: 15000 + 1000 + 2 * valiant + 3 * Number(gear.system.cost), vehicle: 15000, points: 1000, weapons: 2 * valiant, cargo: 3 * Number(gear.system.cost) });
  b = op(b, { op: "addGear", catalogId: AVM, quantity: 2 });
  assert.equal(b.actor.items.at(-1).flags.sr2e.cargo, true, "missiles ride as the launcher's ammunition (cargo)");
  assert.throws(() => op(b, { op: "addGear", catalogId: gear.id, quantity: 0 }), /1 to 99/);
  assert.throws(() => op(b, { op: "removeGear", itemId: b.actor.items[0]._id }), /No such cargo/, "a mounted weapon isn't cargo");
});

test("caps, names, notes; the Foundry actor is built from the document", () => {
  let b = newVehicle(lookup(SCOOT), "  Zip  ");
  assert.equal(b.name, "Zip");
  for (let i = 0; i < MAX_VEHICLE_ITEMS; i++) b = op(b, { op: "addGear", catalogId: gear.id, quantity: 1 });
  assert.throws(() => op(b, { op: "addGear", catalogId: gear.id, quantity: 1 }), /at most 30/);
  b = op(b, { op: "setName", name: "Zap" });
  b = op(b, { op: "setNotes", notes: "Fast.\n\n<b>Red</b>" });
  const actor = vehicleToFoundry(vehicleActor(b), "0.166.0");
  assert.equal(actor.name, "Zap");
  assert.match(actor.system.notes, /<p>Fast\.<\/p><p>&lt;b&gt;Red&lt;\/b&gt;<\/p>$/, "notes escaped, after the book's description");
  assert.equal(new Set(actor.items.map(i => i._id)).size, MAX_VEHICLE_ITEMS);
  assert.ok(actor.items.every(i => /^[A-Za-z0-9]{16}$/.test(i._id)));
  assert.throws(() => newVehicle(built.entries.find(e => e.type === "vehicle" && e.book !== "sr2")), /core book's vehicles/);
});

test("buying a garage vehicle at creation: a keyed snapshot at its whole price; once; undone by removing it", () => {
  const gid = randomUUID();
  let v = newVehicle(lookup(SCORPION)); v = op(v, { op: "mountWeapon", catalogId: VALIANT, kind: "firmpoint" });
  const g = { [gid]: { name: v.name, revision: 3, source: vehicleActor(v), price: vehiclePrice(v).total } };
  const garage = (id) => g[id] ?? null;
  let b = applyOp(newCharacter("Rigger"), { op: "setPriority", category: "resources", letter: "A" }, lookup);
  b = applyOp(b, { op: "addVehicle", catalogId: SCOOT }, lookup);
  b = applyOp(b, { op: "buyGarageVehicle", garageId: gid }, lookup, { garage });
  assert.deepEqual(b.actor.system.chargen.vehicles.map(r => r.cost), [2000, vehiclePrice(v).total], "catalog list price, garage whole price");
  assert.equal(validate(b).budgets.resources.spent, 2000 + vehiclePrice(v).total);
  assert.throws(() => applyOp(b, { op: "buyGarageVehicle", garageId: gid }, lookup, { garage }), /already bought/);
  b = applyOp(b, { op: "setNotes", notes: "x" }, lookup);
  b = applyOp(b, { op: "setPriority", category: "resources", letter: "A" }, lookup);   // a rebuild keeps both receipts
  assert.equal(b.actor.system.chargen.vehicles.length, 2);
  const key = Object.keys(b.creation.vehicles).find(k => b.creation.vehicles[k].garageId === gid);
  b = applyOp(b, { op: "removeVehicle", vehicleId: key }, lookup);
  assert.deepEqual(b.actor.system.chargen.vehicles.map(r => r.cost), [2000]);
  assert.throws(() => applyOp(b, { op: "buyGarageVehicle", garageId: randomUUID() }, lookup, { garage }), /isn't in your garage/);
});

test("links: checked when made, soft afterwards; allowed after creation; a bought-and-linked vehicle prints once", () => {
  const gid = randomUUID(), v = newVehicle(lookup(SCOOT));
  const garage = (id) => (id === gid ? { name: v.name, revision: 1, source: vehicleActor(v), price: 2000 } : null);
  let b = applyOp(newCharacter("Rigger"), { op: "attachVehicle", garageId: gid }, lookup, { garage });
  assert.deepEqual(b.links, [gid]);
  assert.throws(() => applyOp(b, { op: "attachVehicle", garageId: gid }, lookup, { garage }), /already linked/);
  assert.throws(() => applyOp(b, { op: "attachVehicle", garageId: randomUUID() }, lookup, { garage }), /isn't in your garage/);
  b = applyOp(b, { op: "detachVehicle", garageId: gid }, lookup, { garage });
  assert.deepEqual(b.links, []);
  const m = sheetModel({ ...b, _linked: [{ garageId: gid, source: vehicleActor(v) }] });
  assert.equal(m.vehicles.length, 1);
});

/* ── The library, on every database ─────────────────────────────────────────────────────────────────────────── */
const ORIGIN = "https://hoi.example", D = "/api/documents";
async function harness() {
  const t = await testContext();
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog });
  const person = async (username, secret) => {
    const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret, username, password: PW } });
    const cookie = res.headers["set-cookie"].split(";")[0];
    const csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
    const call = (method, url, body) => app.inject({ method, url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, ...(method === "GET" ? {} : { "idempotency-key": randomUUID() }) }, ...(body !== undefined ? { payload: body } : {}) });
    return { call };
  };
  const boss = await person("Boss", (await A.bootstrap(t.ctx)).secret);
  const razor = await person("Razor", (await A.createInvite(t.ctx)).secret);
  return { app, boss, razor };
}

test("library: a vehicle document, its operations and revisions; buying and linking only your own live vehicles", async () => {
  const { razor, boss } = await harness();
  const made = await razor.call("POST", `${D}/vehicles`, { catalogId: SCORPION, name: "Red Scorpion" });
  assert.equal(made.statusCode, 200, made.body);
  const vid = made.json().document.id;
  assert.equal(made.json().document.kind, "vehicle");
  const after = await razor.call("POST", `${D}/${vid}/ops`, { revision: 1, ops: [{ op: "mountWeapon", catalogId: VALIANT, kind: "firmpoint" }] });
  assert.equal(after.statusCode, 200, after.body);
  assert.equal(after.json().document.revision, 2);
  assert.equal((await razor.call("POST", `${D}/${vid}/ops`, { revision: 2, ops: [{ op: "mountWeapon", catalogId: HMG, kind: "hardpoint" }] })).statusCode, 422);
  const foundry = (await razor.call("GET", `${D}/${vid}/foundry`)).json();
  assert.equal(foundry.type, "vehicle"); assert.equal(foundry.name, "Red Scorpion"); assert.equal(foundry.items.length, 1);
  // A character buys it at creation (the snapshot) and links it; another user can't touch it.
  const cid = (await razor.call("POST", `${D}/characters`, { name: "Rigger" })).json().document.id;
  let r = await razor.call("POST", `${D}/${cid}/ops`, { revision: 1, ops: [{ op: "setPriority", category: "resources", letter: "A" }, { op: "buyGarageVehicle", garageId: vid }, { op: "attachVehicle", garageId: vid }] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().body.actor.system.chargen.vehicles[0].cost, 15000 + 1000 + 2 * Number(lookup(VALIANT).system.cost));
  r = await razor.call("POST", `${D}/${cid}/ops`, { revision: 2, ops: [{ op: "buyGarageVehicle", garageId: vid }] });
  assert.equal(r.statusCode, 422, "bought once");
  const bcid = (await boss.call("POST", `${D}/characters`, { name: "Thief" })).json().document.id;
  for (const o of ["buyGarageVehicle", "attachVehicle"]) assert.equal((await boss.call("POST", `${D}/${bcid}/ops`, { revision: 1, ops: [{ op: "setPriority", category: "resources", letter: "A" }, { op: o, garageId: vid }] })).statusCode, 422, `${o}: not another user's vehicle`);
  assert.equal((await boss.call("POST", `${D}/${vid}/ops`, { revision: 2, ops: [{ op: "setName", name: "Mine" }] })).statusCode, 404);
  // Archived or deleted: no longer linkable or buyable; an existing link reads as gone (the stat block omits it).
  const v2 = (await razor.call("POST", `${D}/vehicles`, { catalogId: SCOOT })).json().document;
  r = await razor.call("POST", `${D}/${cid}/ops`, { revision: 2, ops: [{ op: "attachVehicle", garageId: v2.id }] });
  assert.equal(r.statusCode, 200, r.body);
  assert.match((await razor.call("GET", `${D}/${cid}/statblock.md`)).body, /Dodge Scoot/);
  await razor.call("DELETE", `${D}/${v2.id}`, { revision: 1 });
  const sb = (await razor.call("GET", `${D}/${cid}/statblock.md`)).body;
  assert.doesNotMatch(sb, /Dodge Scoot/, "a deleted vehicle's contents never show");
  assert.match(sb, /Vehicle unavailable/, "its link shows as unavailable (code review r1 #4)");
  const used = (await razor.call("GET", `${D}/${vid}`)).json().usedBy;
  assert.deepEqual(used.map(u => [u.name, u.bought]), [["Rigger", 2]], "the vehicle page names who bought it, at which revision");
  const edited = (await razor.call("POST", `${D}/${vid}/ops`, { revision: 2, ops: [{ op: "setName", name: "Red" }] })).json();
  assert.equal(edited.usedBy.length, 1, "an edit's answer keeps the users (code review r1 #9)");
  assert.equal((await razor.call("GET", `${D}/${vid}/foundry`)).json().prototypeToken?.name ?? "Red", "Red", "the token follows a rename (r1 #8)");
  assert.equal((await razor.call("POST", `${D}/${cid}/ops`, { revision: 3, ops: [{ op: "detachVehicle", garageId: v2.id }, { op: "attachVehicle", garageId: v2.id }] })).statusCode, 422);
  const v3 = (await razor.call("POST", `${D}/vehicles`, { catalogId: SCOOT })).json().document;
  await razor.call("POST", `${D}/${v3.id}/archive`, { archived: true });
  assert.equal((await razor.call("POST", `${D}/${cid}/ops`, { revision: 3, ops: [{ op: "attachVehicle", garageId: v3.id }] })).statusCode, 422, "archived: not linkable");
  // A "Restricted" vehicle (no list price) stays unbuyable even with a weapon mounted (code review r1 #1).
  const eagle = (await razor.call("POST", `${D}/vehicles`, { catalogId: "sr2e.vehicles.4a3cebff8313eca1" })).json().document;
  assert.equal((await razor.call("POST", `${D}/${eagle.id}/ops`, { revision: 1, ops: [{ op: "mountWeapon", catalogId: HMG, kind: "hardpoint" }] })).statusCode, 200);
  const c3 = (await razor.call("POST", `${D}/characters`, { name: "Rich" })).json().document.id;
  assert.equal((await razor.call("POST", `${D}/${c3}/ops`, { revision: 1, ops: [{ op: "setPriority", category: "resources", letter: "A" }, { op: "buyGarageVehicle", garageId: eagle.id }] })).statusCode, 422);
  // The catalog summaries carry what the mount picker needs (code review r1 #2).
  const hmg = (await razor.call("GET", `/api/catalog/entries?type=weapon&book=sr2&q=hmg`)).json().entries.find(e => e.id === HMG);
  assert.deepEqual([hmg.weaponType, Number(hmg.cost) > 0], ["heavy", true]);
  // A batch can't buy the same vehicle twice.
  const c2 = (await razor.call("POST", `${D}/characters`, { name: "Twice" })).json().document.id;
  assert.equal((await razor.call("POST", `${D}/${c2}/ops`, { revision: 1, ops: [{ op: "setPriority", category: "resources", letter: "A" }, { op: "buyGarageVehicle", garageId: vid }, { op: "buyGarageVehicle", garageId: vid }] })).statusCode, 422);
});
