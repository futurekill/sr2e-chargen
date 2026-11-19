/** Resources (docs/PLAN-M2c.md): buying the core book's gear, cyberware, spells and foci, on the REAL catalog. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate, Refusal } from "../shared/creation.mjs";
import { bondingCost } from "../shared/purchase.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const core = (name) => { const e = catalog.entries.find(x => x.book === "sr2" && x.name === name); assert.ok(e, name); return e.id; };
const start = (ops = []) => ops.reduce((b, op) => applyOp(b, op, lookup), newCharacter("Razor"));
const idOf = (b, name) => Object.entries(b.creation.items).find(([, r]) => r.name === name)[0];
const item = (b, name) => b.actor.items.find(i => i.name === name);
const buy = (...names) => names.map(n => ({ op: "addItem", catalogId: core(n) }));
const set = (b, name, choices) => applyOp(b, { op: "setItem", itemId: idOf(b, name), choices }, lookup);
const prio = (p) => Object.entries(p).map(([category, letter]) => ({ op: "setPriority", category, letter }));
const texts = (b) => validate(b).problems.map(p => `${p.severity}: ${p.text} [p.${p.cite.page}]`).join("\n");

test("prices are the system's own: rated gear × quantity, ammo by the bundle, list price (p.46)", () => {
  let b = start([...prio({ resources: "D" }), ...buy("Jammer", "Regular Ammo", "Ares Predator")]);
  b = set(b, "Jammer", { quantity: 2, rating: 3 });
  b = set(b, "Regular Ammo", { bundles: 3 });
  assert.equal(item(b, "Regular Ammo").system.quantity, 30, "rounds");
  assert.equal(item(b, "Regular Ammo").flags.sr2e.acquiredListValue, 60);
  const v = validate(b);
  assert.equal(v.budgets.resources.spent, 2 * 3 * 1000 + 3 * 20 + 450);   // Jammer 1,000¥ × Rating (p.257); ammo 20¥/10; Predator 450¥
  assert.match(texts(b), /6,510¥ spent; Priority D gives 5,000¥\. \[p\.46\]/);
  assert.throws(() => set(b, "Jammer", { rating: 7 }), /1 to 6/, "no starting gear above 6 (p.44)");
  assert.throws(() => set(b, "Jammer", { price: 0 }), /no choice "price"/);
  assert.throws(() => set(b, "Regular Ammo", { quantity: 1 }), /no choice/, "ammo is bought by the bundle");
});

test("cybereyes absorb accessories up to .5 Essence (core p.247); accessories become rows of the eye", () => {
  let b = start(buy("Cybereyes", "Low-Light Vision", "Thermographic Vision", "Flare Compensation", "Eye Camera"));
  for (const n of ["Low-Light Vision", "Thermographic Vision"]) b = set(b, n, { in: idOf(b, "Cybereyes") });
  const eye = item(b, "Cybereyes");
  assert.deepEqual(eye.system.modules.map(r => [r.name, r.kind, r.essenceCost, r.listValue]), [["Low-Light Vision", "accessory", 0.2, 3000], ["Thermographic Vision", "accessory", 0.2, 3000]]);
  assert.equal(item(b, "Low-Light Vision"), undefined, "not a separate item any more");
  assert.equal(validate(b).essence, Math.round((6 - 0.2 - 0.1 - 0.4) * 100) / 100, ".4 inside the eye is free; Flare Comp and the camera still outside");
  b = set(b, "Flare Compensation", { in: idOf(b, "Cybereyes") });
  b = set(b, "Eye Camera", { in: idOf(b, "Cybereyes") });
  assert.equal(validate(b).essence, Math.round((6 - 0.2 - 0.4) * 100) / 100, ".9 in the eye: .5 free, .4 over");
  assert.equal(item(b, "Cybereyes").system.modules.find(r => r.name === "Eye Camera").kind, "camera");
  assert.equal(validate(b).budgets.resources.spent, 5000 + 3000 + 3000 + 2000 + 5000, "accessories still cost their price");
  assert.throws(() => set(b, "Eye Camera", { in: idOf(b, "Low-Light Vision") }), /cybereye/);
  b = applyOp(b, { op: "removeItem", itemId: idOf(b, "Cybereyes") }, lookup);
  assert.deepEqual(b.actor.items, [], "its accessories go with it");
});

test("Essence below 0 is reported; Magic follows Essence (p.45–46); magic needs a Magic Rating", () => {
  let b = start([...prio({ magic: "A" }), { op: "setMagic", type: "full_magician" }, { op: "addSkill", catalogId: core("Sorcery") }, ...buy("Wired Reflexes (Level 3)", "Vehicle Control Rig")]);
  b = set(b, "Vehicle Control Rig", { rating: 2 });
  const v = validate(b);
  assert.ok(v.essence < 1, `Essence ${v.essence}`);
  assert.equal(v.magic, Math.max(0, Math.floor(v.essence)));
  assert.match(texts(b), /no Magic Rating/);
  assert.match(texts(b), /Sorcery needs a Magic Rating/);
});

test("spells and foci spend Force Points (p.46, p.137); only magicians", () => {
  let b = start([...prio({ magic: "A", resources: "C" }), { op: "setMagic", type: "full_magician" }, ...buy("Mana Bolt", "Power Focus", "Spell Focus")]);
  b = set(b, "Mana Bolt", { force: 6 });
  b = set(b, "Power Focus", { force: 2 });
  b = set(b, "Spell Focus", { force: 3 });
  assert.equal(item(b, "Power Focus").system.bondingCost, 10, "5 × Rating");
  assert.equal(item(b, "Power Focus").system.bonded, true, "creation pays the bond");
  assert.match(texts(b), /Spell Focus: choose the spell it's bonded to/);
  b = set(b, "Spell Focus", { spell: idOf(b, "Mana Bolt") });
  assert.equal(item(b, "Spell Focus").system.boundSpellId, idOf(b, "Mana Bolt"));
  const v = validate(b);
  assert.deepEqual([v.budgets.forcePoints.spent, v.budgets.forcePoints.total], [6 + 10 + 3, 25]);
  assert.equal(v.budgets.resources.spent, 2 * 105000 + 3 * 45000, "Power Focus 105,000¥ × Rating, Specific Spell Focus 45,000¥ × Rating (p.263)");
  assert.throws(() => set(b, "Mana Bolt", { force: 7 }), /1 to 6/, "no starting spell above Force 6 (p.46)");
  const gone = applyOp(b, { op: "removeItem", itemId: idOf(b, "Mana Bolt") }, lookup);
  assert.match(texts(gone), /its spell is no longer on this character/);
  const adept = applyOp(b, { op: "setMagic", type: "physical_adept" }, lookup);
  assert.match(texts(adept), /Mana Bolt: only a full magician learns spells/);
  assert.match(texts(adept), /Power Focus: a physical adept can use only a weapon focus\. \[p\.124\]/);
  // An adept is a magician (p.124): Force Points from Resources (p.46), spent on bonding a weapon focus.
  let pa = start([...prio({ magic: "B", resources: "C" }), { op: "setMagic", type: "physical_adept" }, ...buy("Weapon Focus", "Katana")]);
  pa = set(pa, "Weapon Focus", { weapon: idOf(pa, "Katana"), force: 2 });
  assert.deepEqual([validate(pa).budgets.forcePoints.spent, validate(pa).budgets.forcePoints.total], [10, 25]);
  assert.doesNotMatch(texts(pa), /Weapon Focus: .*(only|physical adept)/);
  assert.match(texts(applyOp(pa, { op: "setMagic", type: "none" }, lookup)), /Weapon Focus: only a magician bonds a focus/);
  assert.deepEqual([1, 2, 3].map(f => [bondingCost("spell", f), bondingCost("spirit", f), bondingCost("power", f)]), [[1, 2, 5], [2, 4, 10], [3, 6, 15]]);
  assert.equal(bondingCost("spell_lock", 1), 1);
});

test("refused at creation: no fixed price, limb options, vehicles, sourcebooks", () => {
  for (const n of ["Personal Computer (Pocket)", "DataSoft", "Smartgun System (Internal)", "Built-In Device (Cyberlimb)", "Unarmed Strike"])
    assert.throws(() => start(buy(n)), Refusal, n);
  for (const type of ["vehicle"]) {
    const e = catalog.entries.find(x => x.book === "sr2" && x.type === type);
    assert.throws(() => start([{ op: "addItem", catalogId: e.id }]), Refusal, type);
  }
  const ssc = catalog.entries.find(x => x.book !== "sr2" && x.type === "weapon");
  assert.throws(() => start([{ op: "addItem", catalogId: ssc.id }]), /core book/);
  assert.throws(() => start([{ op: "addItem", catalogId: core("Firearms") }]), /Skills step/);
});

test("skillsofts: the rating is a choice, the category is the entry's, the chip names its skill", () => {
  let b = start(buy("ActiveSoft"));
  assert.match(texts(b), /ActiveSoft: name the skill on the chip/);
  b = set(b, "ActiveSoft", { rating: 4, skill: "Pistols" });
  assert.deepEqual([item(b, "ActiveSoft").system.grantedSkill, item(b, "ActiveSoft").system.grantedSkillCategory, item(b, "ActiveSoft").system.rating], ["Pistols", "active", 4]);
  assert.throws(() => set(b, "ActiveSoft", { grantedSkillCategory: "language" }), /no choice/);
  assert.ok(validate(b).budgets.resources.spent > 0);
});

test("code review r1: rating above 6 reported, Bow Str Min 1–6, a focus bonds only this character's spell, unknown ops", () => {
  const gyro = catalog.entries.find(x => x.book === "sr2" && x.type === "gear" && Number(x.system.rating) > 6 && !(x.system.ratingStats?.length > 1) && !(x.system.costPerRating > 0));
  if (gyro) assert.match(texts(start(buy(gyro.name))), /no starting gear above 6\. \[p\.44\]/, gyro.name);
  const bow = start(buy("Bow"));
  assert.throws(() => set(bow, "Bow", { strengthMinimum: 7 }), /1 to 6/);
  let b = start([{ op: "setMagic", type: "full_magician" }, ...buy("Spell Focus")]);
  assert.throws(() => set(b, "Spell Focus", { spell: "cg00000000000099" }), /this character's spells/);
  assert.throws(() => applyOp(newCharacter("X"), { op: "__proto__" }), Refusal);
  assert.throws(() => applyOp(newCharacter("X"), { op: "toString" }), Refusal);
  const mage = start([...prio({ magic: "A", resources: "A" }), { op: "setMagic", type: "full_magician" }]);
  assert.match(texts(mage), /warning: 50 Force Points unspent/);
});

test("muscle replacement next to a full cyberlimb is priced as Foundry prices it (wareCtx reads the source shape)", () => {
  const arm = byId.get(core("Cyberarm (Full)")), muscle = byId.get(core("Muscle Replacement (Rating 1)"));
  const b = start(buy("Cyberarm (Full)", "Muscle Replacement (Rating 1)"));
  // One full cyberlimb: muscle replacement 20% cheaper (the system's wareCtx/muscleFactor, as Foundry's panel prices it).
  assert.equal(validate(b).budgets.resources.spent, arm.system.cost + Math.ceil(muscle.system.cost * 0.8 - 1e-9));
});

test("armor bought at creation is worn, so the sheet's armor totals include it", async () => {
  const { derive } = await import("../shared/derive.mjs");
  const b = start(buy("Armor Jacket"));
  assert.equal(item(b, "Armor Jacket").system.equipped, true);
  assert.deepEqual(derive({ actor: b.actor }).armor, { ballistic: 5, impact: 3 });
});

test("a weapon focus bonds to one melee weapon of this character: priced by its Reach (p.263), bonded 4 × Force if small (Conceal > 5), else 5 × (p.137, R5)", () => {
  let b = start([...prio({ magic: "A", resources: "A" }), { op: "setMagic", type: "full_magician" }, ...buy("Weapon Focus", "Katana", "Ares Predator", "Pole Arm", "Knife")]);
  assert.match(texts(b), /todo: Weapon Focus: choose the melee weapon it's bonded to\. \[p\.137\]/);
  assert.equal(item(b, "Weapon Focus").system.cost, 100000 + 90000, "unbonded: priced at Reach 0, its lowest");
  assert.throws(() => set(b, "Weapon Focus", { weapon: idOf(b, "Ares Predator") }), /melee weapons/, "a firearm can't be a focus (p.147)");
  assert.throws(() => set(b, "Weapon Focus", { size: "small" }), /no choice "size"/, "the weapon decides the size");
  b = set(b, "Weapon Focus", { weapon: idOf(b, "Knife"), force: 3 });
  assert.deepEqual([item(b, "Weapon Focus").system.cost, item(b, "Weapon Focus").system.bondingCost], [100000 + 3 * 90000, 12], "Knife: Conceal 8, small");
  b = set(b, "Weapon Focus", { weapon: idOf(b, "Katana") });
  const f = item(b, "Weapon Focus").system;
  assert.deepEqual([f.cost, f.bondingCost, f.bondedWeaponId, f.bonded], [(1 + 1) * 100000 + 3 * 90000, 15, idOf(b, "Katana"), true], "Katana: Conceal 3, large");
  assert.equal(validate(b).budgets.forcePoints.spent, 15);
  b = set(b, "Weapon Focus", { weapon: idOf(b, "Pole Arm") });
  assert.deepEqual([item(b, "Weapon Focus").system.cost, item(b, "Weapon Focus").system.bondingCost], [3 * 100000 + 3 * 90000, 15]);
  b = applyOp(b, { op: "addItem", catalogId: core("Weapon Focus") }, lookup);
  const second = Object.keys(b.creation.items).sort().at(-1);
  assert.throws(() => applyOp(b, { op: "setItem", itemId: second, choices: { weapon: idOf(b, "Pole Arm") } }, lookup), /already a focus/);
  assert.equal(validate(b).budgets.resources.spent, 3 * 100000 + 3 * 90000 + 100000 + 90000 + 1000 + 450 + 500 + 30, "two foci (one at Reach 0), Katana, Predator, Pole Arm, Knife");
  b = set(b, "Katana", { quantity: 2 });
  assert.throws(() => applyOp(b, { op: "setItem", itemId: second, choices: { weapon: idOf(b, "Katana") } }, lookup), /quantity 1/);
  b = set(b, "Pole Arm", { quantity: 2 });
  assert.match(texts(b), /error: Weapon Focus: a focus is one weapon, but Pole Arm has quantity 2\. \[p\.137\]/);
  b = applyOp(b, { op: "removeItem", itemId: idOf(b, "Pole Arm") }, lookup);
  const f2 = item(b, "Weapon Focus").system;
  assert.deepEqual([f2.bondedWeaponId, f2.bonded, f2.cost], ["", false, 100000 + 3 * 90000], "removing the weapon unbonds its focus");
});
