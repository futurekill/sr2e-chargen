/** M5n (docs/PLAN-M5n.md): the Grimoire's and the CSH's adept powers at creation (sr2e 0.162.0). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";
import { offerReason } from "../shared/purchase.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const BOOKS = catalog.books.map(b => b.key);
const run = (b, ops) => ops.reduce((x, o) => applyOp(x, o, lookup, { now: 1, catalogBooks: BOOKS }), b);
const pw = (name) => { const e = catalog.entries.find(x => x.type === "adept_power" && x.name === name); assert.ok(e, name); return e; };
const recs = (b, name) => Object.keys(b.creation.items).filter(k => b.creation.items[k].name === name);
const set = (b, id, ch) => run(b, [{ op: "setItem", itemId: id, choices: { ...b.creation.items[id].choices, ...ch } }]);
const adept = () => run(newCharacter("Adept"), [{ op: "setBooks", books: ["grim", "csh"] }, { op: "setMagic", type: "physical_adept" }]);
const magicErrs = (b) => validate(b).problems.filter(p => p.step === "magic" && p.severity === "error").map(p => p.text);

test("M5n: the gate — the eight powers offered with their book; Enhanced Centering after initiation", () => {
  for (const n of ["Mystic Armor", "Body Control", "Attribute Boost", "Missile Parry", "Suspended State", "Enhanced Perception (Tier 1)", "Extended Missile Parry"])
    assert.equal(offerReason(pw(n), ["grim", "csh"]), null, n);
  assert.match(offerReason(pw("Mystic Armor"), []) ?? "", /isn't turned on/);
  assert.match(offerReason(pw("Enhanced Centering"), ["grim"]) ?? "", /initiate/);
});

test("M5n: Mystic Armor adds Impact armor up to Magic, as Foundry (Grimoire p.34)", () => {
  let b = run(adept(), [{ op: "addItem", catalogId: pw("Mystic Armor").id }]);
  const [ma] = recs(b, "Mystic Armor");
  const base = derive({ actor: run(adept(), []).actor }).armor.impact;
  b = set(b, ma, { level: 3 });
  const d = derive({ actor: b.actor });
  assert.equal(d.armor.impact, base + Math.min(3, d.magic));
});

test("M5n: Enhanced Perception's tier items are priced together; Attribute Boost asks its attribute, once each (CSH p.104, Grimoire p.34)", () => {
  let b = run(adept(), [{ op: "addItem", catalogId: pw("Enhanced Perception (Tier 1)").id }, { op: "addItem", catalogId: pw("Enhanced Perception (Tier 2)").id }]);
  b = set(set(b, recs(b, "Enhanced Perception (Tier 1)")[0], { level: 3 }), recs(b, "Enhanced Perception (Tier 2)")[0], { level: 3 });
  assert.equal(validate(b).budgets.powerPoints.spent, 0.75 + 1.5, "human: +1..+3 at .25, +4..+6 at .5");
  b = run(b, [{ op: "addItem", catalogId: pw("Attribute Boost").id }, { op: "addItem", catalogId: pw("Attribute Boost").id }]);
  assert.ok(magicErrs(b).some(t => /choose the attribute/.test(t)));
  const [a1, a2] = recs(b, "Attribute Boost");
  b = set(set(b, a1, { boostAttribute: "body" }), a2, { boostAttribute: "body" });
  assert.equal(b.actor.items.find(i => i._id === a1).system.boostAttribute, "body", "the choice reaches the export");
  assert.ok(magicErrs(b).some(t => /already has an Attribute Boost/.test(t)));
  b = set(b, a2, { boostAttribute: "strength" });
  assert.ok(!magicErrs(b).some(t => /Attribute Boost/.test(t)));
});

test("M5n parity: an app-built adept with Mystic Armor, Enhanced Perception and Body Control derives as Foundry 0.166.0", () => {
  const fx = JSON.parse(readFileSync(new URL("fixtures/parity/powers-v0.168.0.json", import.meta.url), "utf8"));
  const system = JSON.parse(readFileSync(new URL("../content/sr2e-foundryvtt/system.json", import.meta.url), "utf8"));
  assert.equal(fx.version, system.version, "regenerate the fixture when the pin moves");
  for (const want of fx.actors) {
    const d = derive({ actor: want.source });
    assert.deepEqual(d.armor, want.armor, want.name);
    assert.equal(d.magic, want.magic, want.name);
  }
});

test("the export writes the Magic Rating Foundry never computes; a held value is kept (p.45)", async () => {
  const { toFoundryActor } = await import("../shared/foundry.mjs");
  const b = adept();
  assert.equal(toFoundryActor(b, "0.162.0").system.magic.value, derive({ actor: b.actor }).magic);
  const held = structuredClone(b); held.actor.system.magic.value = 3;
  assert.equal(toFoundryActor(held, "0.162.0").system.magic.value, 3);
  assert.equal(toFoundryActor(run(newCharacter("Mundane"), []), "0.162.0").system.magic?.value, undefined, "a mundane gets none written");
});

test("code review r1: a held Magic Rating (imported, or lowered in play) is the one derive uses, capped by Essence", () => {
  let b = run(adept(), [{ op: "addItem", catalogId: pw("Mystic Armor").id }]);
  b = set(b, recs(b, "Mystic Armor")[0], { level: 5 });
  const held = structuredClone(b); held.actor.system.magic.value = 3;
  const d = derive({ actor: held.actor }), base = derive({ actor: adept().actor }).armor.impact;
  assert.equal(d.magic, 3);
  assert.equal(d.armor.impact, base + 3, "Mystic Armor caps at the held Magic");
});

test("code review r2: in play the budget uses the held Magic; a power's report cites its own book", () => {
  let b = run(adept(), [{ op: "addItem", catalogId: pw("Mystic Armor").id }, { op: "addItem", catalogId: pw("Attribute Boost").id }, { op: "addItem", catalogId: pw("Attribute Boost").id }]);
  const [a1, a2] = recs(b, "Attribute Boost");
  b = set(set(b, a1, { boostAttribute: "body" }), a2, { boostAttribute: "body" });
  const rep = validate(b).problems.find(p => /already has an Attribute Boost/.test(p.text));
  assert.deepEqual(rep.cite, { book: "grim", page: "34" });
  const held = structuredClone(b); held.actor.system.magic.value = 0;
  assert.equal(validate(held).magic, 0, "the held rating, not Essence's");
});
