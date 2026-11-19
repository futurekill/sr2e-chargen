/** M5e (docs/PLAN-M5e.md): bioware at creation (Shadowtech). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";
import { offerReason, priceInput } from "../shared/purchase.mjs";
import { budgetItemInput, chargenItemCost } from "../shared/rules.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const BOOKS = catalog.books.map(b => b.key);
const run = (b, ops) => ops.reduce((x, o) => applyOp(x, o, lookup, { now: 1, catalogBooks: BOOKS }), b);
const bio = (name) => { const e = catalog.entries.find(x => x.type === "bioware" && x.name === name); assert.ok(e, name); return e; };
const rec = (b, name) => Object.keys(b.creation.items).find(k => b.creation.items[k].name === name);
const item = (b, name) => b.actor.items.find(i => i.name === name);
const ATTRS = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];
const start = (magic = "none") => run(newCharacter("Bio"), [{ op: "setBooks", books: ["st"] }, ...ATTRS.map(attr => ({ op: "setAttribute", attr, base: 3 })), { op: "setMagic", type: magic }]);
const buy = (b, name, choices) => {
  b = run(b, [{ op: "addItem", catalogId: bio(name).id }]);
  return choices ? run(b, [{ op: "setItem", itemId: rec(b, name), choices: { ...b.creation.items[rec(b, name)].choices, ...choices } }]) : b;
};

test("the gate: plain bioware offered; rule-bearing, triggered, armored and choice-needing implants wait", () => {
  assert.equal(offerReason(bio("Tailored Pheromones"), ["st"]), null);
  for (const n of ["Adrenal Pump", "Pain Editor", "Damage Compensator", "Enhanced Articulation", "Orthoskin", "Muscle Augmentation", "Reflex Recorder (General)", "Toxin Exhaler"])
    assert.match(offerReason(bio(n), ["st"]) ?? "", /own rules/, n);
  assert.match(offerReason(bio("Tailored Pheromones"), []) ?? "", /isn't turned on/);
});

test("Tailored Pheromones 2: Charisma +2, Body Cost .6; cultured .45 at 4× the price; a magician pays the Body Index in Essence", () => {
  let b = buy(start(), "Tailored Pheromones", { rating: 2 });
  assert.equal(derive({ actor: b.actor }).attributes.charisma, 3 + 2);
  assert.deepEqual([item(b, "Tailored Pheromones").system.bodyCost, derive({ actor: b.actor }).bodyIndex.value, derive({ actor: b.actor }).essence], [0.6, 0.6, 6]);
  const std = chargenItemCost(priceInput(item(b, "Tailored Pheromones"), b.actor.items));
  b = run(b, [{ op: "setItem", itemId: rec(b, "Tailored Pheromones"), choices: { ...b.creation.items[rec(b, "Tailored Pheromones")].choices, grade: "cultured" } }]);
  assert.equal(derive({ actor: b.actor }).bodyIndex.value, 0.45);
  assert.equal(chargenItemCost(priceInput(item(b, "Tailored Pheromones"), b.actor.items)), 4 * std);
  // Parity with the system's own budget input on the same item (code review: not chargenItemCost against itself).
  const it = item(b, "Tailored Pheromones");
  assert.equal(chargenItemCost(budgetItemInput({ ...it, id: it._id, _source: { system: it.system } }, [], 0)), 4 * std);
  assert.equal(derive({ actor: run(b, [{ op: "setMagic", type: "full_magician" }]).actor }).essence, 5.55);
});

test("neural bioware has no grade choice; the Body Index over Body warns; rated-to-Body implants are checked", () => {
  let b = buy(start(), "Trauma Damper");
  assert.ok(!("grade" in b.creation.items[rec(b, "Trauma Damper")].choices));
  b = buy(b, "Toxin Extractor", { rating: 4 });
  assert.ok(validate(b).problems.some(p => /Toxin Extractor is Rating 4: at most the unaugmented Body \(3\)/.test(p.text)));
  b = run(buy(b, "Synthacardium", { rating: 2 }), [{ op: "setAttribute", attr: "body", base: 1 }]);
  const w = validate(b).problems.find(p => /overstress/.test(p.text));
  assert.ok(w && w.severity === "warning" && w.cite.book === "st", JSON.stringify(validate(b).problems.filter(p => p.step === "resources")));
});
