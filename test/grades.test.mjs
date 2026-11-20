/** M5f (docs/PLAN-M5f.md): sourcebook cyberware and the SSC grades. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate, booksOf } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";
import { offerReason, essenceOf, priceInput } from "../shared/purchase.mjs";
import { chargenItemCost } from "../shared/rules.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const BOOKS = catalog.books.map(b => b.key);
const run = (b, ops) => ops.reduce((x, o) => applyOp(x, o, lookup, { now: 1, catalogBooks: BOOKS }), b);
const cy = (book, name) => { const e = catalog.entries.find(x => x.type === "cyberware" && x.book === book && (typeof name === "string" ? x.name === name : name.test(x.name))); assert.ok(e, String(name)); return e; };
const rec = (b, name) => Object.keys(b.creation.items).find(k => b.creation.items[k].name === name);
const item = (b, name) => b.actor.items.find(i => i.name === name);
const grade = (b, name, g) => run(b, [{ op: "setItem", itemId: rec(b, name), choices: { ...b.creation.items[rec(b, name)].choices, grade: g } }]);
const resErrors = (b) => validate(b).problems.filter(p => p.severity === "error" && p.step === "resources").map(p => p.text);

test("a beta Datajack: Essence ×0.6, price ×7; the SSC must be on and then can't be turned off", () => {
  let b = run(newCharacter("Chrome"), [{ op: "addItem", catalogId: cy("sr2", "Datajack").id }]);
  const std = chargenItemCost(priceInput(item(b, "Datajack"), b.actor.items));
  b = grade(b, "Datajack", "beta");
  assert.equal(essenceOf(item(b, "Datajack"), b.actor.items), 0.12);
  assert.equal(chargenItemCost(priceInput(item(b, "Datajack"), b.actor.items)), 7 * std);
  assert.equal(derive({ actor: b.actor }).essence, 5.88);
  assert.match(resErrors(b).join(), /Street Samurai Catalog — turn it on/);
  b = run(b, [{ op: "setBooks", books: ["ssc"] }]);
  assert.deepEqual(resErrors(b), []);
  assert.throws(() => run(b, [{ op: "setBooks", books: [] }]), /comes from ssc/);
  assert.deepEqual(booksOf(run(grade(b, "Datajack", "standard"), [{ op: "setBooks", books: [] }])), []);
});

test("book cyberware: plain implants offered; limbs, ruled ware, Skillwires and the tactical computer wait; Shadowtech has no grade", () => {
  const plain = catalog.entries.find(x => x.type === "cyberware" && x.book === "ssc" && offerReason(x, ["ssc"]) === null);
  assert.ok(plain, "an SSC implant is offered");
  assert.match(offerReason(cy("ct", "Hydraulic Jack"), ["ct"]) ?? "", /own rules/);   // limbs: PLAN-M5j
  assert.match(offerReason(cy("ct", "Skillwires"), ["ct"]) ?? "", /own rules/);
  const tac = catalog.entries.find(x => x.type === "cyberware" && x.system.isTacticalComputer && x.book !== "sr2");
  if (tac) assert.match(offerReason(tac, [tac.book]) ?? "", /own rules/);
  const st = catalog.entries.find(x => x.type === "cyberware" && x.book === "st" && offerReason(x, ["st"]) === null);
  if (st) { const b = run(newCharacter("ST"), [{ op: "setBooks", books: ["st"] }, { op: "addItem", catalogId: st.id }]); assert.ok(!("grade" in b.creation.items[rec(b, st.name)].choices)); }
});

test("an accessory inside a cybereye takes the eye's grade; a cyber weapon shows in the attacks", async () => {
  let b = run(newCharacter("Eyes"), [{ op: "setBooks", books: ["ssc"] }, { op: "addItem", catalogId: cy("sr2", /^Cybereyes/).id }, { op: "addItem", catalogId: cy("sr2", "Low-Light Vision").id }]);
  const eye = rec(b, b.creation.items[Object.keys(b.creation.items)[0]].name), ll = rec(b, "Low-Light Vision");
  b = run(b, [{ op: "setItem", itemId: ll, choices: { ...b.creation.items[ll].choices, in: eye, grade: "alpha" } }]);
  assert.match(resErrors(b).join(), /takes the eye's grade/);
  b = run(newCharacter("Claws"), [{ op: "addItem", catalogId: cy("sr2", /Hand Razors/).id }]);
  assert.ok(derive({ actor: b.actor }).weapons.some(w => /Hand Razors/.test(w.name)));
  const { cardModel } = await import("../server/sheet/model.mjs");
  const razors = b.actor.items.find(i => /Hand Razors/.test(i.name))._id;
  assert.ok(cardModel(b, [razors]).attacks.some(r => /Hand Razors/.test(r[0])), "the card can carry a cyber weapon's attack");
  for (const e of catalog.entries.filter(x => x.type === "cyberware" && x.book !== "sr2" && /skillwire/i.test(x.name))) assert.match(offerReason(e, BOOKS) ?? "", /own rules/, e.name);
});
