/** M4c (docs/PLAN-M4c.md): damage, ammunition and cybersurgery after creation. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate, undoable, surgeryPreview } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";
import { essenceOf } from "../shared/purchase.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const core = (name, type) => { const e = catalog.entries.find(x => x.book === "sr2" && x.name === name && x.type === type); assert.ok(e, name); return e.id; };
const op = (b, o) => applyOp(b, o, lookup, { now: 9, saleMode: "refund" });
const item = (b, name) => b.actor.items.find(i => i.name === name);
const cm = (b) => b.actor.system.conditionMonitor;
function finished(nuyen = 1_000_000) {
  const b = newCharacter("Patient");
  b.creation.finished = { at: 1, leftover: 0, roll: 10, nuyen, karmaPool: 1 };
  b.actor.system.chargen.inProgress = false;
  b.actor.system.nuyen = nuyen;
  b.actor.system.conditionMonitor = { physical: { value: 0, max: 10, overflow: 0 }, stun: { value: 0, max: 10, overflow: 0 }, overflow: 0 };   // as finish writes it
  return b;
}
const buy = (b, name) => op(b, { op: "buyItem", catalogId: core(name, "cyberware"), choices: {}, price: 1000 });

test("damage: Stun past 10 rolls into Physical, Physical past 10 into overflow (p.112); healing takes the overflow first", () => {
  let b = op(finished(), { op: "damage", track: "stun", boxes: 12 });
  assert.deepEqual([cm(b).stun.value, cm(b).physical.value, cm(b).overflow], [10, 2, 0]);
  b = op(b, { op: "damage", track: "physical", boxes: 10 });
  assert.deepEqual([cm(b).physical.value, cm(b).overflow], [10, 2]);
  b = op(b, { op: "heal", track: "physical", boxes: 3 });
  assert.deepEqual([cm(b).physical.value, cm(b).overflow], [9, 0]);
  b = op(b, { op: "heal", track: "stun", boxes: 20 });
  assert.equal(cm(b).stun.value, 0);
  assert.throws(() => op(b, { op: "damage", track: "mana", boxes: 1 }), /Physical or Stun/);
  assert.throws(() => op(b, { op: "damage", track: "stun", boxes: 21 }), /1 to 20/);
  assert.throws(() => op(newCharacter("New"), { op: "damage", track: "stun", boxes: 1 }), /once the character is finished/);
});

test("ammunition: rounds used come off the box; not below 0; only ammunition", () => {
  let b = op(finished(), { op: "buyItem", catalogId: core("Regular Ammo", "ammo"), choices: {}, price: 20 });
  const id = item(b, "Regular Ammo")._id;
  b = op(b, { op: "useAmmo", itemId: id, rounds: 4 });
  assert.equal(item(b, "Regular Ammo").system.quantity, 6);
  assert.throws(() => op(b, { op: "useAmmo", itemId: id, rounds: 7 }), /Only 6 left/);
  b = buy(b, "Datajack");
  assert.throws(() => op(b, { op: "useAmmo", itemId: item(b, "Datajack")._id, rounds: 1 }), /isn't ammunition/);
});

test("surgery: a Datajack at 2 successes is Minor Invasive, an M wound and 5,000¥; 0 → +15%, 4 → −10% (Cybertechnology p.53, core p.114)", () => {
  let b = buy(finished(), "Datajack");
  const id = item(b, "Datajack")._id;
  assert.deepEqual([surgeryPreview(b, id, 0).cost, surgeryPreview(b, id, 4).cost], [0.23, 0.18]);
  const pv = surgeryPreview(b, id, 2);
  assert.deepEqual([pv.pct, pv.cost, pv.end, pv.tn, pv.category.key], [0, 0.2, 5.8, 3, "minor"], "TN 10 − 5 − 2 (intensive care)");
  const nuyen = b.actor.system.nuyen;
  b = op(b, { op: "installWare", itemId: id, successes: 2 });
  assert.deepEqual([item(b, "Datajack").system.installed, b.actor.system.nuyen, cm(b).physical.value], [true, nuyen - 5000, 3]);
  assert.equal(derive({ actor: b.actor }).essence, 5.8);
  assert.throws(() => op(b, { op: "sellItem", itemId: id, shownMode: "refund", quoted: 1000 }), /surgery, not a sale/);
  // Undo: exact while nothing changed since; refused once the wound has healed.
  const healed = op(b, { op: "heal", track: "physical", boxes: 1 });
  assert.throws(() => op(healed, { op: "undo", entryId: undoable(healed).id }), /changed since the surgery/);
  b = op(b, { op: "undo", entryId: undoable(b).id });
  assert.deepEqual([item(b, "Datajack").system.installed, b.actor.system.nuyen, cm(b).physical.value], [false, nuyen, 0]);
  assert.equal(item(b, "Datajack").system.surgeryEssencePct, undefined, "the implant exactly as it was");
  // A character finished before M4c has no monitor: the undo takes the one the surgery made away again (code review r1).
  let old = buy(finished(), "Datajack"); delete old.actor.system.conditionMonitor;
  const plain = structuredClone(old.actor);
  old = op(old, { op: "installWare", itemId: item(old, "Datajack")._id, successes: 2 });
  old = op(old, { op: "undo", entryId: undoable(old).id });
  assert.deepEqual(old.actor, plain);
});

test("surgery: no fee and no wound when the player says so; the adjusted cost picks the category; below 0 Essence refused", () => {
  let b = buy(finished(), "Datajack");
  const nuyen = b.actor.system.nuyen;
  b = op(b, { op: "installWare", itemId: item(b, "Datajack")._id, successes: 0, fee: false, wound: false });
  assert.deepEqual([b.actor.system.nuyen, cm(b).physical.value, derive({ actor: b.actor }).essence], [nuyen, 0, 5.77]);
  // Muscle Replacement 4 beside a full cyberarm costs 4 × .8 = 3.2 Essence (Cybertechnology p.57, Foundry's limbDiscount).
  b = buy(b, "Cyberarm (Full)"); b = op(b, { op: "installWare", itemId: item(b, "Cyberarm (Full)")._id, successes: 2, fee: false, wound: false });
  b = buy(b, "Muscle Replacement (Rating 4)");
  const mr = item(b, "Muscle Replacement (Rating 4)")._id;
  assert.equal(surgeryPreview(b, mr, 2).cost, 3.2);
  assert.equal(surgeryPreview(b, mr, 2).category.key, "drastic");
  b = op(b, { op: "installWare", itemId: mr, successes: 2, fee: false, wound: false });
  assert.equal(essenceOf(item(b, "Muscle Replacement (Rating 4)"), b.actor.items), 3.2);
  b = buy(b, "Muscle Replacement (Rating 3)");
  assert.throws(() => op(b, { op: "installWare", itemId: item(b, "Muscle Replacement (Rating 3)")._id, successes: 2 }), /below 0 Essence/);
  assert.deepEqual(validate(b).problems.filter(p => p.level === "error"), []);
});

test("server: the request schema bounds the new ops; fee and wound are optional", async () => {
  const { testContext, PW } = await import("./helpers.mjs");
  const { buildApp } = await import("../server/app.mjs");
  const { loadConfig } = await import("../server/config.mjs");
  const A = await import("../server/auth/accounts.mjs");
  const { randomUUID } = await import("node:crypto");
  const t = await testContext(), ORIGIN = "https://hoi.example";
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog: { byId } });
  const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret: (await A.bootstrap(t.ctx)).secret, username: "Boss", password: PW } });
  const cookie = res.headers["set-cookie"].split(";")[0], csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
  const call = (url, body) => app.inject({ method: "POST", url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "idempotency-key": randomUUID() }, payload: body });
  const id = (await call("/api/documents/characters", { name: "Patient" })).json().document.id;
  const b = buy(finished(), "Datajack"), text = JSON.stringify(b);
  await t.ctx.db.updateTable("documents").set({ body: text, bytes: Buffer.byteLength(text) }).where("id", "=", id).execute();
  assert.equal((await call(`/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "damage", track: "stun", boxes: 21 }] })).statusCode, 400);
  assert.equal((await call(`/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "installWare", itemId: item(b, "Datajack")._id, successes: 31 }] })).statusCode, 400);
  const ok = (await call(`/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "installWare", itemId: item(b, "Datajack")._id, successes: 2 }] })).json();
  assert.equal(ok.body.actor.system.conditionMonitor.physical.value, 3);
  await app.close();
});
