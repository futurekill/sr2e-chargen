/** The printable sheet's fit test (docs/PLAN.md "Exports", docs/PLAN-sheet.md §4 + drafts 2–3): every fixture × paper
 * × font — nothing missing, nothing outside the safe area, nothing overlapping, nothing under the size floor — checked
 * on the renderer's placed runs AND on the text pdf.js reads back from the PDF. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { sheetModel, plain } from "../server/sheet/model.mjs";
import { renderSheet, SheetError, PAPER, FONT_SETS, STYLES } from "../server/sheet/render.mjs";
import { newCharacter } from "../shared/creation.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const dir = new URL("../content/sr2e-foundryvtt/packs-src/runners/", import.meta.url);
const pregens = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
const asBody = (a, notes = "") => ({ name: a.name, notes, creation: { options: {}, items: {}, finished: null }, actor: a });

/** A stress character: long names, many rows, unbreakable words, non-Latin text, long notes. */
function stress() {
  const a = structuredClone(pregens.find(p => /Razor/.test(p.name)));
  a.name = "Ж".repeat(10) + " " + "Long-Named Street Samurai of the Redmond Barrens, Second Of His Name Who Never Sleeps".slice(0, 100);
  const long = "Supercalifragilisticexpialidocious-Ultra-Heavy-Assault-Cannon-Of-Doom";   // 69 chars, no space
  for (let i = 0; i < 40; i++) a.items.push({ _id: `zz${String(i).padStart(14, "0")}`, name: i % 3 ? `${long} ${i}` : `Ελληνικά καλώδια Tiếng Việt item ${i}`, type: "gear", system: { quantity: 1, citation: { book: "sr2", page: "250" } } });
  for (let i = 0; i < 60; i++) a.items.push({ _id: `zy${String(i).padStart(14, "0")}`, name: `Knowledge: The Complete Underworld History of Seattle Volume ${i}`, type: "skill", system: { category: "knowledge", rating: 3, concentration: { name: "", rating: 0 }, specialization: { name: "", rating: 0 } } });
  return asBody(a, ("A paragraph of notes that goes on. " + long + " ").repeat(120));
}
/** One cyberware row with hundreds of module names: taller than a page (code review r1 #3). */
function hugeRow() {
  const a = structuredClone(pregens.find(p => /Razor/.test(p.name)));
  a.name = "W".repeat(200);   // a 200-character name: the header wraps, the footer doesn't repeat it (r1 #1)
  a.items.push({ _id: "zx00000000000001", name: "Cybereyes", type: "cyberware", system: { installed: true, essenceCost: 0.2, capacity: 0.5, attributeMods: {},
    modules: Array.from({ length: 300 }, (_, i) => ({ name: `Accessory number ${i}`, essenceCost: 0 })) } });
  return asBody(a, "x".repeat(30000));   // long notes print in full (r1 #2)
}
const FIXTURES = [["huge row", hugeRow()], ["new character", { ...newCharacter("Blank Slate") }], ...pregens.map(p => [p.name, asBody(p, "Notes.")]), ["stress", stress()]];
const squash = (s) => String(s).replace(/\s+/g, "");
/** Every string the model holds (what must appear on the sheet); the Fohawk style draws the attribute row, the stat
 * strip and the priorities instead of the Classic tables. */
const strings = (m, style = "classic") => [m.title,
  ...(style === "classic" ? [...m.header.flat(), ...m.attributes.flat(), ...m.pools.flat(), m.armor]
    : [m.subtitle.toUpperCase(), ...m.header.filter(([k]) => !["Metatype", "Magic", "Priorities", "Karma Pool"].includes(k)).flat(),
      ...m.attrRow.flatMap(a => [a.abbr, a.value, a.natural]), ...m.stats.flatMap(([k, v]) => [k.toUpperCase(), v]), ...m.priorities.flat()]),
  ...m.attacks.flat(), ...m.skills.map(r => r.slice(0, 3)).flat(),
  ...m.cyberware.flat(), ...m.gear.flat(), ...m.spells.flat(), ...m.foci.flat(), ...m.powers.flat(), m.notes].map(String).filter(Boolean);

