/** M4b (docs/PLAN-M4b.md): nuyen after creation — buy (R7), sell (R6: refund or fence), income and expenses, undo. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate, undoable } from "../shared/creation.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const core = (name, type) => { const e = catalog.entries.find(x => x.book === "sr2" && x.name === name && x.type === type); assert.ok(e, name); return e.id; };
const op = (b, o, saleMode = "refund") => applyOp(b, o, lookup, { now: 9, saleMode });
const item = (b, name) => b.actor.items.find(i => i.name === name);

/** A finished human with 19,855¥ (the M2d character), built the short way: finish the body directly. */
function finished(nuyen = 20000) {
  const b = newCharacter("Buyer");
  b.creation.finished = { at: 1, leftover: 0, roll: 10, nuyen, karmaPool: 1 };
  b.actor.system.chargen.inProgress = false;
  b.actor.system.nuyen = nuyen;
  return b;
}

test("buy: the price entered is charged and recorded with the street price shown (p.184, R7); short of nuyen refused", () => {
  let b = op(finished(), { op: "buyItem", catalogId: core("Ares Predator", "weapon"), choices: {}, price: 400 });
  const gun = item(b, "Ares Predator");
  assert.deepEqual([b.actor.system.nuyen, gun.flags.sr2e.paid], [19600, 400]);
  assert.match(b.ledger[0].summary, /Bought Ares Predator for 400¥ \(street price 225¥\)/, "list 450 × Street Index .5");
  assert.throws(() => op(b, { op: "buyItem", catalogId: core("Ares Predator", "weapon"), choices: {}, price: 20000 }), /20,000¥ needed, 19,600¥ to spend/);
  assert.throws(() => op(b, { op: "buyItem", catalogId: core("Mana Bolt", "spell"), choices: {}, price: 1 }), /money buys/);
  assert.throws(() => op(newCharacter("New"), { op: "buyItem", catalogId: core("Ares Predator", "weapon"), choices: {}, price: 1 }), /once the character is finished/);
});

test("cyberware bought in play is a spare until surgery: no Essence yet", () => {
  const b = op(finished(), { op: "buyItem", catalogId: core("Datajack", "cyberware"), choices: {}, price: 1000 });
  assert.equal(item(b, "Datajack").system.installed, false);
  assert.equal(validate(b).essence, 6);
});

test("sell: refund pays what was paid; a fence pays 30% of the list value, in steps of 5 (p.188, R6); stale quotes refused", () => {
  const b = op(finished(), { op: "buyItem", catalogId: core("Ares Predator", "weapon"), choices: {}, price: 400 });
  const id = item(b, "Ares Predator")._id;
  const refund = op(b, { op: "sellItem", itemId: id, pct: 30, shownMode: "refund", quoted: 400 });
  assert.deepEqual([refund.actor.system.nuyen, item(refund, "Ares Predator")], [20000, undefined]);
  const fence = op(b, { op: "sellItem", itemId: id, pct: 30, shownMode: "fence", quoted: 135 }, "fence");
  assert.equal(fence.actor.system.nuyen, 19600 + 135, "30% of 450¥");
  assert.equal(op(b, { op: "sellItem", itemId: id, pct: 50, shownMode: "fence", quoted: 225 }, "fence").actor.system.nuyen, 19825);
  assert.throws(() => op(b, { op: "sellItem", itemId: id, pct: 12, shownMode: "fence", quoted: 54 }, "fence"), /steps of 5/);
  assert.throws(() => op(b, { op: "sellItem", itemId: id, pct: 30, shownMode: "refund", quoted: 400 }, "fence"), /changed how selling works/);
  assert.throws(() => op(b, { op: "sellItem", itemId: id, pct: 30, shownMode: "fence", quoted: 999 }, "fence"), /price changed/);
});

