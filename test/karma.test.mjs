/** M4a (docs/PLAN-M4a.md): Karma after creation — awards, advancement, the ledger and undo, on the REAL catalog. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate, karmaOptions, undoable } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const core = (name, type) => { const e = catalog.entries.find(x => x.book === "sr2" && x.name === name && x.type === type); assert.ok(e, name); return e.id; };
const run = (b, ops) => ops.reduce((x, op) => applyOp(x, op, lookup, { now: 7 }), b);
const idOf = (b, name) => b.actor.items.find(i => i.name === name)._id;
const skill = (b, name) => b.actor.items.find(i => i.name === name).system;

/** The M2d test's complete street samurai, finished (the roll fixed). */
function finished() {
  let b = run(newCharacter("Vet"), [
    ...Object.entries({ attributes: "A", skills: "B", resources: "C", magic: "D", race: "E" }).map(([category, letter]) => ({ op: "setPriority", category, letter })),
    ...["body", "quickness", "strength", "charisma", "intelligence", "willpower"].map(attr => ({ op: "setAttribute", attr, base: 5 })),
    ...["Firearms", "Etiquette", "Athletics", "Stealth", "Car", "English"].map(n => ({ op: "addSkill", catalogId: core(n, "skill") })),
    { op: "addItem", catalogId: core("Fixer", "contact") }, { op: "addItem", catalogId: core("Street Doc", "contact") }]);
  const rec = (name) => Object.entries(b.creation.items).find(([, r]) => r.name === name)[0];
  for (const n of ["Firearms", "Etiquette", "Athletics", "Stealth", "Car"]) b = applyOp(b, { op: "setSkill", itemId: rec(n), allocated: 6, concentration: "", specialization: "", freeLanguage: "" }, lookup);
  b = applyOp(b, { op: "setSkill", itemId: rec("English"), allocated: 0, concentration: "", specialization: "", freeLanguage: "native" }, lookup);
  return applyOp(b, { op: "finish" }, lookup, { roll: 10, now: 1 });
}

test("before finishing, Karma ops are refused; finishing freezes the skill ratings", () => {
  assert.throws(() => applyOp(newCharacter("New"), { op: "awardKarma", amount: 5, note: "" }, lookup), /after the character is finished/);
  const b = finished();
  assert.ok(b.actor.items.filter(i => i.type === "skill").every(i => i.system.ratingsFinalized === true));
});

test("award 10 → Total 10, Good Karma 9, Pool 2 (1 + one-tenth); the rules check stays clean in play", () => {
  const b = run(finished(), [{ op: "awardKarma", amount: 10, note: "Bug City run" }]);
  assert.deepEqual([b.actor.system.karma.total, b.actor.system.karma.current], [10, 9]);
  assert.equal(derive({ actor: b.actor }).karmaPool, 2);
  assert.deepEqual(b.ledger.map(e => [e.kind, e.note, e.at]), [["award", "Bug City run", 7]]);
  assert.deepEqual(validate(b).problems, []);
});

test("advancement at the book's prices: Strength 5 → 6 = 6; Firearms 6 → 7 = 14; a new Concentration from 6 = 11; a new skill = 1; short Karma refused", () => {
  let b = run(finished(), [{ op: "awardKarma", amount: 40, note: "" }]);   // Pool 1 + 4: 36 Good Karma
  assert.equal(b.actor.system.karma.current, 36);
  b = run(b, [{ op: "spendKarma", target: { attribute: "strength" } }]);
  assert.deepEqual([b.actor.system.strength.base, b.actor.system.karma.current], [6, 30]);
  assert.throws(() => run(b, [{ op: "spendKarma", target: { attribute: "strength" } }]), /racial maximum/, "human Strength 6 → 7 needs the GM's approval");
  assert.equal(run(b, [{ op: "spendKarma", target: { attribute: "strength", gmApproved: true } }]).actor.system.karma.current, 30 - 14, "double: 14");
  b = run(b, [{ op: "spendKarma", target: { itemId: idOf(b, "Firearms"), tier: "general" } }]);
  assert.deepEqual([skill(b, "Firearms").rating, b.actor.system.karma.current], [7, 16]);
  b = run(b, [{ op: "spendKarma", target: { itemId: idOf(b, "Car"), newConcentration: "Sedans" } }]);
  assert.deepEqual([skill(b, "Car").concentration, b.actor.system.karma.current], [{ name: "Sedans", rating: 7 }, 5], "1.5 × 7 = 10.5 → 11");
  b = run(b, [{ op: "spendKarma", target: { newSkill: core("Computer", "skill") } }]);
  assert.deepEqual([skill(b, "Computer").rating, skill(b, "Computer").ratingsFinalized, b.actor.system.karma.current], [1, true, 4]);
  assert.throws(() => run(b, [{ op: "spendKarma", target: { itemId: idOf(b, "Stealth"), tier: "general" } }]), /14 Good Karma needed, 4 available/);
  assert.ok(karmaOptions(b).some(o => o.target.itemId === idOf(b, "Car") && o.target.tier === "concentration" && o.cost === 12));
});

