/** M5d (docs/PLAN-M5d.md): Edges and Flaws at creation (Shadowrun Companion p.22–35). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const BOOKS = catalog.books.map(b => b.key);
const run = (b, ops) => ops.reduce((x, o) => applyOp(x, o, lookup, { now: 1, catalogBooks: BOOKS }), b);
const qid = (name) => { const e = catalog.entries.find(x => x.type === "quality" && x.book === "sc" && x.name === name); assert.ok(e, name); return e.id; };
const rec = (b, name) => Object.keys(b.creation.items).find(k => b.creation.items[k].name === name);
const item = (b, name) => b.actor.items.find(i => i.name === name);
const concept = (b) => validate(b).problems.filter(p => p.step === "concept" && p.severity === "error").map(p => p.text);
const ATTRS = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];
const base = (n = 5) => run(newCharacter("Edgy"), [{ op: "setBooks", books: ["sc"] }, ...ATTRS.map(attr => ({ op: "setAttribute", attr, base: n }))]);
const add = (b, name, choices = {}) => {
  b = run(b, [{ op: "addItem", catalogId: qid(name) }]);
  return Object.keys(choices).length ? run(b, [{ op: "setItem", itemId: rec(b, name), choices: { ...b.creation.items[rec(b, name)].choices, ...choices } }]) : b;
};

test("balanced Edges and Flaws pass; Lightning Reflexes 4 gives Reaction +2; an unbalanced set is an error with the Companion cited", () => {
  let b = add(base(), "Lightning Reflexes", { points: 4 });
  const before = derive({ actor: base().actor }).reaction;
  assert.equal(derive({ actor: b.actor }).reaction, before + 2);
  assert.match(concept(b).join(), /must balance to 0/);
  assert.equal(validate(b).problems.find(p => /balance/.test(p.text)).cite.book, "sc");
  b = add(b, "Allergy", { points: -4, detail: "Silver" });
  assert.deepEqual(concept(b), []);
  assert.equal(item(b, "Allergy").system.notes, "Silver");
  assert.equal(item(add(b, "Phobia", { points: -1, detail: "<b>spiders</b> & snakes" }), "Phobia").system.notes, "bspiders/b & snakes", "markup characters dropped, plain text kept");
});

test("Bonus Attribute Point: priced 2 past the racial maximum; Exceptional Attribute lets it through", () => {
  let b = add(base(5), "Bonus Attribute Point", { attribute: "body", gain: 2 });
  assert.equal(item(b, "Bonus Attribute Point").system.pointValue, 3, "5 → 6 costs 1, 6 → 7 costs 2");
  assert.ok(validate(b).problems.some(p => p.step === "attributes" && /Body is 7 .*maximum is 6/.test(p.text)));
  b = add(b, "Exceptional Attribute", { attribute: "body" });
  assert.ok(!validate(b).problems.some(p => p.step === "attributes" && /Body/.test(p.text)));
  assert.equal(derive({ actor: b.actor }).attributes.body, 7);
  b = add(b, "Infirm", { points: -5 });
  assert.deepEqual(concept(b), [], "3 + 2 − 5 = 0");
});

test("budget effects: Bonus Skill Point adds skill points; Bonus Force Point only for a magician; Extra Contact asks for a third free contact", () => {
  let b = run(base(), [{ op: "setPriority", category: "skills", letter: "C" }, { op: "setPriority", category: "resources", letter: "D" }]);
  b = add(b, "Bonus Skill Point", { points: 2 });
  assert.equal(validate(b).budgets.skills.total, 24 + 2);
  b = add(b, "Bonus Force Point", { points: 1 });
  assert.equal(validate(b).budgets.forcePoints.total, 0, "a mundane gets no Force Points");
  assert.equal(validate(run(b, [{ op: "setMagic", type: "full_magician" }])).budgets.forcePoints.total, 15 + 2);
  b = add(b, "Extra Contact");
  assert.ok(validate(b).problems.some(p => /Choose your 3 free contacts/.test(p.text)));
});

test("the magically active values (Blind −6, −2 for a magician); a value off the table refused; a copy refused; only with the Companion", () => {
  let b = add(add(base(), "Blind", { points: -2 }), "Photographic Memory");
  assert.match(concept(b).join(), /worth -6 \(not magically active\), not -2/);
  assert.deepEqual(concept(run(b, [{ op: "setMagic", type: "physical_adept" }])).filter(t => /Blind/.test(t)), []);
  assert.throws(() => run(b, [{ op: "setItem", itemId: rec(b, "Blind"), choices: { ...b.creation.items[rec(b, "Blind")].choices, points: -3 } }]), /points is one of/);
  assert.match(concept(add(b, "Photographic Memory")).join(), /taken twice/);
  assert.throws(() => run(newCharacter("No book"), [{ op: "addItem", catalogId: qid("Bravery") }]), /isn't turned on/);
});

test("the sheet lists them; Will to Live raises the overflow", async () => {
  const b = add(add(base(), "Will to Live", { points: 2 }), "Dark Secret");
  assert.equal(derive({ actor: b.actor }).monitors.overflow, derive({ actor: base().actor }).monitors.overflow + 2);
  const { sheetModel } = await import("../server/sheet/model.mjs");
  assert.deepEqual(sheetModel(b).qualities.map(r => r.slice(0, 2)), [["Will to Live", "+2"], ["Dark Secret", "-2"]]);
});

test("Cyberpirates and Rigger 2 Edges and Flaws, from their own pages: Connected 3 or 5, Gremlins −1 to −4; cited to their book", () => {
  const id = (book, name) => { const e = catalog.entries.find(x => x.type === "quality" && x.book === book && x.name === name); assert.ok(e, name); return e.id; };
  let b = run(newCharacter("Pirate"), [{ op: "setBooks", books: ["cp", "r2"] }, { op: "addItem", catalogId: id("cp", "Connected") }, { op: "addItem", catalogId: id("r2", "Gremlins") }]);
  b = run(b, [{ op: "setItem", itemId: rec(b, "Connected"), choices: { ...b.creation.items[rec(b, "Connected")].choices, points: 5 } }]);
  assert.match(concept(b).join(), /balance to 0/);
  b = run(b, [{ op: "setItem", itemId: rec(b, "Gremlins"), choices: { ...b.creation.items[rec(b, "Gremlins")].choices, points: -4 } }]);
  assert.match(concept(b).join(), /balance to 0/, "+5 − 4 = +1");
  b = run(b, [{ op: "addItem", catalogId: id("cp", "Braggart") }]);
  assert.deepEqual(concept(b), []);
  assert.throws(() => run(b, [{ op: "setItem", itemId: rec(b, "Connected"), choices: { ...b.creation.items[rec(b, "Connected")].choices, points: 4 } }]), /points is one of 3, 5/);
});

test("sum-to-10 (Companion p.20): letters repeat without swapping; the levels add up to at most 10; not for a shapeshifter", () => {
  assert.throws(() => run(newCharacter("No book"), [{ op: "setMethod", method: "sumto10" }]), /turn it on/);
  let b = run(newCharacter("Sum"), [{ op: "setBooks", books: ["sc"] }, { op: "setMethod", method: "sumto10" },
    ...[["race", "C"], ["magic", "C"], ["attributes", "C"], ["skills", "C"], ["resources", "C"]].map(([category, letter]) => ({ op: "setPriority", category, letter }))]);
  assert.deepEqual(Object.values(b.actor.system.chargen.priorities), ["C", "C", "C", "C", "C"]);
  assert.ok(!validate(b).problems.some(p => p.step === "priorities" && p.severity === "error"), "2 × 5 = 10");
  b = run(b, [{ op: "setPriority", category: "race", letter: "A" }]);
  assert.match(validate(b).problems.filter(p => p.step === "priorities").map(p => p.text).join(), /add up to 12/);
  assert.throws(() => run(b, [{ op: "setBooks", books: [] }]), /comes from sc/);
  b = run(b, [{ op: "setMethod", method: "standard" }]);
  assert.match(validate(b).problems.filter(p => p.step === "priorities").map(p => p.text).join(), /used twice/);
  assert.throws(() => run(b, [{ op: "setMethod", method: "points" }]), /Standard or sum-to-10/);
});
