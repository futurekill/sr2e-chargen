/** M2d (docs/PLAN-M2d.md): contacts and extras, lifestyle, allergy, programs, finishing — on the REAL catalog. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate, Refusal } from "../shared/creation.mjs";
import { chargenBudget, TABLES } from "../shared/rules.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const core = (name, type) => { const e = catalog.entries.find(x => x.book === "sr2" && x.name === name && x.type === type); assert.ok(e, name); return e.id; };
const run = (b, ops) => ops.reduce((x, op) => applyOp(x, op, lookup), b);
const idOf = (b, name) => Object.entries(b.creation.items).find(([, r]) => r.name === name)[0];
const set = (b, name, choices) => applyOp(b, { op: "setItem", itemId: idOf(b, name), choices }, lookup);
const add = (name, type) => ({ op: "addItem", catalogId: core(name, type) });
const texts = (b) => validate(b).problems.map(p => `${p.severity}: ${p.text}`).join("\n");
const skillOp = (b, name, o) => ({ op: "setSkill", itemId: idOf(b, name), allocated: 6, concentration: "", specialization: "", freeLanguage: "", ...o });

/** A complete human street samurai: A attributes, B skills, C resources (90,000¥), two contacts, a Low lifestyle. */
function complete() {
  let b = run(newCharacter("Finisher"), [
    ...Object.entries({ attributes: "A", skills: "B", resources: "C", magic: "D", race: "E" }).map(([category, letter]) => ({ op: "setPriority", category, letter })),
    ...["body", "quickness", "strength", "charisma", "intelligence", "willpower"].map(attr => ({ op: "setAttribute", attr, base: 5 })),
    ...["Firearms", "Etiquette", "Athletics", "Stealth", "Car", "English"].map(n => ({ op: "addSkill", catalogId: core(n, "skill") })),
    add("Ares Predator", "weapon"), add("Fixer", "contact"), add("Street Doc", "contact"), add("Low", "lifestyle")]);
  for (const n of ["Firearms", "Etiquette", "Athletics", "Stealth", "Car"]) b = applyOp(b, skillOp(b, n), lookup);
  return applyOp(b, skillOp(b, "English", { allocated: 0, freeLanguage: "native" }), lookup);
}

test("one budget: validate's numbers ARE the system's chargenBudget (M2d §1)", () => {
  const b = complete(), v = validate(b);
  const direct = chargenBudget({ system: b.actor.system, items: b.actor.items, table: TABLES.priorities });
  for (const k of ["attributes", "skills", "resources", "forcePoints"]) assert.deepEqual(v.budgets[k], direct[k], k);
  assert.equal(v.budgets.resources.spent, 450 + 1000, "Predator + one month Low; two contacts free");
  assert.equal(v.finishable, true, texts(b));
});

test("contacts: two free, the third 5,000¥, a buddy 10,000¥, one buddy only; two contacts are a to-do (p.43)", () => {
  let b = complete();
  const base = validate(b).budgets.resources.spent;
  b = run(b, [add("Bartender", "contact"), add("Mechanic", "contact")]);
  b = set(b, "Mechanic", { kind: "buddy" });
  assert.equal(validate(b).budgets.resources.spent, base + 5000 + 10000);
  b = set(b, "Bartender", { kind: "buddy" });
  assert.match(texts(b), /error: Only one buddy/);
  assert.throws(() => set(b, "Bartender", { kind: "gang" }), /one of contact, buddy/);
  const one = applyOp(complete(), { op: "removeItem", itemId: idOf(complete(), "Fixer") }, lookup);
  assert.match(texts(one), /todo: Choose your two free contacts/);
});

test("a gang's members are the server's 2D6; followers name five different archetypes (p.44)", () => {
  let b = complete();
  assert.throws(() => applyOp(b, { op: "addExtra", kind: "gang", name: "Ancients" }, lookup), /server rolls/, "no roll, no gang");
  assert.throws(() => applyOp(b, { op: "addExtra", kind: "gang", name: "Ancients" }, lookup, { roll: 13 }), /server rolls/);
  b = applyOp(b, { op: "addExtra", kind: "gang", name: "Ancients" }, lookup, { roll: 7 });
  const gang = b.actor.items.find(i => i.name === "Ancients");
  assert.deepEqual([gang.system.contactType, gang.system.members], ["gang", 7]);
  b = applyOp(b, { op: "addExtra", kind: "follower", name: "The Crew" }, lookup);
  assert.match(texts(b), /todo: The Crew: name the five archetypes/);
  b = applyOp(b, { op: "setExtra", itemId: idOf(b, "The Crew"), archetypes: ["Decker", "Rigger", "decker", "Face", "Mage"] }, lookup);
  assert.match(texts(b), /error: The Crew: the five archetypes must all be different/);
  b = applyOp(b, { op: "setExtra", itemId: idOf(b, "The Crew"), archetypes: ["Decker", "Rigger", "Street Samurai", "Face", "Mage"] }, lookup);
  assert.doesNotMatch(texts(b), /The Crew/);
  assert.equal(validate(b).budgets.resources.spent, 450 + 1000 + 50000 + 200000);
  assert.throws(() => applyOp(b, { op: "addExtra", kind: "enemy", name: "X" }, lookup), Refusal);
});

test("lifestyle: months × cost, one only (a new one replaces), none = the street (p.46)", () => {
  let b = complete();
  b = set(b, "Low", { months: 3 });
  assert.equal(validate(b).budgets.resources.spent, 450 + 3000);
  assert.equal(b.actor.system.lifestyle, "low");
  b = run(b, [add("Middle", "lifestyle")]);
  assert.deepEqual(b.actor.items.filter(i => i.type === "lifestyle").map(i => i.name), ["Middle"]);
  b = applyOp(b, { op: "removeItem", itemId: idOf(b, "Middle") }, lookup);
  assert.equal(b.actor.system.lifestyle, "streets");
  assert.match(texts(b), /warning: No lifestyle bought/);
  assert.throws(() => set(run(b, [add("Streets", "lifestyle")]), "Streets", { months: 61 }), /1 to 60/);
});

