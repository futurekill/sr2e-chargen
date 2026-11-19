/** M5c (docs/PLAN-M5c.md): creating a shapeshifter (Shadowrun Companion p.36–38). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate, priorityTable } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";
import { chargenBudget, SHAPESHIFTER_PRIORITIES } from "../shared/rules.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const BOOKS = catalog.books.map(b => b.key);
const run = (b, ops) => ops.reduce((x, o) => applyOp(x, o, lookup, { now: 1, catalogBooks: BOOKS }), b);
const entry = (name, type) => { const e = catalog.entries.find(x => x.name === name && x.type === type); assert.ok(e, name); return e.id; };
const errors = (b, step) => validate(b).problems.filter(p => p.severity === "error" && (!step || p.step === step)).map(p => p.text);
const ATTRS = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];
const shifter = (species = "Bear", prio = { race: "A", magic: "B", attributes: "C", skills: "D", resources: "E" }) =>
  run(newCharacter("Furry"), [{ op: "setBooks", books: ["sc"] }, { op: "setMetatype", race: "shapeshifter", variant: entry(`Shapeshifter (${species})`, "race") },
    ...Object.entries(prio).map(([category, letter]) => ({ op: "setPriority", category, letter })),
    ...ATTRS.map(attr => ({ op: "setAttribute", attr, base: 6 }))]);

test("a bear: Race A, its own table; base 6 legal, the human form's +1 Body past it, the animal form's +5", () => {
  const b = shifter();
  assert.deepEqual([b.actor.system.race, b.actor.system.shapeshifter.species, b.actor.system.shapeshifter.form], ["shapeshifter", "bear", "human"]);
  assert.equal(priorityTable(b.actor.system), SHAPESHIFTER_PRIORITIES);
  assert.deepEqual(errors(b, "attributes").filter(t => /maximum|exceed/.test(t)), []);
  const d = derive({ actor: b.actor });
  assert.equal(d.attributes.body, 7, "human form +1 Body (p.36)");
  assert.equal(d.forms.animal.attributes.body, 11, "animal form +5 Body");
  assert.equal(d.forms.animal.dermalDice, 2);
  assert.match(errors(run(b, [{ op: "setAttribute", attr: "body", base: 7 }]), "attributes").join(), /may not exceed 6/);
});

test("code review r1: adept powers stay out of the animal form; Karma prices the base + racial, never the form", async () => {
  const { karmaContext } = await import("../shared/creation.mjs");
  const b = shifter();
  const adept = { ...b, actor: { ...b.actor, system: { ...b.actor.system, magic: { ...b.actor.system.magic, type: "physical_adept" } },
    items: [...b.actor.items, { _id: "p1", type: "adept_power", name: "Improved Physical Attributes", system: { level: 1, attributeMods: { body: 1 } } }] } };
  const d = derive({ actor: adept.actor });
  assert.deepEqual([d.forms.human.attributes.body, d.forms.animal.attributes.body], [8, 11]);
  assert.equal(karmaContext(b).attributes.body.natural, 6, "6 → 7 costs 7, not the human form's 7 → 8");
  // Round 2: Improved Physical Attributes is priced from the human form (its racial modifier, R4) — as Foundry does.
  // A bear bought at Body 5 is Body 6 in human form, at the maximum of 6: the +1 is past it and costs more than at 5.
  const { adeptPowerBudget } = await import("../shared/rules.mjs");
  const ipa = { type: "adept_power", name: "Improved Physical Attributes (Body)", _stats: { compendiumSource: "Compendium.sr2e.adept-powers.Item.5075527b8eb8f404" },
    system: { pointCost: 1, level: 1, attributeMods: { body: 1, quickness: 0, strength: 0, reaction: 0 } }, flags: {} };
  const price = (nat) => adeptPowerBudget({ items: [ipa], maxes: { body: 6, quickness: 6, strength: 6 }, natural: { body: nat, quickness: 1, strength: 1 }, magic: 6 }).used;
  assert.ok(price(6) > price(5), "at the maximum, +1 costs more");
  const { formMod, withRacial } = await import("../shared/creation.mjs");
  const five = run(shifter(), [{ op: "setAttribute", attr: "body", base: 5 }]).actor.system;
  assert.equal(withRacial(five, "body") + formMod(five, "body"), 6, "the natural the app passes for a bear bought at 5");
});

test("Race must be A (More Metahumans changes nothing); Magic B buys a magician, C an adept", () => {
  const b = shifter("Wolf", { race: "B", magic: "A", attributes: "C", skills: "D", resources: "E" });
  assert.match(errors(run(b, [{ op: "setOption", key: "moreMetahumans", value: true }]), "metatype").join(), /needs Priority A in Race/);
  const mage = run(shifter("Wolf"), [{ op: "setMagic", type: "full_magician" }]);
  assert.deepEqual(errors(mage, "magic"), []);
  assert.match(errors(run(mage, [{ op: "setMagic", type: "physical_adept" }]), "magic").join(), /doesn't buy/);
});

test("no free contacts: the first one costs 5,000¥ and there's no 'two free contacts' to-do; no cyberware; no allergy points", () => {
  let b = run(shifter("Fox"), [{ op: "addItem", catalogId: entry("Fixer", "contact") }]);
  const spend = chargenBudget({ system: b.actor.system, items: b.actor.items, table: SHAPESHIFTER_PRIORITIES });
  assert.equal(spend.resources.spent, 5000);
  assert.ok(!validate(b).problems.some(p => /two free contacts/.test(p.text)));
  assert.throws(() => run(b, [{ op: "addItem", catalogId: entry("Datajack", "cyberware") }]), /rejects all cyberware/);
  assert.throws(() => run(b, [{ op: "setAllergy", substance: "Silver", rarity: "common", severity: "severe", rarityBonus: "attributes", severityBonus: "skills" }]), /Only a metahuman/);
  assert.throws(() => run(b, [{ op: "setBooks", books: [] }]), /comes from sc/);
});

test("changing to another metatype clears the species; the Karma Pool starts at 1 (R10); the sheet prints the animal form", async () => {
  const b = shifter("Seal");
  assert.equal(run(b, [{ op: "setMetatype", race: "elf" }]).actor.system.shapeshifter.species, "");
  assert.equal(derive({ actor: b.actor }).karmaPool, 1);
  const { sheetModel } = await import("../server/sheet/model.mjs");
  const h = Object.fromEntries(sheetModel(b).header);
  assert.match(h.Metatype, /Shapeshifter \(Seal\), human form/);
  assert.match(h["Animal form"], /^B \d+ Q \d+/);
});