test("undo: newest first, an undo can't be undone, award→spend→undo→undo returns to the start", () => {
  const start = finished();
  let b = run(start, [{ op: "awardKarma", amount: 20, note: "" }]);
  b = run(b, [{ op: "spendKarma", target: { itemId: idOf(b, "Stealth"), tier: "general" } }]);
  const [award, spend] = b.ledger;
  assert.throws(() => run(b, [{ op: "undoKarma", entryId: award.id }]), /latest change/);
  b = run(b, [{ op: "undoKarma", entryId: spend.id }]);
  assert.equal(skill(b, "Stealth").rating, 6);
  assert.equal(undoable(b).id, award.id, "the undo entry itself is skipped");
  b = run(b, [{ op: "undoKarma", entryId: award.id }]);
  assert.deepEqual([b.actor.system.karma.total, b.actor.system.karma.current], [start.actor.system.karma?.total ?? 0, start.actor.system.karma?.current ?? 0]);
  assert.deepEqual(b.actor.items, start.actor.items);
  assert.deepEqual(b.ledger.map(e => [e.kind, !!e.undoneBy, e.undoes ?? null]), [["award", true, null], ["advance", true, null], ["revert", false, spend.id], ["revert", false, award.id]]);
  assert.equal(undoable(b), null);
});

test("server: an award replayed with the same key pays once; amounts over 200 are refused at the door", async () => {
  const { testContext, PW } = await import("./helpers.mjs");
  const { buildApp } = await import("../server/app.mjs");
  const { loadConfig } = await import("../server/config.mjs");
  const A = await import("../server/auth/accounts.mjs");
  const { randomUUID } = await import("node:crypto");
  const t = await testContext(), ORIGIN = "https://hoi.example";
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog: { byId } });
  const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret: (await A.bootstrap(t.ctx)).secret, username: "Boss", password: PW } });
  const cookie = res.headers["set-cookie"].split(";")[0], csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
  const call = (url, body, key = randomUUID()) => app.inject({ method: "POST", url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "idempotency-key": key }, payload: body });
  const id = (await call("/api/documents/characters", { name: "Vet" })).json().document.id;
  // Put a finished body in place (finishing is tested above); the award goes through the real route.
  const L = await import("../server/library.mjs");
  const done = finished(), text = JSON.stringify(done);
  await t.ctx.db.updateTable("documents").set({ body: text, bytes: Buffer.byteLength(text) }).where("id", "=", id).execute();
  assert.equal((await call(`/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "awardKarma", amount: 201, note: "" }] })).statusCode, 400);
  const key = randomUUID(), body = { revision: 1, ops: [{ op: "awardKarma", amount: 10, note: "run" }] };
  const first = (await call(`/api/documents/${id}/ops`, body, key)).json(), again = (await call(`/api/documents/${id}/ops`, body, key)).json();
  assert.deepEqual([first.body.actor.system.karma.total, again.body.actor.system.karma.total, again.document.revision], [10, 10, 2]);
  const row = await t.ctx.db.selectFrom("documents").select("body").where("id", "=", id).executeTakeFirst();
  assert.equal(L.decodeBody(row.body).ledger.length, 1, "one entry, not two");
  await app.close();
});
