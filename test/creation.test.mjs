/** Character creation, core Priority system (docs/PLAN-M2.md M2a; rules: docs/RULES-CHARGEN.md, core pp.43–47). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TABLES, chargenSpend, label } from "../shared/rules.mjs";
import { newCharacter, applyOp, validate, Refusal, ATTRIBUTES, CORE_TOTEMS } from "../shared/creation.mjs";
import { forbiddenIn, importsOf, selectPaths } from "../tools/content.mjs";

const run = (ops, body = newCharacter("Razor")) => ops.reduce((b, op) => applyOp(b, op), body);
const prio = (p) => Object.entries(p).map(([category, letter]) => ({ op: "setPriority", category, letter }));
const attrs = (o) => Object.entries(o).map(([attr, base]) => ({ op: "setAttribute", attr, base }));
const texts = (b, step) => validate(b).problems.filter(p => !step || p.step === step).map(p => `${p.severity}: ${p.text} [p.${p.cite.page}]`);

test("the system's rules load from the project's copy, with the core book's Master Creation Table (p.47)", () => {
  assert.equal(typeof chargenSpend, "function");
  const row = (l) => { const r = TABLES.priorities[l]; return [r.attributes, r.skills, r.resources, r.forcePoints]; };
  assert.deepEqual(["A", "B", "C", "D", "E"].map(row), [[30, 40, 1e6, 50], [24, 30, 400000, 35], [20, 24, 90000, 25], [17, 20, 5000, 15], [15, 17, 500, 5]]);
  assert.equal(TABLES.racialMaximums.troll.body, 11);
  assert.equal(Object.keys(TABLES.totems).length, 15);
  assert.equal(CORE_TOTEMS.length, 14, "Mouse is not in the core book");
  assert.equal(label("SR2E.Magic.Hermetic"), "Hermetic");
  assert.equal(label("No.Such.Key"), "No.Such.Key");
});

test("the rules closure: only static file imports, no forbidden construct, nothing outside the system", () => {
  assert.deepEqual(importsOf("module/rules/a.mjs", `import { x } from "./b.mjs";\nexport { y } from "../config.mjs";`), ["module/rules/b.mjs", "module/config.mjs"]);
  assert.throws(() => importsOf("module/rules/a.mjs", `import x from "node:fs";`), /not a file of the system/);
  assert.deepEqual(forbiddenIn("// fetch(url)\n/* eval(x) */ const a = 1;"), []);
  assert.equal(forbiddenIn("const m = await import('./x.mjs');").length, 1);
  assert.equal(forbiddenIn("globalThis.game = {};").length, 1);
  assert.equal(forbiddenIn("if (globalThis.game === undefined) {}").length, 0);
  // A string can't hide a call; a computed global write and every import form are seen (code review M2a #1 #2).
  assert.deepEqual(forbiddenIn(`const a = "/*"; eval("1"); const b = "*/";`), ["eval()"]);
  assert.ok(forbiddenIn(`globalThis["pwned"] = true;`).length);
  assert.deepEqual(forbiddenIn("const o = { process: 1 }; o.window; class A { document() {} }"), [], "property names are not globals");
  assert.deepEqual(forbiddenIn(`import { process as p } from "./x.mjs"; export { p as window };`), []);
  assert.deepEqual(forbiddenIn(`globalThis.fetch("/x");`), ["globalThis.fetch"]);
  assert.deepEqual(forbiddenIn(`globalThis.globalThis.fetch("/x");`), ["globalThis.globalThis"]);
  assert.deepEqual(forbiddenIn(`self.fetch("/x");`), ["self"]);
  assert.deepEqual(forbiddenIn(`const g = globalThis; g.fetch("/x");`), ["globalThis as a value"]);
  assert.deepEqual(forbiddenIn(`const x = globalThis["fe" + "tch"];`), ["globalThis[…]"], "a computed key could reach anything: refused even on a read");
  assert.deepEqual(importsOf("module/rules/a.mjs", `import "./x.mjs"; export{foo}from"./y.mjs"; export * from "../z.mjs";`), ["module/rules/x.mjs", "module/rules/y.mjs", "module/z.mjs"]);
  const files = { "system.json": "{}", "lang/en.json": "{}", "module/config.mjs": `import "./rules/sr2e-rules.mjs";`,
    "module/rules/sr2e-rules.mjs": `export { a } from "./ware-rules.mjs";`, "module/rules/ware-rules.mjs": "export const a = 1;",
    "module/rules/shapeshift-rules.mjs": "export const s = 1;", "module/rules/vehicle-mounts.mjs": "export const m = 1;",
    "module/rules/vehicle-design.mjs": "export const d = 1;", "module/rules/vehicle-workshop-rules.mjs": `import { d } from "./vehicle-design.mjs";`, "module/rules/vehicle-mounts-r2.mjs": "export const r = 1;", "module/rules/npc-rules.mjs": `import { a } from "./sr2e-rules.mjs";`, "module/rules/unused.mjs": "export const b = 2;", "module/rules/books.mjs": "export const BOOKS = {};" };
  const kept = selectPaths(Object.keys(files), (p) => files[p]);
  assert.ok(!kept.includes("module/rules/unused.mjs"), "a module nothing imports is not copied");
  assert.ok(kept.includes("module/rules/ware-rules.mjs") && kept.includes("lang/en.json"));
  assert.throws(() => selectPaths(Object.keys(files), (p) => (p === "module/rules/ware-rules.mjs" ? "fetch('x')" : files[p])), /must not/);
  assert.deepEqual(selectPaths(["module.json", "packs-src/a.json", "module/rules/x.mjs", "data/design-rules.json", "data/other.json"], () => ""),
    ["module.json", "packs-src/a.json", "data/design-rules.json"], "a content module gives no code; only the design tables of its data");
});

