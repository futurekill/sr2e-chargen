/** The Workshop (docs/PLAN-workshop.md): vehicles designed from scratch with Rigger 2's rules, the system's own engine. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { buildCatalog, vehicleSources, designTables } from "../tools/build-catalog.mjs";
import { entryOf } from "../server/catalog.mjs";
import { newCharacter, applyOp } from "../shared/creation.mjs";
import { newDesignedVehicle, newVehicle, applyVehicleOp, vehiclePrice, vehicleActor, vehicleBooks, designResult } from "../shared/vehicle.mjs";
import { blankDesign, workshopUpdate, designVehicle } from "../shared/rules.mjs";
import { testContext, PW } from "./helpers.mjs";
import { buildApp } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import * as A from "../server/auth/accounts.mjs";

const root = new URL("../", import.meta.url);
const pins = JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir = new URL("content", root).pathname;
const built = buildCatalog({ pins, contentDir }), tables = designTables({ pins, contentDir });
const catalog = { byId: new Map(built.entries.map(e => [e.id, e])), vehicles: new Map(Object.entries(vehicleSources({ pins, contentDir }))),
  index: built.entries.map(e => ({ e, hay: `${e.name}\n${(e.category ?? []).join("\n")}`.toLowerCase() })), manifest: { books: built.books }, design: { ...tables, etag: '"t"' } };
const lookup = (id) => entryOf(catalog, id);
const DBW = "sr2e-rigger-2.r2-vehicle-mods.1536f4089f7e6eac", SUSP = "sr2e-rigger-2.r2-vehicle-mods.ad60619ac88032f4";
const VALIANT = "sr2e.weapons.8ee88fc80bdff8f4";
const op = (b, o) => applyVehicleOp(b, o, lookup, { tables });
const sedan = (o = {}) => ({ ...blankDesign(), chassisKey: "sedan", powerPlantKey: "gasoline-cars-sedan", ...o });

test("the tables come from the pinned Rigger 2 copy, keyed like Foundry's registry", () => {
  assert.ok(tables.chassis.sedan && tables.powerPlants["gasoline-cars-sedan"] && tables.fuel && tables.markUp);
  assert.equal(tables.pin.dir, "sr2e-rigger-2");
});

test("a new design is a draft that still exports a reopenable v2 design; finished once it has a chassis and a plant", () => {
  let b = newDesignedVehicle(tables, "Shadow Sedan");
  assert.equal(b.actor.system.design.version, 2);
  assert.equal(b.actor.system.design.baseVersion, 2);
  assert.deepEqual(b.actor.system.design.choices, blankDesign());
  assert.equal(vehiclePrice(b, tables).unfinished, true);
  assert.equal(vehicleActor(b).type, "vehicle");
  b = op(b, { op: "setDesign", design: sedan({ speed: 10 }) });
  const r = designVehicle(sedan({ speed: 10 }), tables, { mods: [] });
  assert.equal(r.valid, true, JSON.stringify(r.problems));
  const want = workshopUpdate(sedan({ speed: 10 }), r, tables.chassis.sedan, tables.powerPlants["gasoline-cars-sedan"], "Shadow Sedan");
  assert.equal(b.actor.system.speed, want["system.speed"]);
  assert.equal(b.actor.system.cost, r.price);
  assert.equal(b.actor.system.design.chassisKey, "sedan");
  assert.deepEqual(vehiclePrice(b, tables), { total: r.price, vehicle: r.price, points: 0, weapons: 0, cargo: 0, unfinished: false, problems: [] });
});

test("setDesign refuses a misshapen design at the trust boundary", () => {
  const b = newDesignedVehicle(tables);
  for (const [d, re] of [[{ ...sedan(), evil: 1 }, /evil isn't a design field/], [sedan({ speed: "9" }), /speed must be/],
    [sedan({ chassisKey: "tank" }), /Chassis Table/], [sedan({ gmDP: 50 }), /no gamemaster/],
    [sedan({ dbwSplit: { acceleration: 5, speed: 5, load: 0 } }), /needs a drive-by-wire/]]) {
    assert.throws(() => op(b, { op: "setDesign", design: d }), re);
  }
  assert.throws(() => op(newVehicle(lookup("sr2e.vehicles.c9330e180d1d7e0e")), { op: "setDesign", design: sedan() }), /comes from the catalog/);
  assert.throws(() => applyVehicleOp(b, { op: "setDesign", design: sedan() }, lookup, { tables: null }), /no Rigger 2 design tables/);
});

test("a rating bought below 0 is unfinished, and can't be bought", () => {
  const b = op(newDesignedVehicle(tables), { op: "setDesign", design: sedan({ speed: -1000 }) });
  const p = vehiclePrice(b, tables);
  assert.equal(p.unfinished, true);
  assert.ok(p.problems.some(x => x.code === "speedNegative"));
});

test("design mods: added, rated, the DBW split on the item, restrictions, removal", () => {
  let b = op(newDesignedVehicle(tables), { op: "setDesign", design: sedan() });
  assert.throws(() => op(newDesignedVehicle(tables), { op: "addDesignMod", catalogId: DBW, rating: 1 }), /chassis and a power plant first/);
  b = op(b, { op: "addDesignMod", catalogId: DBW, rating: 2 });
  const dbw = b.actor.items.find(i => i.flags.sr2e.designMod);
  assert.equal(dbw.system.rating, 2);
  assert.deepEqual(dbw.system.custom.choice, { acceleration: 10, speed: 0, load: 0 }, "the Workshop's default split");
  assert.throws(() => op(b, { op: "addDesignMod", catalogId: SUSP, rating: 1 }), /can't be combined with drive-by-wire/);
  assert.throws(() => op(b, { op: "setDesignMod", itemId: dbw._id, rating: 4 }), /over the maximum 3/);
  b = op(b, { op: "setDesignMod", itemId: dbw._id, rating: 3 });
  b = op(b, { op: "setDesign", design: sedan({ dbwSplit: { acceleration: 4, speed: 6, load: 0 } }) });
  assert.deepEqual(b.actor.items.find(i => i._id === dbw._id).system.custom.choice, { acceleration: 4, speed: 6, load: 0 });
  const r = designResult(b, tables);
  assert.ok(r.dpLines.some(l => /Drive-by-Wire/.test(l.label)), "the mod's Design Points are in the design");
  assert.deepEqual(vehicleBooks(b), ["r2"]);
  b = op(b, { op: "removeDesignMod", itemId: dbw._id });
  assert.equal(b.actor.items.length, 0);
  assert.equal(b.design.choices.dbwSplit, undefined, "the split goes with its system");
  assert.throws(() => op(b, { op: "mountWeapon", catalogId: VALIANT, kind: "firmpoint" }), /comes later/);
});

test("cargo and art survive every rebuild", () => {
  let b = op(newDesignedVehicle(tables), { op: "setDesign", design: sedan() });
  const gear = built.entries.find(e => e.book === "sr2" && e.type === "gear" && Number(e.system?.cost) > 0);
  b = op(b, { op: "addGear", catalogId: gear.id, quantity: 2 });
  const art = tables.chassis.sedan.art?.img ?? null;
  b = op(b, { op: "setDesign", design: sedan({ cargo: 1 }) });
  b = op(b, { op: "setName", name: "Renamed" });
  assert.equal(b.actor.items.filter(i => i.flags.sr2e.cargo).length, 1);
  assert.equal(b.actor.name, "Renamed");
  if (art) assert.equal(b.actor.img, art);
  assert.equal(vehiclePrice(b, tables).cargo, 2 * Number(gear.system.cost));
});

test("buying a design needs it finished and its books on the character; they stay in use", () => {
  const b = op(newDesignedVehicle(tables), { op: "setDesign", design: sedan() });
  const gid = randomUUID(), p = vehiclePrice(b, tables);
  const garage = (id) => (id === gid ? { name: b.name, revision: 2, source: vehicleActor(b), price: p.total, unfinished: p.unfinished, books: vehicleBooks(b) } : null);
  let c = applyOp(newCharacter("Rigger"), { op: "setPriority", category: "resources", letter: "A" }, lookup);
  assert.throws(() => applyOp(c, { op: "buyGarageVehicle", garageId: gid }, lookup, { garage }), /needs r2 turned on/);
  const catalogBooks = built.books.map(x => x.key);
  c = applyOp(c, { op: "setBooks", books: ["r2"] }, lookup, { catalogBooks });
  c = applyOp(c, { op: "buyGarageVehicle", garageId: gid }, lookup, { garage });
  assert.equal(c.actor.system.chargen.vehicles[0].cost, p.total);
  assert.throws(() => applyOp(c, { op: "setBooks", books: [] }, lookup, { catalogBooks }), /comes from r2/);
  const draft = newDesignedVehicle(tables), dp = vehiclePrice(draft, tables);
  const g2 = (id) => (id === gid ? { name: "Draft", revision: 1, source: vehicleActor(draft), price: dp.total, unfinished: dp.unfinished, books: ["r2"] } : null);
  assert.throws(() => applyOp(applyOp(newCharacter("X"), { op: "setBooks", books: ["r2"] }, lookup, { catalogBooks }), { op: "buyGarageVehicle", garageId: gid }, lookup, { garage: g2 }), /unfinished design/);
});

/* ── Through the server ─────────────────────────────────────────────────────────────────────────────────────── */
const ORIGIN = "https://hoi.example", D = "/api/documents";
test("library: design from scratch, the tables route, ops with their route schemas, the Foundry export", async () => {
  const t = await testContext();
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog });
  const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret: (await A.bootstrap(t.ctx)).secret, username: "Boss", password: PW } });
  const cookie = res.headers["set-cookie"].split(";")[0];
  const csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
  const call = (method, url, body, extra = {}) => app.inject({ method, url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, ...(method === "GET" ? {} : { "idempotency-key": randomUUID() }), ...extra }, ...(body !== undefined ? { payload: body } : {}) });
  const tbl = await call("GET", "/api/catalog/design-tables");
  assert.equal(tbl.statusCode, 200);
  assert.ok(tbl.json().chassis.sedan && !("etag" in tbl.json()));
  assert.equal((await call("GET", "/api/catalog/design-tables", undefined, { "if-none-match": '"t"' })).statusCode, 304);
  const made = await call("POST", `${D}/vehicles`, { design: true, name: "Ghost" });
  assert.equal(made.statusCode, 200, made.body);
  const vid = made.json().document.id;
  assert.equal((await call("POST", `${D}/vehicles`, { design: true, catalogId: "x" })).statusCode, 400, "one shape or the other");
  let r = await call("POST", `${D}/${vid}/ops`, { revision: 1, ops: [{ op: "setDesign", design: sedan() }, { op: "addDesignMod", catalogId: DBW, rating: 1 }] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await call("POST", `${D}/${vid}/ops`, { revision: 2, ops: [{ op: "setDesign", design: { a: { b: { c: { d: 1 } } } } }] })).statusCode, 400, "deeper than the route allows");
  assert.equal((await call("POST", `${D}/${vid}/ops`, { revision: 2, ops: [{ op: "setDesign", design: { ...sedan(), extra: 1 } }] })).statusCode, 422);
  const foundry = (await call("GET", `${D}/${vid}/foundry`)).json();
  assert.equal(foundry.system.design.version, 2);
  assert.equal(foundry.items[0].flags.sr2e.designMod, true);
  assert.equal(foundry.name, "Ghost");
  await app.close();
});

