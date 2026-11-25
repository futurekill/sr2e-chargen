/** M5j (docs/PLAN-M5j.md): cyberlimbs — the gate, sides and links, placement, prices, the rules check. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate } from "../shared/creation.mjs";
import { offerReason, limbOptionCostOf, price, project, pricedItems, essenceOf } from "../shared/purchase.mjs";
import { derive } from "../shared/derive.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const BOOKS = catalog.books.map(b => b.key);
const run = (b, ops) => ops.reduce((x, o) => applyOp(x, o, lookup, { now: 1, catalogBooks: BOOKS }), b);
const cy = (book, name) => { const e = catalog.entries.find(x => x.type === "cyberware" && x.book === book && x.name === name); assert.ok(e, name); return e; };
const recs = (b, name) => Object.keys(b.creation.items).filter(k => b.creation.items[k].name === name);
const set = (b, id, ch) => run(b, [{ op: "setItem", itemId: id, choices: { ...b.creation.items[id].choices, ...ch } }]);
const add = (b, book, name) => run(b, [{ op: "addItem", catalogId: cy(book, name).id }]);
const errs = (b) => validate(b).problems.filter(p => p.severity === "error").map(p => p.text);
const warns = (b) => validate(b).problems.filter(p => p.severity === "warning").map(p => p.text);

test("the gate: typed limbs and the checked options offered; device, cyberdeck, simple replacement and in-limb implants wait; options not in play", () => {
  for (const n of ["Cyberarm", "Cyberleg", "Cyber Forearm", "Cyberhand", "Cyberfoot", "Cybertorso", "Cyberskull", "Cyberarm Gyromount", "Strength Enhancement +3",
    "Quickness Enhancement +2", "Body Enhancement +1", "Built-In Smartgun Link", "External Mount", "Semi-natural Covering (Arm/Leg)", "Direct Neural Interface", "Magnetic Cyberlimb System"])
    assert.equal(offerReason(cy("ct", n), ["ct"]), null, n);
  assert.equal(offerReason(cy("ct", "Built-In Device (Cyberlimb)"), ["ct"]), null);   // M5m: with its gear (R15)
  assert.equal(offerReason(cy("ct", "Cybergun (Light Pistol)"), ["ct"]), null);   // PLAN-M5l: with its weapon
  assert.equal(offerReason(cy("ct", "Cyberarm Taser"), ["ct"]), null);
  for (const n of ["Cyberarm Cyberdeck", "Hydraulic Jack", "Foot Anchor"]) assert.match(offerReason(cy("ct", n), ["ct"]) ?? "", /own rules/, n);
  assert.equal(offerReason(cy("sr2", "Cyberarm (Full)"), [], { inPlay: true }), null, "a limb is a spare in play (M4c)");
  assert.match(offerReason(cy("sr2", "Increased Strength (Cyberlimb)"), [], { inPlay: true }), /at creation/);
});

test("sides and links: a side is required, an option goes only into a limb of this character, overlaps and orphans are errors", () => {
  let b = run(newCharacter("Arms"), [{ op: "setBooks", books: ["ct"] }]);
  b = add(add(b, "ct", "Cyberarm"), "ct", "Strength Enhancement +2");
  const [arm] = recs(b, "Cyberarm"), [opt] = recs(b, "Strength Enhancement +2");
  assert.ok(errs(b).some(t => /Cyberarm: choose its side/.test(t)));
  assert.ok(errs(b).some(t => /Strength Enhancement \+2: not attached to a limb/.test(t)));
  assert.throws(() => set(b, opt, { limb: opt }), /cyberlimbs/);
  b = set(set(b, arm, { side: "left" }), opt, { limb: arm });
  assert.ok(!errs(b).some(t => /side|attached|overlap/.test(t)), errs(b).join(" | "));
  assert.equal(b.actor.items.find(i => i._id === opt).system.linkedLimbId, arm);
  b = add(b, "ct", "Cyber Forearm");
  b = set(b, recs(b, "Cyber Forearm")[0], { side: "left" });
  assert.ok(errs(b).some(t => /overlap on the left \(arm\.lower\)/.test(t)));
  b = run(b, [{ op: "removeItem", itemId: arm }]);
  assert.ok(errs(b).some(t => /Strength Enhancement \+2: its limb is gone/.test(t)));
});

test("placement is recorded when attached (later purchases don't change it); the price and the budget follow it", () => {
  let b = run(newCharacter("Legs"), [{ op: "setBooks", books: ["ct"] }]);
  b = add(add(add(b, "ct", "Cyberleg"), "ct", "Strength Enhancement +2"), "ct", "Quickness Enhancement +1");
  const [leg] = recs(b, "Cyberleg"), [s] = recs(b, "Strength Enhancement +2"), [q] = recs(b, "Quickness Enhancement +1");
  b = set(set(set(b, leg, { side: "left" }), q, { limb: leg }), s, { limb: leg });   // quickness first: the strength pays the 10 %
  assert.deepEqual([b.creation.items[q].placement.limbSurcharge, b.creation.items[s].placement.limbSurcharge], [false, true]);
  const item = (id) => b.actor.items.find(i => i._id === id);
  assert.equal(limbOptionCostOf(item(s), b.actor.items), 330000);
  b = add(b, "ct", "Body Enhancement +1");
  assert.equal(b.creation.items[s].placement.limbSurcharge, true, "unchanged by a later purchase");
  assert.equal(pricedItems(b.actor.items).find(i => i._id === s).system.cost, 330000);
  assert.equal(price(b.creation.items[s], project(b.creation.items[s], b.creation.items[s].choices), b.actor.items), 330000);
});

test("rules check: a duplicate enhancement on one limb is a warning (only one counts, it still costs Essence)", () => {
  let b = run(newCharacter("Two"), [{ op: "setBooks", books: ["ct"] }]);
  b = add(add(add(b, "ct", "Cyberarm"), "ct", "Strength Enhancement +1"), "ct", "Strength Enhancement +2");
  const [arm] = recs(b, "Cyberarm");
  b = set(b, arm, { side: "right" });
  b = set(set(b, recs(b, "Strength Enhancement +1")[0], { limb: arm }), recs(b, "Strength Enhancement +2")[0], { limb: arm });
  assert.ok(warns(b).some(t => /Strength Enhancement \+1: only one strength enhancement per limb counts/.test(t)), warns(b).join(" | "));
});

test("code review r1: a rated core option on a partial limb is priced for its place; an in-play limb needs its side (the fence path uses the same pricedItems)", () => {
  let b = run(newCharacter("Fore"), [{ op: "setBooks", books: ["ct"] }]);
  b = add(add(add(b, "ct", "Cyberhand"), "ct", "Strength Enhancement +1"), "ct", "Cyber Forearm");
  const [hand] = recs(b, "Cyberhand"), [fore] = recs(b, "Cyber Forearm");
  b = set(set(set(b, hand, { side: "left" }), fore, { side: "left" }), recs(b, "Strength Enhancement +1")[0], { limb: hand });
  b = add(b, "sr2", "Increased Strength (Cyberlimb)");
  const [inc] = recs(b, "Increased Strength (Cyberlimb)");
  b = set(set(b, inc, { rating: 2 }), inc, { limb: fore });   // adjacent: 60,000¥ a point (p.51)
  const r = b.creation.items[inc];
  assert.equal(price(r, project(r, r.choices), b.actor.items), 120000);
  assert.equal(pricedItems(b.actor.items).find(i => i._id === inc).system.cost, 120000);
  const play = run(newCharacter("Later"), []);
  play.creation.finished = { at: 1 }; play.actor.system.chargen.inProgress = false; play.actor.system.nuyen = 500000;
  assert.throws(() => applyOp(play, { op: "buyItem", catalogId: cy("sr2", "Cyberarm (Full)").id, price: 100000 }, lookup, { now: 1 }), /choose its side/);
  const ok = applyOp(play, { op: "buyItem", catalogId: cy("sr2", "Cyberarm (Full)").id, price: 100000, choices: { side: "right" } }, lookup, { now: 1 });
  assert.equal(ok.actor.items.at(-1).system.side, "right");
});


test("walk-through fix: choosing point-based stores Foundry's initials, so the rules check has a nuyen tier", () => {
  let b = run(newCharacter("Points"), [{ op: "setBooks", books: ["sc"] }, { op: "setMethod", method: "points" }]);
  const ch = b.actor.system.chargen;
  assert.deepEqual([ch.buildingPoints, ch.nuyenTier, ch.forcePointTrade, ch.qualitiesUseBP], [100, 500, 0, false]);
  assert.ok(!validate(b).problems.some(p => /nuyen tier/.test(p.text)));
  b = run(b, [{ op: "setPoints", buildingPoints: 120, nuyenTier: 5000, forcePointTrade: 0, qualitiesUseBP: true }, { op: "setMethod", method: "standard" }, { op: "setMethod", method: "points" }]);
  assert.deepEqual([b.actor.system.chargen.buildingPoints, b.actor.system.chargen.nuyenTier], [120, 5000], "a switch back keeps the GM's numbers");
});

test("M5m: a built-in device is a gear record inside its limb option, priced 4 × the device (core p.261, R15)", async () => {
  const { price } = await import("../shared/purchase.mjs");
  const gear = (b, name) => run(b, [{ op: "addItem", catalogId: catalog.entries.find(e => e.type === "gear" && e.book === "sr2" && e.name === name).id }]);
  let b = add(add(newCharacter("Dev"), "sr2", "Cyberarm (Full)"), "sr2", "Built-In Device (Cyberlimb)");
  const [arm] = recs(b, "Cyberarm (Full)"), [opt] = recs(b, "Built-In Device (Cyberlimb)");
  b = set(set(b, arm, { side: "left" }), opt, { limb: arm });
  assert.ok(validate(b).problems.some(p => /choose the gear item/.test(p.text)));
  b = gear(b, "Micro-Transceiver");
  const [radio] = recs(b, "Micro-Transceiver");
  assert.throws(() => set(b, opt, { device: arm }), /gear items/);
  b = set(b, opt, { device: radio });
  assert.ok(!b.actor.items.some(i => i.name === "Micro-Transceiver"), "the device is inside the option, not its own item");
  const o = b.actor.items.find(i => i._id === opt);
  assert.equal(o.system.cost, 2500);
  assert.match(o.system.notes, /Device: Micro-Transceiver/);
  assert.equal(price(b.creation.items[opt], o, b.actor.items), 10000, "4 × Normal Cost");
  assert.deepEqual(errs(b).filter(e => /Device|device/.test(e)), []);
  // Quantity 2: no longer one device: exported as gear again, the option reports it.
  b = set(b, radio, { quantity: 2 });
  assert.ok(b.actor.items.some(i => i.name === "Micro-Transceiver"));
  assert.ok(errs(b).some(e => /quantity to 1/.test(e)));
});

test("M5m: a simple replacement limb is plain cyberware: 1 Essence, 50,000¥, no limb rules (Cybertechnology p.49, R16)", () => {
  assert.equal(offerReason(cy("ct", "Simple Replacement Limb"), ["ct"]), null);
  let b = add(newCharacter("Simple"), "sr2", "Simple Replacement (Limb)");
  const it = b.actor.items.find(i => i.name === "Simple Replacement (Limb)");
  assert.ok(!("side" in b.creation.items[it._id].choices), "no side: it has no limb type");
  assert.equal(essenceOf(it, b.actor.items), 1);
  assert.deepEqual(errs(b), []);
  assert.equal(derive({ actor: b.actor }).essence, 5);
});
