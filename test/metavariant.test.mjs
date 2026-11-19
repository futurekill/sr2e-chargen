/** M5b (docs/PLAN-M5b.md): metavariants from the Shadowrun Companion (p.39–44), as Foundry's race drop writes them. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate, booksOf } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";
import { TABLES, racialProfile, naturalAttribute } from "../shared/rules.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const BOOKS = catalog.books.map(b => b.key);
const run = (b, ops) => ops.reduce((x, o) => applyOp(x, o, lookup, { now: 1, catalogBooks: BOOKS }), b);
const race = (name) => { const e = catalog.entries.find(x => x.type === "race" && x.name === name); assert.ok(e, name); return e; };
const withSc = () => run(newCharacter("Variant"), [{ op: "setBooks", books: ["sc"] }]);

test("a Cyclops: the troll's Race A, Strength racial +6, the troll's maxima; changing metatype clears it", () => {
  let b = run(withSc(), [{ op: "setMetatype", race: "troll", variant: race("Cyclops").id },
    ...["body", "quickness", "strength", "charisma", "intelligence", "willpower"].map(attr => ({ op: "setAttribute", attr, base: 3 }))]);
  assert.equal(b.actor.system.metavariant.name, "Cyclops");
  const d = derive({ actor: b.actor });
  assert.equal(d.attributes.strength, 3 + 6);
  assert.equal(d.attributes.charisma, Math.min(3 - 2, TABLES.racialMaximums.troll.charisma));
  b = run(b, [{ op: "setMetatype", race: "troll" }]);
  assert.equal(b.actor.system.metavariant.name, "");
  assert.equal(derive({ actor: b.actor }).attributes.strength, 3 + 4);
});

test("refused: without the Companion, a variant of another metatype, a core race as a variant; the Companion stays on while a variant is chosen", () => {
  assert.throws(() => run(newCharacter("X"), [{ op: "setBooks", books: ["sc"] }, { op: "setBooks", books: [] }, { op: "setMetatype", race: "troll", variant: race("Cyclops").id }]), /isn't turned on/);
  assert.throws(() => run(withSc(), [{ op: "setMetatype", race: "ork", variant: race("Cyclops").id }]), /variant of the ork/);
  assert.throws(() => run(withSc(), [{ op: "setMetatype", race: "troll", variant: race("Troll").id }]), /variant of the troll/);
  const b = run(withSc(), [{ op: "setMetatype", race: "dwarf", variant: race("Koborokuru").id }]);
  assert.equal(racialProfile(b.actor.system, TABLES).mods.quickness, 0, "no Quickness penalty (p.40)");
  assert.throws(() => run(b, [{ op: "setBooks", books: [] }]), /comes from sc/);
  assert.deepEqual(booksOf(run(b, [{ op: "setMetatype", race: "dwarf" }, { op: "setBooks", books: [] }])), []);
});

test("the oni option (Companion p.42): Race B with Resources A, Magic C and an adept — only with the GM's option", () => {
  const oni = (on) => run(withSc(), [{ op: "setOption", key: "oniPriority", value: on }, { op: "setMetatype", race: "ork", variant: race("Oni").id },
    { op: "setPriority", category: "race", letter: "B" }, { op: "setPriority", category: "resources", letter: "A" }, { op: "setPriority", category: "magic", letter: "C" },
    { op: "setMagic", type: "physical_adept" }]);
  const raceErr = (b) => validate(b).problems.some(p => p.step === "metatype" && p.severity === "error");
  assert.equal(raceErr(oni(false)), true);
  assert.equal(raceErr(oni(true)), false);
  assert.equal(raceErr(run(oni(true), [{ op: "setMagic", type: "none" }])), true, "a mundane oni gets no exception");
});

test("parity: every Companion variant — derive's natural ratings are the system profile applied to the base", () => {
  for (const e of catalog.entries.filter(x => x.type === "race" && x.book === "sc" && x.system.raceKey !== "shapeshifter")) {
    const b = run(withSc(), [{ op: "setMetatype", race: e.system.raceKey, variant: e.id },
      ...["body", "quickness", "strength", "charisma", "intelligence", "willpower"].map(attr => ({ op: "setAttribute", attr, base: 3 }))]);
    const p = racialProfile(b.actor.system, TABLES), d = derive({ actor: b.actor });
    for (const a of Object.keys(p.mods)) assert.equal(d.attributes[a], Math.max(0, naturalAttribute(3, e.system.attributeMods[a], 0, p.maxes[a])), `${e.name} ${a}`);
  }
});

test("the sheet says Troll (Cyclops) with its notes; no client or shared code reads the racial tables directly", async () => {
  const { sheetModel } = await import("../server/sheet/model.mjs");
  const m = sheetModel(run(withSc(), [{ op: "setMetatype", race: "troll", variant: race("Cyclops").id }]));
  assert.equal(m.header.find(([k]) => k === "Metatype")[1], "Troll (Cyclops)");
  assert.match(m.header.find(([k]) => k === "Metatype notes")[1], /depth perception/);
  const files = [...readdirSync(new URL("shared/", root)).map(f => `shared/${f}`), ...readdirSync(new URL("client/src/pages/", root)).map(f => `client/src/pages/${f}`)]
    .filter(f => f !== "shared/rules.mjs");
  for (const f of files) assert.doesNotMatch(readFileSync(new URL(f, root), "utf8"), /TABLES\.racial(Modifiers|Maximums)/, f);
});
