/** Vehicles after creation (docs/PLAN-play-vehicles.md, R21): bought and sold with nuyen, ledger and undo. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { buildCatalog, vehicleSources } from "../tools/build-catalog.mjs";
import { entryOf, searchCatalog } from "../server/catalog.mjs";
import { newCharacter, applyOp, undoable, garagePurchases } from "../shared/creation.mjs";
import { newVehicle, vehicleActor, vehiclePrice, vehicleBooks } from "../shared/vehicle.mjs";
import { testContext, PW } from "./helpers.mjs";
import { buildApp } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import * as A from "../server/auth/accounts.mjs";
import { decodeBody } from "../server/library.mjs";

const root = new URL("../", import.meta.url);
const pins = JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir = new URL("content", root).pathname;
const built = buildCatalog({ pins, contentDir });
const catalog = { byId: new Map(built.entries.map(e => [e.id, e])), vehicles: new Map(Object.entries(vehicleSources({ pins, contentDir }))),
  index: built.entries.map(e => ({ e, hay: `${e.name}\n${(e.category ?? []).join("\n")}`.toLowerCase() })), manifest: { books: built.books } };
const lookup = (id) => entryOf(catalog, id);
const core = (name) => built.entries.find(e => e.book === "sr2" && e.type === "vehicle" && e.name === name).id;
const AMERICAR = core("Ford Americar"), SCOOT = core("Dodge Scoot");
const op = (b, o, ctx = {}) => applyOp(b, o, lookup, { now: 9, saleMode: "refund", ...ctx });
function finished(nuyen = 50000) {
  const b = newCharacter("Driver");
  b.creation.finished = { at: 1, leftover: 0, roll: 10, nuyen, karmaPool: 1 };
  b.actor.system.chargen.inProgress = false;
  b.actor.system.nuyen = nuyen;
  return b;
}

test("buy a core vehicle in play: the agreed price charged, the p.264 street price shown; the creation receipts don't move", () => {
  let b = finished();
  const receipts = structuredClone(b.actor.system.chargen.vehicles ?? []);
  b = op(b, { op: "buyVehicle", catalogId: AMERICAR, price: 18000 });
  const [key] = Object.keys(b.vehicles);
  assert.equal(key, "w00001");
  assert.deepEqual([b.actor.system.nuyen, b.vehicles[key].paid, b.vehicles[key].listValue], [32000, 18000, 20000]);
  assert.match(b.ledger.at(-1).summary, /Bought Ford Americar for 18,000¥ \(street price 20,000¥\)/, "20,000¥: Street Index 1");
  b = op(b, { op: "buyVehicle", catalogId: SCOOT, price: 1500 });
  assert.match(b.ledger.at(-1).summary, /street price 1,500¥/, "2,000¥: Street Index .75");
  assert.deepEqual(b.actor.system.chargen.vehicles ?? [], receipts, "play purchases aren't chargen receipts");
  assert.throws(() => op(b, { op: "buyVehicle", catalogId: AMERICAR, price: 999999 }), /needed/);
  assert.throws(() => op(b, { op: "buyVehicle", price: 1 }), /one of the two/);
  assert.throws(() => op(b, { op: "buyVehicle", catalogId: AMERICAR, garageId: randomUUID(), price: 1 }), /one of the two/);
  assert.throws(() => op(newCharacter("New"), { op: "buyVehicle", catalogId: AMERICAR, price: 1 }), /once the character is finished/);
});

test("sell: refund = what was paid; fence = the percentage of the LIST value, not the negotiated price; stale mode or quote refused", () => {
  const b = op(finished(), { op: "buyVehicle", catalogId: AMERICAR, price: 15000 });
  const refund = op(b, { op: "sellVehicle", vehicleKey: "w00001", shownMode: "refund", quoted: 15000 });
  assert.deepEqual([refund.actor.system.nuyen, Object.keys(refund.vehicles)], [50000, []]);
  const fence = op(b, { op: "sellVehicle", vehicleKey: "w00001", pct: 30, shownMode: "fence", quoted: 6000 }, { saleMode: "fence" });
  assert.equal(fence.actor.system.nuyen, 35000 + 6000, "30% of 20,000¥");
  assert.throws(() => op(b, { op: "sellVehicle", vehicleKey: "w00001", shownMode: "refund", quoted: 15000 }, { saleMode: "fence" }), /GM changed/);
  assert.throws(() => op(b, { op: "sellVehicle", vehicleKey: "w00001", pct: 30, shownMode: "fence", quoted: 4500 }, { saleMode: "fence" }), /price changed/);
  assert.throws(() => op(b, { op: "sellVehicle", vehicleKey: "w00009", shownMode: "refund", quoted: 1 }), /No such vehicle/);
});

test("a vehicle's whole price may pass the gear cap: bought and fenced above 10,000,000¥ (code review r1 #1)", () => {
  const gid = randomUUID(), v = newVehicle(lookup(AMERICAR), "Treasure Truck");
  const garage = (id) => (id === gid ? { name: v.name, revision: 1, source: vehicleActor(v), price: 34700000, unfinished: false, books: [] } : null);
  let b = op(finished(40000000), { op: "buyVehicle", garageId: gid, price: 30000000 }, { garage });
  b = op(b, { op: "sellVehicle", vehicleKey: "w00001", pct: 50, shownMode: "fence", quoted: 17350000 }, { saleMode: "fence" });
  assert.equal(b.actor.system.nuyen, 10000000 + 17350000);
});

test("undo: the latest buy or sale, each its own inverse; a sold vehicle comes back from the ledger snapshot", () => {
  let b = op(finished(), { op: "buyVehicle", catalogId: AMERICAR, price: 15000 });
  const undone = op(b, { op: "undo", entryId: undoable(b).id });
  assert.deepEqual([undone.actor.system.nuyen, Object.keys(undone.vehicles)], [50000, []]);
  const snap = structuredClone(b.vehicles.w00001);
  b = op(b, { op: "sellVehicle", vehicleKey: "w00001", shownMode: "refund", quoted: 15000 });
  b = op(b, { op: "undo", entryId: undoable(b).id });
  assert.deepEqual([b.actor.system.nuyen, b.vehicles.w00001], [35000, snap]);
  b = op(b, { op: "buyVehicle", catalogId: SCOOT, price: 1500 });
  assert.equal(Object.keys(b.vehicles).at(-1), "w00002", "keys are never reused");
});

test("a garage vehicle in play: read in the transaction, held once across both stores, bought again after a sale; its books stay in use; a sale undoes without the garage", () => {
  const gid = randomUUID(), v = newVehicle(lookup(AMERICAR), "Shadow Car"), p = vehiclePrice(v);
  let garageNow = { name: v.name, revision: 3, source: vehicleActor(v), price: p.total, unfinished: false, books: ["r2"] };
  const garage = (id) => (id === gid ? garageNow : null);
  let b = finished();
  assert.throws(() => op(b, { op: "buyVehicle", garageId: gid, price: 100 }, { garage }), /needs r2 turned on/);
  b.creation.options.books = ["r2"];
  b = op(b, { op: "buyVehicle", garageId: gid, price: 19000 }, { garage });
  assert.deepEqual([b.vehicles.w00001.garageRevision, b.vehicles.w00001.listValue, [...garagePurchases(b)]], [3, p.total, [gid]]);
  assert.throws(() => op(b, { op: "buyVehicle", garageId: gid, price: 1 }, { garage }), /already bought/);
  assert.throws(() => op(b, { op: "setBooks", books: [] }, { catalogBooks: built.books.map(x => x.key) }), /comes from r2/);
  b = op(b, { op: "sellVehicle", vehicleKey: "w00001", shownMode: "refund", quoted: 19000 });
  garageNow = null;   // archived or deleted since: the undo doesn't read the garage
  const back = op(b, { op: "undo", entryId: undoable(b).id }, { garage });
  assert.equal(back.vehicles.w00001.source.name, "Shadow Car");
  garageNow = { name: v.name, revision: 4, source: vehicleActor(v), price: p.total, unfinished: false, books: ["r2"] };
  const again = op(b, { op: "buyVehicle", garageId: gid, price: 19000 }, { garage });
  assert.equal(again.vehicles.w00002.garageRevision, 4, "a sold copy may be bought again");
  assert.deepEqual(vehicleBooks(v), []);
});

/* ── Through the server ─────────────────────────────────────────────────────────────────────────────────────── */
const ORIGIN = "https://hoi.example", D = "/api/documents";
test("library: the play catalog offers priced core vehicles; a play vehicle exports by its w key with a collision-free name; the garage page names the play buyer", async () => {
  assert.ok(searchCatalog({ ...catalog, offers: {} }, { types: ["vehicle"], books: ["sr2"], offerable: "play", limit: 100 }).entries.some(e => e.id === AMERICAR));
  const t = await testContext();
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog });
  const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret: (await A.bootstrap(t.ctx)).secret, username: "Boss", password: PW } });
  const cookie = res.headers["set-cookie"].split(";")[0];
  const csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
  const call = (method, url, body) => app.inject({ method, url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, ...(method === "GET" ? {} : { "idempotency-key": randomUUID() }) }, ...(body !== undefined ? { payload: body } : {}) });
  const vid = (await call("POST", `${D}/vehicles`, { catalogId: SCOOT, name: "Garage Scoot" })).json().document.id;
  const cid = (await call("POST", `${D}/characters`, { name: "Driver" })).json().document.id;
  // Finish it the short way, through the database (the creation flow is tested elsewhere).
  const row = await t.ctx.db.selectFrom("documents").select(["body"]).where("id", "=", cid).executeTakeFirst();
  const body = decodeBody(row.body);   // a JSON column on Postgres, text elsewhere
  Object.assign(body.creation, { finished: { at: 1, leftover: 0, roll: 10, nuyen: 50000, karmaPool: 1 } });
  body.actor.system.chargen.inProgress = false; body.actor.system.nuyen = 50000;
  await t.ctx.db.updateTable("documents").set({ body: JSON.stringify(body) }).where("id", "=", cid).execute();
  let r = await call("POST", `${D}/${cid}/ops`, { revision: 1, ops: [{ op: "buyVehicle", garageId: vid, price: 1000 }, { op: "buyVehicle", catalogId: SCOOT, price: 1500 }] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await call("POST", `${D}/${cid}/ops`, { revision: 2, ops: [{ op: "buyVehicle", catalogId: SCOOT, garageId: vid, price: 1 }] })).statusCode, 422);
  const exp = await call("GET", `${D}/${cid}/foundry/vehicles/w00002`);
  assert.equal(exp.statusCode, 200);
  assert.equal(exp.json().name, "Dodge Scoot");
  assert.match(exp.headers["content-disposition"], new RegExp(`Dodge-Scoot-${cid}-w00002\\.json`));
  assert.equal((await call("GET", `${D}/${cid}/foundry/vehicles/w00009`)).statusCode, 404);
  assert.deepEqual((await call("GET", `${D}/${vid}`)).json().usedBy.map(u => [u.name, u.bought]), [["Driver", 1]]);
  r = await call("POST", `${D}/${cid}/ops`, { revision: 2, ops: [{ op: "sellVehicle", vehicleKey: "w00002", shownMode: "refund", quoted: 1500 }] });
  assert.equal(r.statusCode, 200, r.body);
  await app.close();
});
