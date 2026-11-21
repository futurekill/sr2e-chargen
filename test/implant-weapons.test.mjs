/** M5l (docs/PLAN-M5l.md): implant weapons — the pair in the catalog, at creation, in play, and in the export. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, validate, undoable } from "../shared/creation.mjs";
import { derive } from "../shared/derive.mjs";
import { essenceOf } from "../shared/purchase.mjs";
import { toFoundryActor, fromFoundryActor } from "../shared/foundry.mjs";
import * as rules from "../shared/rules.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const BOOKS = catalog.books.map(b => b.key);
const run = (b, ops) => ops.reduce((x, o) => applyOp(x, o, lookup, { now: 1, catalogBooks: BOOKS, saleMode: "refund" }), b);
const cy = (name) => { const e = catalog.entries.find(x => x.type === "cyberware" && x.book === "ct" && x.name === name); assert.ok(e, name); return e.id; };
const recs = (b, name) => Object.keys(b.creation.items).filter(k => b.creation.items[k].name === name);
const notes = (b, sev) => validate(b).problems.filter(p => p.severity === sev).map(p => p.text);

test("the catalog pairs all 13 implants with exactly one weapon each", () => {
  const imps = catalog.entries.filter(e => e.pairedWeaponId);
  assert.equal(imps.length, 13);
  for (const i of imps) assert.equal(byId.get(i.pairedWeaponId)?.type, "weapon", i.name);
  assert.equal(new Set(imps.map(i => i.pairedWeaponId)).size, 13);
});

test("creation: an Oral Gun brings its weapon (its attack on the sheet); the weapon can't be changed or removed alone; removing the implant removes both", () => {
  let b = run(newCharacter("Gun"), [{ op: "setBooks", books: ["ct"] }, { op: "addItem", catalogId: cy("Oral Gun") }]);
  const [imp] = recs(b, "Oral Gun").filter(k => b.creation.items[k].type === "cyberware"), [wpn] = recs(b, "Oral Gun").filter(k => b.creation.items[k].type === "weapon");
  assert.equal(b.creation.items[wpn].pairedTo, imp);
  assert.equal(b.actor.items.find(i => i._id === wpn).flags.sr2e.pairedItem, imp);
  assert.ok(derive({ actor: b.actor }).weapons.some(w => w.name === "Oral Gun" && w.damageCode === "4L"));
  assert.throws(() => run(b, [{ op: "removeItem", itemId: wpn }]), /part of its implant/);
  assert.throws(() => run(b, [{ op: "setItem", itemId: wpn, choices: { quantity: 2 } }]), /part of its implant/);
  b = run(b, [{ op: "removeItem", itemId: imp }]);
  assert.equal(b.actor.items.length, 0);
});

test("cyberguns: built into a cyberlimb 0 Essence; in a natural limb the p.52 table's (a note, not an error); the taser needs a cyberarm", () => {
  let b = run(newCharacter("Arm"), [{ op: "setBooks", books: ["ct"] }, { op: "addItem", catalogId: cy("Cybergun (Heavy Pistol)") }]);
  const [gun] = recs(b, "Cybergun (Heavy Pistol)").filter(k => b.creation.items[k].type === "cyberware");
  const ess = () => essenceOf(b.actor.items.find(i => i._id === gun), b.actor.items);
  assert.equal(ess(), 1);
  assert.ok(notes(b, "note").some(t => /natural limb, 1 Essence/.test(t)));
  assert.ok(!notes(b, "error").some(t => /Heavy Pistol/.test(t)));
  b = run(b, [{ op: "addItem", catalogId: cy("Cyberarm") }]);
  const [arm] = recs(b, "Cyberarm");
  b = run(b, [{ op: "setItem", itemId: arm, choices: { ...b.creation.items[arm].choices, side: "right" } }, { op: "setItem", itemId: gun, choices: { ...b.creation.items[gun].choices, limb: arm } }]);
  assert.equal(ess(), 0);
  b = run(b, [{ op: "addItem", catalogId: cy("Cyberarm Taser") }]);
  assert.ok(notes(b, "error").some(t => /Cyberarm Taser: not attached to a limb/.test(t)));
});

test("play: buying an Oral Gun adds both (one ledger entry); the spare's weapon has no attack until surgery; selling the implant sells both; undo restores both", () => {
  let b = run(newCharacter("Later"), [{ op: "setBooks", books: ["ct"] }]);
  b.creation.finished = { at: 1 }; b.actor.system.chargen.inProgress = false; b.actor.system.nuyen = 100000;
  b = run(b, [{ op: "buyItem", catalogId: cy("Oral Gun"), price: 5600 }]);
  const imp = b.actor.items.find(i => i.type === "cyberware"), wpn = b.actor.items.find(i => i.type === "weapon" && i.name === "Oral Gun");
  assert.equal(wpn.flags.sr2e.pairedItem, imp._id);
  assert.ok(!derive({ actor: b.actor }).weapons.some(w => w.name === "Oral Gun"), "a spare: no attack");
  assert.throws(() => run(b, [{ op: "sellItem", itemId: wpn._id, shownMode: "refund", quoted: 0 }]), /sell the implant/);
  const undone = run(b, [{ op: "undo", entryId: undoable(b).id }]);
  assert.equal(undone.actor.items.length, 0);
  assert.equal(undone.actor.system.nuyen, 100000);
  const { saleQuoteOf } = rules;
  const q = saleQuoteOf(imp, { mode: "refund", pct: 30, items: b.actor.items }).price;
  const sold = run(b, [{ op: "sellItem", itemId: imp._id, shownMode: "refund", quoted: q }]);
  assert.equal(sold.actor.items.length, 0);
  const back = run(sold, [{ op: "undo", entryId: undoable(sold).id }]);
  assert.deepEqual(back.actor.items.map(i => i._id).sort(), [imp._id, wpn._id].sort());
});

test("the Foundry export carries the link; an imported character keeps it", () => {
  let b = run(newCharacter("Out"), [{ op: "setBooks", books: ["ct"] }, { op: "addItem", catalogId: cy("Oral Gun") }]);
  b.actor.system.chargen.inProgress = false; b.creation.finished = { at: 1 };
  const f = toFoundryActor(b, "0.161.0");
  const w = f.items.find(i => i.type === "weapon" && i.name === "Oral Gun");
  assert.equal(w.flags.sr2e.pairedItem, f.items.find(i => i.type === "cyberware")._id);
  const back = fromFoundryActor(JSON.parse(JSON.stringify(f)), { pinnedVersion: "0.161.0" });
  assert.ok(back.actor.items.some(i => i.flags?.sr2e?.pairedItem));
});

test("code review r1: a pair assembled in Foundry is linked on import; a broken or doubled link is refused; the loader refuses a catalog without the pairing", async () => {
  let b = run(newCharacter("Made"), [{ op: "setBooks", books: ["ct"] }, { op: "addItem", catalogId: cy("Oral Gun") }]);
  b.actor.system.chargen.inProgress = false; b.creation.finished = { at: 1 };
  const f = JSON.parse(JSON.stringify(toFoundryActor(b, "0.161.0")));
  for (const i of f.items) delete i.flags.sr2e?.pairedItem;   // as Foundry holds it: only the compendium's flags
  const back = fromFoundryActor(f, { pinnedVersion: "0.161.0" });
  const w = back.actor.items.find(i => i.type === "weapon" && i.name === "Oral Gun");
  assert.equal(w.flags.sr2e.pairedItem, back.actor.items.find(i => i.type === "cyberware")._id);
  const twice = JSON.parse(JSON.stringify(toFoundryActor(b, "0.161.0")));
  const extra = structuredClone(twice.items.find(i => i.type === "weapon" && i.name === "Oral Gun")); extra._id = "zz00000000000009"; twice.items.push(extra);
  assert.throws(() => fromFoundryActor(twice, { pinnedVersion: "0.161.0" }), /implant link is broken/);
  for (const i of twice.items) delete i.flags.sr2e?.pairedItem;   // two unlinked weapons for one implant (r2 #1)
  assert.throws(() => fromFoundryActor(twice, { pinnedVersion: "0.161.0" }), /no implant left/);
  // The loader: the real built catalog loads; the same body without one pairing (checksum fixed) is refused.
  const { loadCatalog } = await import("../server/catalog.mjs");
  const { mkdtempSync, writeFileSync, readFileSync: rf } = await import("node:fs");
  const { tmpdir } = await import("node:os"), { join } = await import("node:path"), { createHash } = await import("node:crypto");
  const { writeCatalog } = await import("../tools/build-catalog.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cat-")); writeCatalog(catalog, dir);   // catalog/ is gitignored: build it here
  assert.ok(loadCatalog(dir).size > 1000);
  const body = JSON.parse(rf(join(dir, "catalog.json"), "utf8"));
  delete body.entries.find(e => e.pairedWeaponId).pairedWeaponId;
  const text = JSON.stringify(body), m = JSON.parse(rf(join(dir, "manifest.json"), "utf8"));
  writeFileSync(join(dir, "catalog.json"), text); writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...m, sha256: createHash("sha256").update(text).digest("hex") }));
  assert.throws(() => loadCatalog(dir), /paired weapon is missing/);
});