for (const [name, body] of FIXTURES) for (const style of STYLES) for (const paper of Object.keys(PAPER)) for (const font of Object.keys(FONT_SETS)) {
  test(`fit: ${name} · ${style} · ${paper} · ${font}`, async () => {
    const model = sheetModel(body);
    const { pdf, runs, shapes, cells, size: [W, H], margin } = await renderSheet(model, { paper, font, style });
    // 1. Every model string is placed (in order-insensitive, whitespace-free form: wrapping may split a string).
    const placed = squash(runs.filter(r => r.kind === "text" && !r.cell).map(r => r.text).join(""));
    // Table cells exactly: each cell's runs, joined, equal its full text (a split cell too).
    const byCell = new Map();
    for (const r of runs) if (r.cell) byCell.set(r.cell, (byCell.get(r.cell) ?? "") + r.text);
    for (const [id, t] of Object.entries(cells)) assert.equal(squash(byCell.get(id) ?? ""), squash(t), `${name}: cell "${t.slice(0, 60)}" was not placed exactly`);
    // Every model string is in a cell or in the free text (title, header, notes).
    const cellSet = new Set(Object.values(cells).map(squash));
    for (const s of strings(model, style)) { const w = squash(s); assert.ok(cellSet.has(w) || placed.includes(w), `${name}: "${s.slice(0, 60)}" was not placed`); }
    // 2. Inside the safe area, not under the floor, inside its own box.
    for (const r of runs) {
      assert.ok(r.x >= margin - 0.5 && r.x + r.w <= W - margin + 0.5 && r.y >= margin - 0.5 && r.y + r.h <= H - margin + 0.5, `${name}: "${r.text}" leaves the page's safe area`);
      assert.ok(r.size >= 6.5, `${name}: "${r.text}" is under the size floor`);
      assert.ok(r.x + r.w <= r.box.x + r.box.w + 0.5, `${name}: "${r.text}" leaves its box`);
    }
    // 2b. Bands and pencil boxes inside the safe area; boxes never overlap each other.
    for (const b of shapes) assert.ok(b.x >= margin - 0.5 && b.x + b.w <= W - margin + 0.5 && b.y >= margin - 0.5 && b.y + b.h <= H - margin + 0.5, `${name}: a ${b.kind} leaves the safe area`);
    const boxes = shapes.filter(b => b.kind === "box");
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(!(a.page === b.page && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `${name}: two monitor boxes overlap`);
    }
    // 3. No two runs overlap on a page.
    const byPage = Map.groupBy(runs, r => r.page);
    for (const list of byPage.values()) {
      list.sort((a, b) => a.y - b.y);
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length && list[j].y < list[i].y + list[i].h - 0.5; j++) {
        const a = list[i], b = list[j];
        const overlap = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h * 0.8 && b.y < a.y + a.h * 0.8;
        assert.ok(!overlap, `${name}: "${a.text}" overlaps "${b.text}"`);
      }
    }
    // 4. The PDF itself: pdf.js reads back the same text.
    const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, isEvalSupported: false }).promise;
    let text = "";
    for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map(i => i.str).join("");
    const want = squash([...runs].sort((a, b) => a.page - b.page).map(r => r.text).join(""));   // stable: each page's runs in drawing order
    if (squash(text) !== want) {
      const a = squash(text); let i = 0; while (i < a.length && a[i] === want[i]) i++;
      assert.fail(`${name}: the PDF's text differs from what was placed at ${i}: pdf "${a.slice(i - 20, i + 40)}" vs placed "${want.slice(i - 20, i + 40)}"`);
    }
  });
}

test("Fohawk measures its fixed rows: long values grow the row; an impossible header is refused, never cut", async () => {
  const body = asBody(structuredClone(pregens.find(p => /Hexen/.test(p.name))));
  const model = sheetModel(body);
  model.attrRow[0] = { abbr: "BOD", value: "12345678901234567890", natural: "8" };
  model.stats[1] = ["Initiative", "12345678901234567890 + 2D6"];
  model.monitors.physical = 14;
  const { runs, shapes } = await renderSheet(model, { style: "fohawk" });
  const byPage = runs.filter(r => r.page === 1).sort((a, b) => a.y - b.y);
  for (let i = 0; i < byPage.length; i++) for (let j = i + 1; j < byPage.length; j++) {
    const a = byPage[i], b = byPage[j];
    assert.ok(!(a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h * 0.8 && b.y < a.y + a.h * 0.8), `"${a.text}" overlaps "${b.text}"`);
  }
  assert.equal(shapes.filter(s => s.kind === "box").length, 24);
  const huge = sheetModel(body); huge.subtitle = "X ".repeat(3000);
  await assert.rejects(renderSheet(huge, { style: "fohawk" }), (e) => e instanceof SheetError && /Classic/.test(e.message));
});

test("a character no bundled font has stops the export with a message, never a box", async () => {
  const body = newCharacter("龍");
  await assert.rejects(renderSheet(sheetModel(body)), (e) => e instanceof SheetError && /U\+9F8D/.test(e.message));
});

test("user text is plain: control characters and bidi overrides removed", () => {
  assert.equal(plain("Razor‮\u0007 ⁦x⁩  y"), "Razor x y");
});

import { statBlock } from "../server/sheet/markdown.mjs";
test("the Markdown stat block: every string, escaped, tables with the right columns", () => {
  for (const [name, body] of FIXTURES) {
    const model = sheetModel(body), md = statBlock(model);
    const unescaped = squash(md.replace(/\\(.)/g, "$1").replace(/`+ ?| ?`+/g, ""));
    for (const s of strings(model)) assert.ok(unescaped.includes(squash(s)), `${name}: "${s.slice(0, 50)}" missing from the stat block`);
    for (const line of md.split("\n").filter(l => l.startsWith("| "))) {
      const cells = line.replace(/\\\|/g, "").split("|").length - 2;
      assert.ok(cells >= 1 && cells <= 4, `${name}: a table row with ${cells} cells: ${line.slice(0, 80)}`);
    }
  }
  const tricky = sheetModel(newCharacter("| *Razor* [x](http://e) <b>#1"));
  const md = statBlock(tricky);
  const head = md.split("\n")[0];
  assert.ok(head.startsWith("# \\| \\*Razor\\* \\[x\\](` http://e) ` \\<b\\>\\#1"), head);
  assert.doesNotMatch(md, /(?<!\\)\]\(http/, "no live link (the bracket is escaped)");
  const bare = statBlock(sheetModel({ ...newCharacter("x"), notes: "see https://evil.example and www.evil.example or mail me@evil.example ok https://x.test/a|b" }));
  assert.ok(bare.includes("` https://x.test/a `\\|b"), "a pipe ends the code span and is escaped for the table");
  for (const u of ["https://evil.example", "www.evil.example", "me@evil.example"]) assert.match(bare, new RegExp("` " + u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " `"), `${u} is in a code span`);
});
