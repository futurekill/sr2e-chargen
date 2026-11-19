/** Physical adept powers at creation (docs/PLAN-M2c-2.md): priced by the system's adeptPowerBudget (core p.124–126). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const core = (name, type) => { const e = catalog.entries.find(x => x.book === "sr2" && x.name === name && (!type || x.type === type)); assert.ok(e, name); return e.id; };
const run = (b, ops) => ops.reduce((x, op) => applyOp(x, op, lookup), b);
const idOf = (b, name) => Object.entries(b.creation.items).find(([, r]) => r.name === name)[0];
const set = (b, name, choices) => applyOp(b, { op: "setItem", itemId: idOf(b, name), choices }, lookup);
const buy = (...names) => names.map(n => ({ op: "addItem", catalogId: core(n, "adept_power") }));
const cost = (b, name) => validate(b).budgets.powerPoints.costs[idOf(b, name)];
const adept = (race = "human", ops = []) => run(newCharacter("Tiger"), [
  { op: "setPriority", category: "magic", letter: "B" }, { op: "setMetatype", race }, { op: "setMagic", type: "physical_adept" }, ...ops]);
const texts = (b) => validate(b).problems.map(p => `${p.severity}: ${p.text}`).join("\n");

test("each book table row (p.125–126)", () => {
  let b = adept("human", buy("Combat Sense", "Increased Reflexes", "Killing Hands (D)", "Pain Resistance", "Astral Perception", "Improved Physical Senses"));
  assert.deepEqual([1, 2, 3].map(l => cost(set(b, "Combat Sense", { level: l }), "Combat Sense")), [2, 3, 4]);
  assert.deepEqual([1, 2, 3].map(l => cost(set(b, "Increased Reflexes", { level: l }), "Increased Reflexes")), [1, 4, 6]);
  b = set(b, "Pain Resistance", { level: 3 });
  b = set(b, "Improved Physical Senses", { senses: "low-light vision, thermographic vision" });
  assert.deepEqual(["Killing Hands (D)", "Pain Resistance", "Astral Perception", "Improved Physical Senses"].map(n => cost(b, n)), [4, 1.5, 2, 0.5]);
  assert.equal(b.actor.items.find(i => i.name === "Improved Physical Senses").system.notes, "Senses: low-light vision, thermographic vision");
  const v = validate(b);
  assert.deepEqual([v.budgets.powerPoints.spent, v.budgets.powerPoints.total], [2 + 1 + 4 + 1.5 + 2 + 0.5, 6]);
  assert.match(texts(b), /error: 11 power points used; the Magic Rating gives 6/);
});

test("Increased Reaction by the racial maximum: an elf (6) and a troll (4) at +3 (p.125)", () => {
  const three = (race) => cost(set(adept(race, buy("Increased Reaction")), "Increased Reaction", { level: 3 }), "Increased Reaction");
  assert.deepEqual([three("elf"), three("troll")], [1.5, 2]);
});

test("Improved Physical Attributes by the natural rating: a human with Quickness 4 buying +3 is 3.5 (p.125, R4)", () => {
  let b = adept("human", [{ op: "setAttribute", attr: "quickness", base: 4 }, ...buy("Improved Physical Attributes (Quickness)")]);
  b = set(b, "Improved Physical Attributes (Quickness)", { level: 3 });
  assert.equal(cost(b, "Improved Physical Attributes (Quickness)"), 3.5);
  assert.throws(() => run(b, buy("Improved Physical Attributes (Quickness)")), /already bought/);
});

test("Improved Ability names one of this character's skills; Firearms 3 on Firearms 2 is reported; a removed skill too", () => {
  let b = adept("human", [{ op: "addSkill", catalogId: core("Firearms", "skill") }, ...buy("Improved Ability")]);
  b = applyOp(b, { op: "setSkill", itemId: idOf(b, "Firearms"), allocated: 2, concentration: "", specialization: "", freeLanguage: "" }, lookup);
  assert.match(texts(b), /todo: Improved Ability: choose the skill it improves/);
  assert.throws(() => set(b, "Improved Ability", { skill: "cg00000000000099" }), /this character's skills/);
  b = set(b, "Improved Ability", { skill: idOf(b, "Firearms"), level: 3 });
  assert.equal(b.actor.items.find(i => i.name === "Improved Ability").system.improvedSkill, "Firearms");
  assert.equal(cost(b, "Improved Ability"), 3, "Firearms 1 per die");
  assert.match(texts(b), /error: 3 Improved Ability dice on Firearms 2/);
  b = applyOp(b, { op: "removeSkill", itemId: idOf(b, "Firearms") }, lookup);
  assert.match(texts(b), /error: Improved Ability: its skill is no longer on this character/);
});

test("powers on a non-adept are errors; Combat Sense adds Combat Pool dice (p.125)", () => {
  let b = adept("human", buy("Combat Sense"));
  const pool = derive({ actor: b.actor }).pools.combat;
  b = set(b, "Combat Sense", { level: 2 });
  assert.equal(derive({ actor: b.actor }).pools.combat, pool + 1);
  assert.match(texts(applyOp(b, { op: "setMagic", type: "none" }, lookup)), /error: Combat Sense: only a physical adept has powers/);
});
