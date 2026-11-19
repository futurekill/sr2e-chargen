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
