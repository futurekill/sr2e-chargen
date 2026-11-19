/** M5i (docs/PLAN-M5i.md): rule-bearing implants — what is offered, what still waits, the warnings, the sheet. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";
import { offerReason, essenceOf, priceInput, WARE_RULES_OFFERED } from "../shared/purchase.mjs";
import { chargenItemCost, wareRule, limbRole } from "../shared/rules.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const BOOKS = catalog.books.map(b => b.key);
const run = (b, ops) => ops.reduce((x, o) => applyOp(x, o, lookup, { now: 1, catalogBooks: BOOKS }), b);
const cy = (book, name) => { const e = catalog.entries.find(x => x.type === "cyberware" && x.book === book && x.name === name); assert.ok(e, name); return e; };
const rec = (b, name) => Object.keys(b.creation.items).find(k => b.creation.items[k].name === name);
const item = (b, name) => b.actor.items.find(i => i.name === name);
const texts = (b, sev) => validate(b).problems.filter(p => p.severity === sev).map(p => p.text);

test("offered: reflexes, body ware and plain headware; still waiting: IMS (comes with cybermancy), encephalon, rigger modules, CT cybereyes", () => {
  for (const n of ["Wired Reflexes (Level 2)", "Reaction Enhancer +3", "Move-by-Wire System (Level 2)", "Muscle Replacement (Rating 2)", "Dermal Sheath (Level 2)",
    "Body Plating (Hard Armor, Level 1)", "Bone Lacing (Titanium)", "Datajack (Improved)", "Commlink IV", "Cranial Bomb: Kink Bomb", "Eye Laser Designator", "Reflex Trigger"])
    assert.equal(offerReason(cy("ct", n), ["ct"]), null, n);
  assert.match(offerReason(cy("ct", "Invoked Memory Stimulator"), ["ct"]), /cybermantic operation/);
  assert.match(offerReason(cy("ct", "Automatic-Medication System"), ["ct"]), /cybermantic operation/);
  for (const n of ["Encephalon", "Cybereyes", "Tactical Computer", "Cyberarm"]) assert.match(offerReason(cy("ct", n), ["ct"]) ?? "", /own rules/, n);
  assert.match(offerReason(cy("r2", "Remote Control Deck"), ["r2"]) ?? "", /own rules/);
});

test("the audit: every offered book cyberware has an allowed rule (or none) and none of the fields derive ignores", () => {
  const offered = catalog.entries.filter(e => e.type === "cyberware" && e.book !== "sr2" && offerReason(e, BOOKS) === null);
  assert.ok(offered.length > 200, `offered ${offered.length}`);
  for (const e of offered) {
    const s = e.system, src = e._stats?.compendiumSource ?? null, rule = wareRule(e.flags, src);
    assert.ok(!rule || WARE_RULES_OFFERED.has(rule.split(":")[0]), `${e.name}: ${rule}`);
    assert.ok(!s.isTacticalComputer && !s.skillwirePlus && !s.accessPorts && !s.cranialDeck && !(s.capacity > 0) && !limbRole(s, e.flags ?? {}, src) && !e.effects?.length, e.name);
  }
});

test("an alpha Wired Reflexes: Essence ×0.8, price ×3 (SSC p.98), Reaction and Initiative as Foundry's", () => {
  let b = run(newCharacter("Sammy"), [{ op: "setBooks", books: ["ct", "ssc"] }, { op: "addItem", catalogId: cy("ct", "Wired Reflexes (Level 2)").id }]);
  const std = chargenItemCost(priceInput(item(b, "Wired Reflexes (Level 2)"), b.actor.items)), ess = essenceOf(item(b, "Wired Reflexes (Level 2)"), b.actor.items);
  const id = rec(b, "Wired Reflexes (Level 2)");
  b = run(b, [{ op: "setItem", itemId: id, choices: { ...b.creation.items[id].choices, grade: "alpha" } }]);
  assert.equal(essenceOf(item(b, "Wired Reflexes (Level 2)"), b.actor.items), Math.round(ess * 0.8 * 100) / 100);
  assert.equal(chargenItemCost(priceInput(item(b, "Wired Reflexes (Level 2)"), b.actor.items)), 3 * std);
  assert.equal(derive({ actor: b.actor }).initiativeDice, 3);
});

test("warnings: move-by-wire with a reflex enhancer, a second move-by-wire (error), Reaction Enhancers over +6", () => {
  let b = run(newCharacter("Wire"), [{ op: "setBooks", books: ["ct"] }, { op: "addItem", catalogId: cy("ct", "Move-by-Wire System (Level 1)").id }, { op: "addItem", catalogId: cy("ct", "Wired Reflexes (Level 1)").id }]);
  assert.ok(texts(b, "warning").some(t => /^Wired Reflexes \(Level 1\): not compatible with move-by-wire/.test(t)));
  b = run(b, [{ op: "addItem", catalogId: cy("ct", "Move-by-Wire System (Level 2)").id }]);
  assert.ok(texts(b, "error").some(t => /Only one move-by-wire/.test(t)));
  b = run(newCharacter("Fast"), [{ op: "setBooks", books: ["ct"] }, { op: "addItem", catalogId: cy("ct", "Reaction Enhancer +6").id }, { op: "addItem", catalogId: cy("ct", "Reaction Enhancer +1").id }]);
  assert.ok(texts(b, "warning").some(t => /\+7: \+6 at most .*\(\+1 lost\)/.test(t)));
  assert.equal(derive({ actor: b.actor }).enhancerExcess, 1);
});

test("the sheet shows both Control Pools when Rigger 2's differs (r3 #1)", async () => {
  const { sheetModel } = await import("../server/sheet/model.mjs");
  const vcr = catalog.entries.find(e => e.type === "cyberware" && e.book === "sr2" && e.system.isVcr);
  let b = run(newCharacter("Rig"), [{ op: "setBooks", books: ["ct"] }, { op: "addItem", catalogId: vcr.id }, { op: "addItem", catalogId: cy("ct", "Move-by-Wire System (Level 1)").id }]);
  const d = derive({ actor: b.actor });
  assert.notEqual(d.pools.control, d.pools.controlRigger2);
  const m = sheetModel(b);
  assert.ok(m.pools.some(([k, v]) => k === "Control" && v === `${d.pools.control} (Rigger 2 rules: ${d.pools.controlRigger2})`));
  b = run(newCharacter("Plain"), [{ op: "addItem", catalogId: vcr.id }]);
  const p = derive({ actor: b.actor }).pools;
  assert.ok(sheetModel(b).pools.some(([k, v]) => k === "Control" && v === String(p.control)), "no second value when they agree");
});

test("bone lacing through a real purchase raises the fist every character has (r1 #1); a failed second-hand part counts only Essence (r1 #2)", () => {
  let b = run(newCharacter("Lace"), [{ op: "setBooks", books: ["ct"] }, { op: "addItem", catalogId: cy("ct", "Bone Lacing (Plastic)").id }]);
  assert.deepEqual(derive({ actor: b.actor }).weapons.map(w => [w.name, w.damageCode]), [["Unarmed Strike", "(Str+1)M"]]);
  b = run(newCharacter("Junk"), [{ op: "setBooks", books: ["ct"] }, { op: "addItem", catalogId: cy("ct", "Move-by-Wire System (Level 1)").id }, { op: "addItem", catalogId: cy("ct", "Wired Reflexes (Level 1)").id }]);
  const before = derive({ actor: b.actor });
  item(b, "Move-by-Wire System (Level 1)").system.secondhandFailed = true;
  const after = derive({ actor: b.actor });
  assert.deepEqual([after.mbwLevel, after.essence, after.reaction], [0, before.essence, before.reaction - 2]);
  assert.ok(!texts(b, "warning").some(t => /move-by-wire/.test(t)), "no conflict with a dead implant");
});