test("a new character: nothing chosen, every attribute 1, on the Streets, creation in progress", () => {
  const b = newCharacter("  Razor   Blade ");
  assert.equal(b.name, "Razor Blade"); assert.equal(b.actor.name, "Razor Blade");
  assert.deepEqual(ATTRIBUTES.map(a => b.actor.system[a].base), [1, 1, 1, 1, 1, 1]);
  assert.equal(b.actor.system.lifestyle, "streets");
  assert.equal(b.actor.system.chargen.inProgress, true);
  assert.deepEqual(texts(b, "priorities"), ["todo: Choose a priority for Race, Magic, Attributes, Skills, Resources. [p.44]"]);
  assert.throws(() => newCharacter("   "), Refusal);
});

test("priorities: each letter once — taking a held letter swaps the two (p.44)", () => {
  const b = run(prio({ race: "A", magic: "B" }));
  const c = applyOp(b, { op: "setPriority", category: "magic", letter: "A" });
  assert.deepEqual([c.actor.system.chargen.priorities.race, c.actor.system.chargen.priorities.magic], ["B", "A"]);
  assert.throws(() => applyOp(b, { op: "setPriority", category: "luck", letter: "A" }), Refusal);
  assert.throws(() => applyOp(b, { op: "setPriority", category: "race", letter: "F" }), Refusal);
  const twice = structuredClone(b); twice.actor.system.chargen.priorities.skills = "A";   // only a hand-edited body can do this
  assert.match(texts(twice, "priorities").join(), /Priority A is used twice \(Race and Skills\)/);
});

test("metatype: a metahuman needs Race A; C or better under More Metahumans (p.44, p.46)", () => {
  const elfB = run([...prio({ race: "B" }), { op: "setMetatype", race: "elf" }]);
  assert.deepEqual(texts(elfB, "metatype"), ["error: An elf needs Priority A in Race. [p.44]"]);
  const mm = applyOp(applyOp(elfB, { op: "setOption", key: "moreMetahumans", value: true }), { op: "setPriority", category: "race", letter: "C" });
  assert.deepEqual(texts(mm, "metatype"), []);
  assert.deepEqual(texts(applyOp(mm, { op: "setPriority", category: "race", letter: "D" }), "metatype"), ["error: An elf needs Priority C or better in Race. [p.46]"]);
  assert.throws(() => applyOp(elfB, { op: "setMetatype", race: "shapeshifter" }), Refusal, "sourcebook metatypes are milestone 5");
});