test("the sheet row shows a design's EFFECTIVE stats (its mods applied), as Foundry does", async () => {
  const { sheetModel } = await import("../server/sheet/model.mjs");
  let b = op(newDesignedVehicle(tables), { op: "setDesign", design: sedan() });
  b = op(b, { op: "addDesignMod", catalogId: DBW, rating: 2 });
  const base = b.actor.system.handling;
  const m = sheetModel({ ...applyOp(newCharacter("R"), { op: "setPriority", category: "resources", letter: "A" }, lookup), _linked: [{ garageId: "g", source: vehicleActor(b) }] });
  assert.match(m.vehicles[0][1], new RegExp(`^Hand ${base - 2} `), "drive-by-wire 2 takes 2 off the Handling");
});

test("the rebuilt actor is EXACTLY the Workshop's update + the chassis art, the design mods and the cargo (code review r1 #5)", async () => {
  const { chassisArt } = await import("../shared/rules.mjs");
  let b = op(newDesignedVehicle(tables, "Exact"), { op: "setDesign", design: sedan({ speed: 5, cargo: 2 }) });
  b = op(b, { op: "addDesignMod", catalogId: DBW, rating: 1 });
  const r = designResult(b, tables), want = { name: "Exact", type: "vehicle", img: "icons/svg/car.svg", system: {}, items: [], effects: [], flags: {}, prototypeToken: { name: "Exact" } };
  const set = (o, path, v) => { const k = path.split("."), last = k.pop(); let t = o; for (const x of k) t = (t[x] ??= {}); t[last] = v; };
  for (const [k, v] of Object.entries({ "system.design.version": 2, "system.design.baseVersion": 2, "system.design.choices": b.design.choices,
    ...workshopUpdate(b.design.choices, r, tables.chassis.sedan, tables.powerPlants["gasoline-cars-sedan"], "Exact"), ...(chassisArt(tables.chassis.sedan) ?? {}) })) set(want, k, v);
  const { items, ...rest } = b.actor, wantRest = { ...want }; delete wantRest.items;
  assert.deepEqual(rest, wantRest);
  const e = lookup(DBW);
  assert.deepEqual(items, [{ name: e.name, type: "vehicle_mod", img: e.img ?? null,
    system: { ...e.system, rating: 1, custom: { ...e.system.custom, choice: { acceleration: 10, speed: 0, load: 0 } } },
    flags: { sr2e: { catalogId: DBW, designMod: true } }, _stats: { compendiumSource: e.uuid }, _id: "gv00000000000001" }], "the whole design mod item");
});

test("removing one of two drive-by-wire systems keeps the split on the other (code review r1 #3)", () => {
  let b = op(newDesignedVehicle(tables), { op: "setDesign", design: sedan() });
  b = op(b, { op: "addDesignMod", catalogId: DBW, rating: 1 });
  b = op(b, { op: "addDesignMod", catalogId: DBW, rating: 1 });
  b = op(b, { op: "setDesign", design: sedan({ dbwSplit: { acceleration: 4, speed: 6, load: 0 } }) });
  const [first, second] = b.actor.items;
  b = op(b, { op: "removeDesignMod", itemId: first._id });
  assert.deepEqual(b.design.choices.dbwSplit, { acceleration: 4, speed: 6, load: 0 });
  assert.deepEqual(b.actor.items.find(i => i._id === second._id).system.custom.choice, { acceleration: 4, speed: 6, load: 0 });
});