test("code review r1: a no-fixed-price entry is refused; a refund sale needs no percentage, a fence sale does; the sheet marks a spare; who made it is recorded", async () => {
  let b = finished();
  assert.throws(() => op(b, { op: "buyItem", catalogId: core("DataSoft", "gear"), choices: {}, price: 0 }), /varies/);
  b = applyOp(b, { op: "buyItem", catalogId: core("Ares Predator", "weapon"), choices: {}, price: 400 }, lookup, { now: 9, by: "razor" });
  assert.equal(b.ledger[0].by, "razor");
  const id = item(b, "Ares Predator")._id;
  assert.equal(op(b, { op: "sellItem", itemId: id, shownMode: "refund", quoted: 400 }).actor.system.nuyen, 20000);
  assert.throws(() => op(b, { op: "sellItem", itemId: id, shownMode: "fence", quoted: 135 }, "fence"), /agreed percentage/);
  b = op(b, { op: "buyItem", catalogId: core("Datajack", "cyberware"), choices: {}, price: 1000 });
  const { sheetModel } = await import("../server/sheet/model.mjs");
  assert.match(sheetModel(b).cyberware.find(r => /Datajack/.test(r[0]))[0], /spare, not installed/);
  assert.ok(sheetModel(b).history.length >= 2);
});

test("income and expenses; undo newest first for every kind, exact or refused", () => {
  let b = op(finished(), { op: "nuyen", amount: 5000, note: "the run" });
  assert.throws(() => op(b, { op: "nuyen", amount: -30000, note: "" }), /Only 25,000¥/);
  b = op(b, { op: "buyItem", catalogId: core("Ares Predator", "weapon"), choices: {}, price: 400 });
  const gunId = item(b, "Ares Predator")._id;
  const changed = structuredClone(b); item(changed, "Ares Predator").system.quantity = 2;
  assert.throws(() => op(changed, { op: "undo", entryId: undoable(changed).id }), /changed since it was bought/);
  b = op(b, { op: "sellItem", itemId: gunId, pct: 30, shownMode: "refund", quoted: 400 });
  b = op(b, { op: "undo", entryId: undoable(b).id });   // the sale: the gun back, the money out
  assert.deepEqual([b.actor.system.nuyen, !!item(b, "Ares Predator")], [24600, true]);
  b = op(b, { op: "undo", entryId: undoable(b).id });   // the purchase: refunded
  assert.deepEqual([b.actor.system.nuyen, !!item(b, "Ares Predator")], [25000, false]);
  b = op(b, { op: "undo", entryId: undoable(b).id });   // the income
  assert.equal(b.actor.system.nuyen, 20000);
  assert.equal(undoable(b), null);
});

test("server: the sale mode is the GM's setting, read in the write; admins only set it; the session carries it", async () => {
  const { testContext, PW } = await import("./helpers.mjs");
  const { buildApp } = await import("../server/app.mjs");
  const { loadConfig } = await import("../server/config.mjs");
  const A = await import("../server/auth/accounts.mjs");
  const t = await testContext(), ORIGIN = "https://hoi.example";
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog: { byId } });
  const person = async (username, secret) => {
    const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret, username, password: PW } });
    const cookie = res.headers["set-cookie"].split(";")[0], csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
    return (method, url, body) => app.inject({ method, url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, ...(method === "GET" ? {} : { "idempotency-key": randomUUID() }) }, ...(body ? { payload: body } : {}) });
  };
  const gm = await person("Boss", (await A.bootstrap(t.ctx)).secret), player = await person("Razor", (await A.createInvite(t.ctx)).secret);
  assert.equal((await player("PUT", "/api/admin/rules", { saleMode: "fence" })).statusCode, 403);
  assert.equal((await gm("PUT", "/api/admin/rules", { saleMode: "fence" })).json().saleMode, "fence");
  assert.equal((await player("GET", "/api/session")).json().rules.saleMode, "fence");
  const id = (await player("POST", "/api/documents/characters", { name: "Seller" })).json().document.id;
  const b = op(finished(), { op: "buyItem", catalogId: core("Ares Predator", "weapon"), choices: {}, price: 400 }), text = JSON.stringify(b);
  await t.ctx.db.updateTable("documents").set({ body: text, bytes: Buffer.byteLength(text) }).where("id", "=", id).execute();
  const gunId = item(b, "Ares Predator")._id;
  const asRefund = await player("POST", `/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "sellItem", itemId: gunId, pct: 30, shownMode: "refund", quoted: 400 }] });
  assert.equal(asRefund.json().code, "refused", "the client can't choose the refund");
  const asFence = await player("POST", `/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "sellItem", itemId: gunId, pct: 30, shownMode: "fence", quoted: 135 }] });
  assert.equal(asFence.json().body.actor.system.nuyen, 19600 + 135);
  await app.close();
});
