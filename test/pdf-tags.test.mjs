/**
 * The tagged PDFs (docs/PLAN-a11y.md 3): every sheet style and the table card carry a structure tree in reading order,
 * their language, headings, tables with header scopes, the condition monitors as Figures with alt text, and no text
 * outside a tag or an artifact.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { sheetModel, cardModel } from "../server/sheet/model.mjs";
import { renderSheet, STYLES } from "../server/sheet/render.mjs";
import { cardIds } from "../shared/creation.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const dir = new URL("../content/sr2e-foundryvtt/packs-src/runners/", import.meta.url);
const pregens = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
const asBody = (a) => ({ name: a.name, notes: "Owes the Yakuza.\n\nNever works for Aztechnology.", creation: { options: {}, items: {}, finished: null }, actor: a });
const razor = asBody(structuredClone(pregens.find(p => /Razor/.test(p.name))));

/** What a screen reader gets: the structure in order, each content's text, and any text left untagged. */
async function read(pdf) {
  const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, isEvalSupported: false }).promise;
  const info = await doc.getMarkInfo(), marked = (info instanceof Map ? info.get("Marked") : info?.Marked) === true;
  const order = [], roles = [], alts = [], untagged = [], headings = [], misplaced = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent({ includeMarkedContent: true });
    const tree = await page.getStructTree() ?? {};
    const inTree = new Set(), collect = (nd) => { if (nd.type === "content") inTree.add(nd.id); for (const c of nd.children ?? []) collect(c); };
    collect(tree);
    const textOf = new Map(), stack = [];
    for (const it of tc.items) {
      if (it.type === "beginMarkedContentProps" || it.type === "beginMarkedContent") { stack.push(it); continue; }
      if (it.type === "endMarkedContent") { stack.pop(); continue; }
      if (!it.str?.trim()) continue;
      const tagged = stack.findLast(m => m.id != null), artifact = stack.some(m => m.tag === "Artifact");
      // Tagged = its marked-content id is in THIS page's structure tree (an orphan id is not tagged; r1 #9).
      if (tagged && !inTree.has(tagged.id)) { untagged.push(`orphan ${tagged.id}: ${it.str}`); continue; }
      if (tagged) textOf.set(tagged.id, `${textOf.get(tagged.id) ?? ""}${textOf.has(tagged.id) && it.hasEOL !== undefined ? " " : ""}${it.str}`.replace(/\s+/g, " "));
      else if (!artifact) untagged.push(it.str);
    }
    const walk = (node, up = []) => {
      if (node.type === "content") { const t = textOf.get(node.id); if (t) order.push(t); return; }
      // Cells sit in a row, rows in a table (r1 #9).
      if ((node.role === "TH" || node.role === "TD") && (up.at(-1) !== "TR" || up.at(-2) !== "Table")) misplaced.push(`${node.role} under ${up.slice(-2).join(" > ")}`);
      if (node.role === "TR" && up.at(-1) !== "Table") misplaced.push(`TR under ${up.at(-1)}`);
      if (node.role) {
        roles.push(node.role); if (node.alt) alts.push(node.alt);
        if (/^H\d$/.test(node.role)) headings.push((node.children ?? []).map(c => textOf.get(c.id) ?? "").join(" ").trim());
      }
      for (const c of node.children ?? []) walk(c, node.role ? [...up, node.role] : up);
    };
    walk(tree);
  }
  const raw = Buffer.from(pdf).toString("latin1");
  // Every header cell's own dictionary carries its scope (r1 #9, r2 #4).
  const objects = raw.split(/\n\d+ 0 obj\n/);
  const thNoScope = objects.filter(o => /\/S \/TH\b/.test(o.split("endobj")[0]) && !/\/Scope \/(Row|Column)/.test(o.split("endobj")[0])).length;
  const thCount = objects.filter(o => /\/S \/TH\b/.test(o.split("endobj")[0])).length;
  return { marked, order, roles, alts, untagged, headings, misplaced, thNoScope, thCount, raw, pages: doc.numPages };
}

for (const style of STYLES) {
  test(`tagged PDF: ${style} sheet — language, H1 first, tables with header scopes, monitors with alt text, nothing untagged`, async () => {
    const { pdf } = await renderSheet(sheetModel(razor), { style });
    const r = await read(pdf);
    assert.ok(r.marked, "MarkInfo /Marked true");
    assert.match(r.raw, /\/Lang \(en-US\)/);
    assert.match(r.raw, /\/DisplayDocTitle true/);
    assert.deepEqual(r.untagged, [], "every text item is in a tag or an artifact (r1 #11)");
    assert.equal(r.roles.find(x => /^H\d$/.test(x)), "H1", "the first heading is the H1");
    assert.equal(r.order[0].trim(), razor.name, "the character's name is read first");
    assert.equal(r.headings[0], razor.name, "and it is the H1");
    for (const role of ["Table", "TR", "TH", "TD", "H2", "Figure", "Sect", "P"]) assert.ok(r.roles.includes(role), `${role} present`);
    assert.deepEqual(r.misplaced, [], "cells in rows, rows in tables");
    assert.ok(r.thCount > 0 && r.thNoScope === 0, `every TH has its scope (${r.thNoScope} of ${r.thCount} without)`);
    assert.match(r.raw, /\/Scope \/Row/, "a row header carries Scope Row");
    assert.match(r.raw, /\/Scope \/Column/, "a column header carries Scope Column (r2 #4)");
    assert.ok(r.alts.some(a => /^Physical condition monitor: \d+ of \d+ boxes marked\.$/.test(a)), "the Physical monitor's alt text (r1 #10)");
    assert.ok(r.alts.some(a => /^Stun condition monitor:/.test(a)));
    assert.ok(!r.order.some(t => /^Page \d+ of \d+$/.test(t.trim())), "page numbers are pagination artifacts");
    // Reading order: the sections come in the order the sheet reads (r1 #11).
    const at = (re) => r.headings.findIndex(t => re.test(t));
    const seq = style.startsWith("fohawk") ? [/^ATTRIBUTES$/, /^SKILLS$/, /^CONDITION MONITOR$/, /^ATTACKS$/] : [/^ATTRIBUTES|^> ATTRIBUTES/, /DICE POOLS/, /CONDITION MONITORS/, /ATTACKS/, /ACTIVE SKILLS/];
    const idx = seq.map(at);
    assert.ok(idx.every(i => i >= 0), `${style}: every section heading is read (${idx})`);
    assert.deepEqual([...idx].sort((a, b) => a - b), idx, `${style}: sections read in order`);
    assert.ok(at(/NOTES/) > idx.at(-1), "the notes come after page 1's sections");
  });
}

test("tagged PDF: the table card (its own render path) — tagged, in order, column headers with scope", async () => {
  for (const style of STYLES) {
    const { pdf } = await renderSheet(cardModel(razor, cardIds(razor)), { style });
    const r = await read(pdf);
    assert.ok(r.marked && r.pages === 1, `${style}: one tagged page`);
    assert.deepEqual(r.untagged, [], `${style}: nothing untagged`);
    assert.equal(r.order[0].trim(), razor.name);
    assert.match(r.raw, /\/Scope \/Column/);
    assert.deepEqual(r.misplaced, [], `${style}: cells in rows, rows in tables`);
    assert.ok(r.thCount > 0 && r.thNoScope === 0, `${style}: every TH has its scope`);
    assert.ok(r.order.some(t => t.trim() === "Weapon"), `${style}: the attacks' column header is read`);
  }
});