test("magic: magician human A / metahuman B, adept human B / metahuman C; More Metahumans A/B for all (p.45–46)", () => {
  const magic = (race, letter, type, moreMetahumans = false) => {
    let b = run([...prio({ magic: letter, race: race === "human" ? "" : (moreMetahumans ? "C" : "A") }), { op: "setMetatype", race }, { op: "setMagic", type }]);
    if (moreMetahumans) b = applyOp(b, { op: "setOption", key: "moreMetahumans", value: true });
    return validate(b).problems.filter(p => p.step === "magic" && p.severity === "error").length === 0;
  };
  assert.equal(magic("human", "A", "full_magician"), true);
  assert.equal(magic("human", "A", "physical_adept"), false, "the table gives A to the magician");
  assert.equal(magic("human", "B", "full_magician"), false);
  assert.equal(magic("human", "B", "physical_adept"), true);
  assert.equal(magic("human", "C", "physical_adept"), false);
  assert.equal(magic("ork", "B", "full_magician"), true);
  assert.equal(magic("ork", "C", "full_magician"), false);
  assert.equal(magic("ork", "C", "physical_adept"), true);
  assert.equal(magic("ork", "D", "physical_adept"), false);
  assert.equal(magic("ork", "B", "full_magician", true), false);
  assert.equal(magic("ork", "A", "full_magician", true), true);
  assert.equal(magic("human", "A", "physical_adept", true), false);
  assert.equal(magic("human", "B", "physical_adept", true), true);
  assert.equal(magic("human", "C", "physical_adept", true), false);
});

test("magic: a magician picks a tradition; a shaman a totem (p.44); only they can", () => {
  let b = run([...prio({ magic: "A" }), { op: "setMagic", type: "full_magician" }]);
  assert.deepEqual(texts(b, "magic"), ["todo: Choose hermetic or shamanic. [p.44]"]);
  b = applyOp(b, { op: "setTradition", tradition: "shamanic" });
  assert.deepEqual(texts(b, "magic"), ["todo: A shaman chooses a totem. [p.44]"]);
  b = applyOp(b, { op: "setTotem", totem: "bear" });
  assert.deepEqual(texts(b, "magic"), []);
  assert.throws(() => applyOp(b, { op: "setTotem", totem: "toString" }), Refusal, "an inherited key is not a totem");
  assert.throws(() => applyOp(b, { op: "setTotem", totem: "mouse" }), Refusal, "not a core totem");
  const herm = applyOp(b, { op: "setTradition", tradition: "hermetic" });
  assert.equal(herm.actor.system.magic.totem, "", "a hermetic has no totem");
  const adept = applyOp(b, { op: "setMagic", type: "physical_adept" });
  assert.deepEqual([adept.actor.system.magic.tradition, adept.actor.system.magic.totem], ["none", ""]);
  assert.throws(() => applyOp(adept, { op: "setTradition", tradition: "hermetic" }), Refusal);
  const mundane = run([...prio({ magic: "A" })]);
  assert.deepEqual(texts(mundane, "magic"), ["warning: Priority A in Magic buys magic, but this character is mundane: the priority is wasted. [p.45]"]);
});