test("allergy: an elf's Common/Severe raises attributes 2 and skills 4; partial is a to-do; a human can't (p.46)", () => {
  let b = run(complete(), [{ op: "setPriority", category: "race", letter: "A" }, { op: "setMetatype", race: "elf" }]);
  const before = validate(b).budgets;
  b = applyOp(b, { op: "setAllergy", substance: "Silver", rarity: "common", severity: "", rarityBonus: "attributes", severityBonus: "" }, lookup);
  assert.match(texts(b), /todo: Allergy: choose its severity, the bonus for the severity/);
  b = applyOp(b, { op: "setAllergy", substance: "Silver", rarity: "common", severity: "severe", rarityBonus: "attributes", severityBonus: "skills" }, lookup);
  const after = validate(b).budgets;
  assert.deepEqual([after.attributes.total - before.attributes.total, after.skills.total - before.skills.total], [2, 4]);
  assert.throws(() => applyOp(b, { op: "setAllergy", substance: "Silver", rarity: "rare", severity: "severe", rarityBonus: "attributes", severityBonus: "skills" }, lookup), /Allergy and Severity Table/);
  const human = applyOp(b, { op: "setMetatype", race: "human" }, lookup);
  assert.deepEqual(Object.values(human.actor.system.chargen.allergy), ["", "", "", "", ""], "changing to human clears it");
  assert.throws(() => applyOp(human, { op: "setAllergy", substance: "Silver", rarity: "common", severity: "severe", rarityBonus: "attributes", severityBonus: "skills" }, lookup), /Only a metahuman/);
});

test("programs: rating 1–6 at the system's price", () => {
  let b = run(complete(), [add("Attack", "program")]);
  b = set(b, "Attack", { rating: 4 });
  const atk = b.actor.items.find(i => i.name === "Attack");
  assert.equal(atk.system.rating, 4);
  assert.ok(validate(b).budgets.resources.spent > 1450, "the program costs nuyen");
  assert.throws(() => set(b, "Attack", { rating: 7 }), /1 to 6/);
});

test("finish: 88,550¥ unspent → 8,855¥ + 3D6 × 1,000¥; creation then closed; refused while anything is open (p.47)", () => {
  const b = complete();
  assert.throws(() => applyOp(b, { op: "finish" }, lookup), /server rolls/);
  const done = applyOp(b, { op: "finish" }, lookup, { roll: 11, now: 1234 });
  assert.equal(done.actor.system.nuyen, 8855 + 11000);
  assert.equal(done.actor.system.chargen.inProgress, false);
  assert.equal(done.actor.flags.sr2e.startingMoneyGranted, true);
  assert.deepEqual(done.creation.finished, { at: 1234, leftover: 88550, roll: 11, nuyen: 19855, karmaPool: 1 });
  assert.throws(() => applyOp(done, add("Bartender", "contact"), lookup), /finished/);
  assert.throws(() => applyOp(done, { op: "finish" }, lookup, { roll: 11 }), /finished/);
  assert.equal(applyOp(done, { op: "setName", name: "Still Me" }, lookup).name, "Still Me", "name and notes stay editable");
  const open = applyOp(b, { op: "removeItem", itemId: idOf(b, "Fixer") }, lookup);
  assert.throws(() => applyOp(open, { op: "finish" }, lookup, { roll: 11 }), /Fix every error/);
});

test("server: the roll is the server's, a client roll is refused, a replay returns the first roll", async () => {
  const { testContext, PW } = await import("./helpers.mjs");
  const { buildApp } = await import("../server/app.mjs");
  const { loadConfig } = await import("../server/config.mjs");
  const A = await import("../server/auth/accounts.mjs");
  const t = await testContext();
  const dice = [3, 4, 6, 6];
  t.ctx.randomInt = () => dice.shift() ?? 1;
  const ORIGIN = "https://hoi.example";
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog: { byId } });
  const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret: (await A.bootstrap(t.ctx)).secret, username: "Boss", password: PW } });
  const cookie = res.headers["set-cookie"].split(";")[0], csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
  const call = (url, body, key = randomUUID()) => app.inject({ method: "POST", url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "idempotency-key": key }, payload: body });
  const id = (await call("/api/documents/characters", { name: "Gang Kid" })).json().document.id;
  assert.equal((await call(`/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "addExtra", kind: "gang", name: "Ancients", roll: 12 }] })).statusCode, 400, "no roll field");
  assert.equal((await call(`/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "addExtra", kind: "enemy", name: "Ancients" }] })).statusCode, 400, "kind at the door");
  assert.equal((await call(`/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "addExtra", kind: "gang", name: "x".repeat(61) }] })).statusCode, 400, "name at the door");
  const key = randomUUID(), body = { revision: 1, ops: [{ op: "addExtra", kind: "gang", name: "Ancients" }] };
  const first = (await call(`/api/documents/${id}/ops`, body, key)).json();
  const again = (await call(`/api/documents/${id}/ops`, body, key)).json();
  const members = (r) => r.body.actor.items.find(i => i.name === "Ancients").system.members;
  assert.deepEqual([members(first), members(again)], [7, 7], "3 + 4; the replay does not roll again");
  assert.equal(dice.length, 2, "only two dice were used");
  await app.close(); await t.ctx.db.destroy?.();
});
