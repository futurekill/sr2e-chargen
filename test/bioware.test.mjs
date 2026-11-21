/** M5e (docs/PLAN-M5e.md): bioware at creation (Shadowtech). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";
import { offerReason, priceInput, EXHALER_TOXINS } from "../shared/purchase.mjs";
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

test("the gate: plain and rule-bearing bioware offered (M5k); the choice-needing implants wait", () => {
  assert.equal(offerReason(bio("Tailored Pheromones"), ["st"]), null);
  for (const n of ["Adrenal Pump", "Pain Editor", "Damage Compensator", "Enhanced Articulation", "Orthoskin", "Muscle Augmentation", "Synaptic Accelerator", "Suprathyroid Gland", "Cerebral Booster"])
    assert.equal(offerReason(bio(n), ["st"]), null, n);
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

test("M5k: the synaptic accelerator — not with wired or boosted reflexes (ST p.28), with move-by-wire only at Level 1 and triple cost (CT p.57)", async () => {
  const { price, project, pricedItems } = await import("../shared/purchase.mjs");
  const cy = (book, name) => catalog.entries.find(x => x.type === "cyberware" && x.book === book && x.name === name).id;
  const errs = (b) => validate(b).problems.filter(p => p.severity === "error").map(p => p.text);
  let b = run(newCharacter("Fast"), [{ op: "setBooks", books: ["st", "ssc", "ct"] }, { op: "addItem", catalogId: bio("Synaptic Accelerator").id }, { op: "addItem", catalogId: cy("ssc", "Boosted Reflexes 1") }]);
  assert.ok(errs(b).some(t => /Synaptic Accelerator is incompatible with Boosted Reflexes 1/.test(t)), errs(b).join(" | "));
  b = run(newCharacter("Wire"), [{ op: "setBooks", books: ["st", "ct"] }, { op: "addItem", catalogId: bio("Synaptic Accelerator").id }, { op: "addItem", catalogId: cy("ct", "Move-by-Wire System (Level 1)") }]);
  const sa = rec(b, "Synaptic Accelerator"), r = b.creation.items[sa];
  assert.equal(price(r, project(r, r.choices), b.actor.items), 3 * 75000);
  assert.equal(pricedItems(b.actor.items).find(i => i._id === sa).system.ratingStats[0].cost, 3 * 75000);
  assert.ok(!errs(b).some(t => /move-by-wire/.test(t)));
  b = run(b, [{ op: "setItem", itemId: sa, choices: { ...r.choices, rating: 2 } }]);
  assert.ok(errs(b).some(t => /Level 2 can't combine with move-by-wire/.test(t)));
});

test("M5k: Muscle Augmentation beside two full cyberarms — Body Cost and price × .6, as Foundry's budget input", () => {
  const cy = (name) => catalog.entries.find(x => x.type === "cyberware" && x.book === "ct" && x.name === name).id;
  let b = run(newCharacter("Arms"), [{ op: "setBooks", books: ["st", "ct"] }, { op: "addItem", catalogId: cy("Cyberarm") }, { op: "addItem", catalogId: cy("Cyberarm") }, { op: "addItem", catalogId: bio("Muscle Augmentation").id }]);
  const [l, r] = Object.keys(b.creation.items).filter(k => b.creation.items[k].name === "Cyberarm");
  b = run(b, [{ op: "setItem", itemId: l, choices: { ...b.creation.items[l].choices, side: "left" } }, { op: "setItem", itemId: r, choices: { ...b.creation.items[r].choices, side: "right" } }]);
  const it = item(b, "Muscle Augmentation"), n = b.actor.items.indexOf(it);
  assert.equal(chargenItemCost(priceInput(it, b.actor.items)), chargenItemCost(budgetItemInput(it, b.actor.items.map(i => ({ ...i, id: i._id, _source: { system: i.system } })), n)));
  assert.equal(chargenItemCost(priceInput(it, b.actor.items)), 27000);
  assert.equal(derive({ actor: b.actor }).bodyIndex.value, 0.48);
});

test("M5k code review r1: the sheet's Body Cost has the muscle discount; the Markdown pools carry the Task Pool and skill dice; the Injury line follows the compensator and pain editor", async () => {
  const { sheetModel } = await import("../server/sheet/model.mjs");
  const { injuryPenalty } = await import("../shared/derive.mjs");
  const cy = (name) => catalog.entries.find(x => x.type === "cyberware" && x.book === "ct" && x.name === name).id;
  let b = run(newCharacter("Arms"), [{ op: "setBooks", books: ["st", "ct"] }, { op: "addItem", catalogId: cy("Cyberarm") }, { op: "addItem", catalogId: cy("Cyberarm") }, { op: "addItem", catalogId: bio("Muscle Augmentation").id }, { op: "addItem", catalogId: bio("Enhanced Articulation").id }]);
  const [l, r] = Object.keys(b.creation.items).filter(k => b.creation.items[k].name === "Cyberarm");
  b = run(b, [{ op: "setItem", itemId: l, choices: { ...b.creation.items[l].choices, side: "left" } }, { op: "setItem", itemId: r, choices: { ...b.creation.items[r].choices, side: "right" } }]);
  const m = sheetModel(b);
  assert.ok(m.bioware.some(row => row[0] === "Muscle Augmentation" && /BC 0\.48/.test(row[2])), JSON.stringify(m.bioware));
  assert.ok(m.pools.some(([k, v]) => k === "Active skill dice" && v === "+1"));
  const actor = { system: { conditionMonitor: { physical: { value: 2 }, stun: { value: 0 } } }, items: [{ type: "bioware", system: { damageCompensator: true, rating: 2, installed: true } }] };
  assert.equal(injuryPenalty(actor), 0, "a Rating 2 compensator hides 2 Physical boxes (Shadowtech p.24)");
});

test("M5m: a Reflex Recorder learns one Active skill of this character; the export names it (Shadowtech p.27)", () => {
  let b = run(start(), [{ op: "addSkill", catalogId: "sr2e.skills.2e45bcab9ddd0ceb" }, { op: "addSkill", catalogId: "sr2e.skills.0ac1eaba103bb924" }]);
  const fire = rec(b, "Firearms"), know = rec(b, "Parazoology");
  b = buy(b, "Reflex Recorder (General)");
  const probs = (x) => validate(x).problems.filter(p => /Reflex Recorder/.test(p.text)).map(p => p.text).join(" | ");
  assert.match(probs(b), /choose the skill/);
  assert.throws(() => buy(b, "Reflex Recorder (General)", { skill: know }), /Active skills/);
  b = run(b, [{ op: "setItem", itemId: rec(b, "Reflex Recorder (General)"), choices: { ...b.creation.items[rec(b, "Reflex Recorder (General)")].choices, skill: fire } }]);
  assert.equal(item(b, "Reflex Recorder (General)").system.recordedSkill, "Firearms");
  assert.equal(probs(b), "");
  // The Concentration size takes the skill's concentration; none yet is an error.
  b = buy(b, "Reflex Recorder (Concentration)", { skill: fire });
  assert.match(probs(b), /give Firearms a concentration/);
  b = run(b, [{ op: "setSkill", itemId: fire, allocated: 3, concentration: "Pistols", specialization: "", freeLanguage: "" }]);
  assert.equal(item(b, "Reflex Recorder (Concentration)").system.recordedConcentration, "Pistols");
  assert.equal(item(b, "Reflex Recorder (General)").system.recordedConcentration, "");
  assert.equal(probs(b), "");
  // Two General recorders on one skill: not cumulative.
  b = run(b, [{ op: "addItem", catalogId: bio("Reflex Recorder (General)").id }]);
  const second = Object.keys(b.creation.items).filter(k => b.creation.items[k].name === "Reflex Recorder (General)").at(-1);
  b = run(b, [{ op: "setItem", itemId: second, choices: { ...b.creation.items[second].choices, skill: fire } }]);
  assert.match(probs(b), /already has a recorder/);
  // Removing the skill leaves the recorder pointing nowhere.
  b = run(b, [{ op: "removeSkill", itemId: fire }]);
  assert.match(probs(b), /no longer on this character/);
});

test("M5m: the Toxin Exhaler costs 30,000¥ + 100 doses of its toxin, chosen before implantation (Shadowtech p.32)", () => {
  for (const [name, t] of Object.entries(EXHALER_TOXINS)) {   // the list's dose prices are the catalog's (R14)
    const e = catalog.entries.find(x => x.type === "gear" && x.name === name && x.book === t.book);
    assert.equal(e?.system.cost, t.dose, name);
  }
  assert.equal(offerReason(bio("Toxin Exhaler"), ["st"]), null);
  let b = buy(start(), "Toxin Exhaler");
  const probs = () => validate(b).problems.filter(p => /Toxin Exhaler/.test(p.text)).map(p => p.text).join(" | ");
  assert.match(probs(), /choose the toxin/);
  b = run(b, [{ op: "setItem", itemId: rec(b, "Toxin Exhaler"), choices: { ...b.creation.items[rec(b, "Toxin Exhaler")].choices, toxin: "Cyanide" } }]);
  assert.equal(item(b, "Toxin Exhaler").system.cost, 30000 + 36000);
  assert.match(item(b, "Toxin Exhaler").system.notes, /Toxin: Cyanide/);
  assert.equal(probs(), "");
  b = run(b, [{ op: "setItem", itemId: rec(b, "Toxin Exhaler"), choices: { ...b.creation.items[rec(b, "Toxin Exhaler")].choices, toxin: "Gamma-Scopolamine", grade: "cultured" } }]);
  assert.equal(item(b, "Toxin Exhaler").system.cost, 30000 + 30000);
  assert.equal(chargenItemCost(budgetItemInput(item(b, "Toxin Exhaler"), b.actor.items)), 4 * 60000, "cultured: ×4 on the whole price");
  assert.match(probs(), /isn't turned on/);
});