test("attributes: ≥ 1 after racial modifiers, ≤ the racial maximum (p.43, p.45); points = the priority's (p.45)", () => {
  const troll = run([...prio({ race: "A", attributes: "B" }), { op: "setMetatype", race: "troll" }]);
  assert.match(texts(troll, "attributes").join("\n"), /Charisma is -1 after racial modifiers/);
  const big = applyOp(troll, { op: "setAttribute", attr: "body", base: 7 });
  assert.match(texts(big, "attributes").join("\n"), /Body is 12 after racial modifiers; a troll's maximum is 11\. \[p\.43\]/);
  const over = run(attrs({ body: 6, quickness: 6, strength: 6, charisma: 6, intelligence: 6, willpower: 6 }), run(prio({ attributes: "E" })));
  assert.match(texts(over, "attributes").join(), /36 Attribute Points spent; Priority E gives 15/);
  assert.equal(validate(over).budgets.attributes.over, true);
  assert.throws(() => applyOp(over, { op: "setAttribute", attr: "body", base: 0 }), Refusal);
  assert.throws(() => applyOp(over, { op: "setAttribute", attr: "edge", base: 3 }), Refusal);
  assert.throws(() => applyOp(over, { op: "setAttribute", attr: "body", base: 2.5 }), Refusal);
});

test("a complete M2a character has no error and no todo for its steps", () => {
  // Human mage: Magic A, Attributes B (24), Race C… the rest arrive with M2b–M2d.
  const b = run([...prio({ magic: "A", attributes: "B", skills: "C", resources: "D", race: "E" }),
    { op: "setMagic", type: "full_magician" }, { op: "setTradition", tradition: "hermetic" },
    ...attrs({ body: 3, quickness: 4, strength: 2, charisma: 4, intelligence: 5, willpower: 6 })]);
  const v = validate(b);
  assert.deepEqual(v.problems.filter(p => !["skills", "contacts"].includes(p.step) && p.severity !== "warning"), []);
  assert.deepEqual(v.budgets.attributes, { spent: 24, total: 24, remaining: 0, over: false });
  assert.equal(v.budgets.forcePoints.total, 15, "Force Points come with the Resources priority, magicians only (p.46)");
});

test("refusals: an unknown operation; any creation change to a finished character", () => {
  assert.throws(() => applyOp(newCharacter("X"), { op: "setPrice", cost: 0 }), Refusal);
  assert.throws(() => applyOp(newCharacter("X"), { op: "setOption", key: "__proto__", value: true }), Refusal);
  const done = newCharacter("X"); done.creation.finished = { at: 1 };
  assert.throws(() => applyOp(done, { op: "setAttribute", attr: "body", base: 2 }), /finished/);
  assert.equal(applyOp(done, { op: "setNotes", notes: "still mine" }).notes, "still mine");
  const before = newCharacter("X"), snapshot = structuredClone(before);
  applyOp(before, { op: "setName", name: "Y" });
  assert.deepEqual(before, snapshot, "the reducer never changes its input");
});

/* ── Skills (M2b) ───────────────────────────────────────────────────────────────────────────────────────────── */
const CAT = {
  "sr2e.skills.fire": { id: "sr2e.skills.fire", type: "skill", book: "sr2", name: "Firearms", img: "x.webp", _stats: { compendiumSource: "Compendium.sr2e.skills.Item.fire" },
    system: { category: "active", linkedAttribute: "quickness", rating: 0, concentration: { name: "", rating: 0 }, specialization: { name: "", rating: 0 }, isMagical: false, notes: "" } },
  "sr2e.skills.sorc": { id: "sr2e.skills.sorc", type: "skill", book: "sr2", name: "Sorcery", system: { category: "active", linkedAttribute: "willpower", rating: 0, concentration: { name: "", rating: 0 }, specialization: { name: "", rating: 0 }, isMagical: true, notes: "" } },
  "sr2e.skills.eng": { id: "sr2e.skills.eng", type: "skill", book: "sr2", name: "English", system: { category: "language", linkedAttribute: "intelligence", rating: 0, concentration: { name: "", rating: 0 }, specialization: { name: "", rating: 0 }, isMagical: false, notes: "" } },
  "cp.skills.x": { id: "cp.skills.x", type: "skill", book: "cp", name: "Shapeshift", system: {} },
  "sr2e.gear.y": { id: "sr2e.gear.y", type: "gear", book: "sr2", name: "Medkit", system: {} }
};
const lookup = (id) => CAT[id] ?? null;
const runL = (ops, body = newCharacter("Razor")) => ops.reduce((b, op) => applyOp(b, op, lookup), body);
const skill = (b, name) => b.actor.items.find(i => i.name === name);
const setSkill = (b, name, o) => ({ op: "setSkill", itemId: skill(b, name)._id, allocated: 1, concentration: "", specialization: "", freeLanguage: "", ...o });

test("skills: added from the core catalog as Foundry item sources, with the app's record beside them", () => {
  const b = runL([{ op: "addSkill", catalogId: "sr2e.skills.fire" }]);
  const item = skill(b, "Firearms");
  assert.match(item._id, /^[a-z0-9]{16}$/);
  assert.deepEqual(Object.keys(item).sort(), ["_id", "_stats", "effects", "flags", "img", "name", "system", "type"], "no app field inside the item");
  assert.equal(item._stats.compendiumSource, "Compendium.sr2e.skills.Item.fire");
  assert.equal(b.creation.items[item._id].catalogId, "sr2e.skills.fire");
  assert.deepEqual([item.system.rating, item.system.allocated, item.system.ratingsFinalized], [1, 1, false]);
  assert.equal(runL([{ op: "addSkill", catalogId: "sr2e.skills.fire" }]).actor.items[0]._id, item._id, "the same id on the server and in the browser");
  assert.throws(() => runL([{ op: "addSkill", catalogId: "cp.skills.x" }]), /core book/);
  assert.throws(() => runL([{ op: "addSkill", catalogId: "sr2e.gear.y" }]), Refusal);
  assert.throws(() => runL([{ op: "addSkill", catalogId: "nope" }]), Refusal);
  assert.throws(() => applyOp(b, { op: "addSkill", catalogId: "sr2e.skills.fire" }), Refusal, "no lookup, no catalog entry");
});

test("skills: the book's p.70 example — Firearms 5 → Firearms 3, Pistols 5, Ares Predator 7", () => {
  let b = runL([{ op: "addSkill", catalogId: "sr2e.skills.fire" }]);
  b = applyOp(b, setSkill(b, "Firearms", { allocated: 5, concentration: "Pistols", specialization: "Ares Predator" }));
  const s = skill(b, "Firearms").system;
  assert.deepEqual([s.rating, s.concentration.rating, s.specialization.rating, s.allocated], [3, 5, 7, 5]);
  assert.deepEqual(texts(b, "skills").filter(t => !/native language/.test(t)), [], "within the rules (no priority yet: no budget line)");
  const conc = applyOp(b, setSkill(b, "Firearms", { allocated: 5, concentration: "SMG" }));
  assert.deepEqual([skill(conc, "Firearms").system.rating, skill(conc, "Firearms").system.concentration.rating], [4, 6]);
  assert.throws(() => applyOp(b, setSkill(b, "Firearms", { allocated: 5, specialization: "Uzi III" })), /concentration/, "a specialization needs its concentration");
  const tooSmall = applyOp(b, setSkill(b, "Firearms", { allocated: 1, concentration: "Pistols", specialization: "Ares Predator" }));
  assert.match(texts(tooSmall, "skills").join(), /needs an allocation of at least 2\. \[p\.70\]/);
});

test("skills: 1–6 at creation, Skill Points = the priority's (p.45), Sorcery needs a Magic Rating", () => {
  let b = runL([...prio({ skills: "E" }), { op: "addSkill", catalogId: "sr2e.skills.fire" }, { op: "addSkill", catalogId: "sr2e.skills.sorc" }]);
  b = applyOp(b, setSkill(b, "Firearms", { allocated: 7 }));
  b = applyOp(b, setSkill(b, "Sorcery", { allocated: 6 }));
  const t = texts(b, "skills").join("\n");
  assert.match(t, /Firearms is 7: no starting skill above 6/);
  assert.match(t, /Sorcery needs a Magic Rating\. \[p\.45\]/);
  assert.equal(validate(b).budgets.skills.spent, 13);
  b = applyOp(b, setSkill(b, "Firearms", { allocated: 6 }));
  assert.match(texts(b, "skills").join(), /5 Skill Points left to spend/, "17 − 12");
  b = applyOp(applyOp(b, { op: "setPriority", category: "magic", letter: "A" }), { op: "setMagic", type: "full_magician" });
  assert.doesNotMatch(texts(b, "skills").join(), /Magic Rating/);
  assert.throws(() => applyOp(b, setSkill(b, "Firearms", { allocated: 13 })), Refusal);
  // The cap is on the general rating after p.70's reduction (docs/RULINGS.md R1).
  const conc7 = applyOp(b, setSkill(b, "Firearms", { allocated: 7, concentration: "Pistols" }));
  assert.deepEqual([skill(conc7, "Firearms").system.rating, skill(conc7, "Firearms").system.concentration.rating], [6, 8]);
  assert.doesNotMatch(texts(conc7, "skills").join(), /above 6/);
  assert.match(texts(applyOp(b, setSkill(b, "Firearms", { allocated: 8, concentration: "Pistols" })), "skills").join(), /Firearms is 7/);
});

test("languages: the native language is free at Intelligence + 2; a Street dialect at ½ Intelligence (p.74)", () => {
  let b = runL([...prio({ skills: "E" }), ...attrs({ intelligence: 5 }), { op: "addSkill", catalogId: "sr2e.skills.eng" }, { op: "addCustomSkill", category: "language", name: "Cityspeak" }]);
  assert.match(texts(b, "skills").join(), /native language/);
  b = applyOp(b, setSkill(b, "English", { freeLanguage: "native" }));
  b = applyOp(b, setSkill(b, "Cityspeak", { freeLanguage: "dialect" }));
  assert.deepEqual([skill(b, "English").system.rating, skill(b, "Cityspeak").system.rating], [7, 2], "may exceed 6");
  assert.equal(validate(b).budgets.skills.spent, 0, "free languages cost no Skill Points");
  b = applyOp(b, { op: "setAttribute", attr: "intelligence", base: 6 });
  assert.equal(skill(b, "English").system.rating, 8, "follows Intelligence");
  const two = applyOp(b, setSkill(b, "Cityspeak", { freeLanguage: "native" }));
  assert.match(texts(two, "skills").join(), /Only one native language is free/);
  const rich = structuredClone(b); rich.actor.system.lifestyle = "high";
  assert.match(texts(rich, "skills").join(), /dialect comes with a Street lifestyle/);
  assert.throws(() => applyOp(b, setSkill(b, "English", { freeLanguage: "native", concentration: "Seattle slang" })), /free language/, "no free tiers (review M2b #1)");
  const gun = runL([{ op: "addSkill", catalogId: "sr2e.skills.fire" }]);
  assert.throws(() => applyOp(gun, setSkill(gun, "Firearms", { freeLanguage: "native" })), /Only a language/);
});

test("custom skills: Knowledge, Language, Build/Repair by name; removal; duplicates reported", () => {
  let b = runL([{ op: "addCustomSkill", category: "knowledge", name: "  Seattle   Gangs " }, { op: "addCustomSkill", category: "knowledge", name: "seattle gangs" }]);
  assert.equal(b.actor.items[0].name, "Seattle Gangs");
  assert.equal(b.actor.items[0].system.linkedAttribute, "intelligence");
  assert.match(texts(b, "skills").join(), /listed twice/);
  assert.throws(() => applyOp(b, { op: "addCustomSkill", category: "active", name: "Hacking" }), Refusal, "active skills come from the catalog");
  assert.throws(() => applyOp(b, { op: "addCustomSkill", category: "knowledge", name: "x".repeat(61) }), Refusal);
  assert.throws(() => applyOp(b, { op: "addCustomSkill", category: "knowledge", name: "   " }), Refusal);
  assert.throws(() => applyOp(b, { op: "addCustomSkill", category: "knowledge", name: "sorcery" }), /core list/, "review M2b #4");
  b = applyOp(b, { op: "removeSkill", itemId: b.actor.items[1]._id });
  assert.equal(b.actor.items.length, 1); assert.equal(Object.keys(b.creation.items).length, 1);
  assert.throws(() => applyOp(b, { op: "removeSkill", itemId: "nope" }), Refusal);
  assert.throws(() => applyOp(b, { op: "removeSkill", itemId: "__proto__" }), Refusal);
});

test("an item the app has no record of (a character made in Foundry) survives every operation", () => {
  const b = newCharacter("Import");
  b.actor.items.push({ _id: "abcdefABCDEF0123", name: "Foundry Thing", type: "gear", system: { cost: 5 }, flags: {}, effects: [] });
  const after = applyOp(applyOp(b, { op: "setName", name: "Still Here" }), { op: "addCustomSkill", category: "knowledge", name: "Seattle" });
  assert.ok(after.actor.items.some(i => i._id === "abcdefABCDEF0123" && i.system.cost === 5));
});

test("a new record never takes an id an imported item already has (card r1 #4)", () => {
  const b = newCharacter("Import");
  b.actor.items.push({ _id: "cg00000000000001", name: "Imported Pistol", type: "weapon", system: {}, flags: {}, effects: [] });
  const after = applyOp(b, { op: "addCustomSkill", category: "knowledge", name: "Seattle" });
  assert.ok(after.actor.items.some(i => i.name === "Imported Pistol"));
  assert.ok(after.actor.items.some(i => i.name === "Seattle" && i._id !== "cg00000000000001"));
});
