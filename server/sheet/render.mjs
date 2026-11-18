/**
 * The Classic sheet renderer (docs/PLAN-sheet.md §3, drafts 2–3): the sheet model → a PDF, drawn with pdfkit and
 * measured with the SAME fonts it embeds. Fit rules (docs/PLAN.md "Exports"): nothing is cut off — text wraps in its
 * column; a single-line field shrinks toward the floor; a section that doesn't fit continues on a later page.
 * Returns the PDF and every text run placed (the fit test's input).
 */
import PDFDocument from "pdfkit";
import * as fontkit from "fontkit";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export class SheetError extends Error {}

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const SUBSETS = ["latin", "latin-ext", "greek", "greek-ext", "cyrillic", "cyrillic-ext", "vietnamese"];
/** Font sets (draft 3): each a family, then Noto Sans as the per-glyph fallback. SIL OFL 1.1, licence in each package. */
export const FONT_SETS = {
  standard: ["@fontsource/source-sans-3", "@fontsource/noto-sans"],
  readable: ["@fontsource/atkinson-hyperlegible-next", "@fontsource/noto-sans"]
};
const faces = new Map();   // `${set}:${weight}` → [{ name, file, font }]
function facesFor(set, weight) {
  const key = `${set}:${weight}`;
  if (faces.has(key)) return faces.get(key);
  const list = [];
  for (const pkg of FONT_SETS[set]) {
    const fam = pkg.split("/")[1];
    for (const sub of SUBSETS) {
      const file = join(pkgDir(pkg), "files", `${fam}-${sub}-${weight}-normal.woff`);
      if (existsSync(file)) list.push({ name: `${fam}-${sub}-${weight}`, file, font: fontkit.create(readFileSync(file)) });
    }
  }
  if (!list.length) throw new SheetError(`no ${set} font at weight ${weight}`);
  faces.set(key, list);
  return list;
}

export const PAPER = { letter: [612, 792], a4: [595.28, 841.89] };
const MARGIN = 36;                 // 0.5 in = 12.7 mm (PLAN.md: safe margins for home printers)
const BODY = 10, FLOOR = 8, LABEL = 7.5, LABEL_FLOOR = 6.5, LINE = 1.22;
const BOX = 20;                    // condition-monitor box ≥ 7 mm (19.8 pt)

export async function renderSheet(model, { paper = "letter", font = "standard" } = {}) {
  if (!PAPER[paper]) throw new SheetError("Unknown paper size.");
  if (!FONT_SETS[font]) throw new SheetError("Unknown font set.");
  const [W, H] = PAPER[paper];
  const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, bufferPages: true, info: { Title: model.title, Producer: "sr2e-chargen" } });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((res, rej) => { doc.on("end", res); doc.on("error", rej); });
  const reg = new Set(), runs = [];
  let page = 0;

  /** Split text into runs of one face each (per-glyph fallback); a character no face has is an error, never a box. */
  const segments = (text, weight) => {
    const list = facesFor(font, weight), out = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      const f = /\s/.test(ch) ? (out.at(-1)?.face ?? list[0]) : list.find(x => x.font.hasGlyphForCodePoint(cp));
      if (!f) throw new SheetError(`The sheet can't print the character "${ch}" (U+${cp.toString(16).toUpperCase().padStart(4, "0")}).`);
      if (out.at(-1)?.face === f) out.at(-1).text += ch; else out.push({ face: f, text: ch });
    }
    return out;
  };
  const use = (face, size) => {
    if (!reg.has(face.name)) { doc.registerFont(face.name, face.file); reg.add(face.name); }
    doc.font(face.name).fontSize(size);
  };
  const width = (text, size, weight) => segments(text, weight).reduce((t, s) => { use(s.face, size); return t + doc.widthOfString(s.text); }, 0);
  /** Wrap to lines no wider than w (a word longer than the line is broken by characters). */
  const wrap = (text, size, w, weight) => {
    const lines = [];
    for (const para of String(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const tryLine = line ? `${line} ${word}` : word;
        if (width(tryLine, size, weight) <= w) { line = tryLine; continue; }
        if (line) lines.push(line);
        let piece = "";
        for (const ch of word) {
          if (width(piece + ch, size, weight) > w && piece) { lines.push(piece); piece = ""; }
          piece += ch;
        }
        line = piece;
      }
      lines.push(line);
    }
    return lines;
  };
  const cellText = {};   // every table cell's full text by id, so the fit test checks split cells exactly
  const draw = (text, x, y, size, weight, box, kind = "text", cell = null) => {
    let cx = x;
    for (const s of segments(text, weight)) { use(s.face, size); doc.fillColor("#000").text(s.text, cx, y, { lineBreak: false }); cx += doc.widthOfString(s.text); }
    runs.push({ text, page, x, y, w: cx - x, h: size * LINE, size, box, kind, cell });
  };
  /** Text in a box: wrap; if it is a one-line field (maxLines), shrink toward the floor. Returns the height used. */
  const block = (text, x, y, w, { size = BODY, floor = FLOOR, weight = 400, maxLines = Infinity, box, kind, cell } = {}) => {
    if (!text) return 0;
    let s = size, lines = wrap(text, s, w, weight);
    while (lines.length > maxLines && s - 0.5 >= floor) { s -= 0.5; lines = wrap(text, s, w, weight); }
    lines.forEach((ln, i) => draw(ln, x, y + i * s * LINE, s, weight, box ?? { x, y, w, h: lines.length * s * LINE }, kind, cell));
    return lines.length * s * LINE;
  };

  const newPage = () => { doc.addPage({ size: [W, H], margin: 0 }); page++; };
  const bar = (title, x, y, w) => {
    doc.save().lineWidth(1.2).moveTo(x, y + 14).lineTo(x + w, y + 14).stroke("#000").restore();
    block(title.toUpperCase(), x, y + 1, w, { size: 9, floor: LABEL_FLOOR, weight: 700, maxLines: 1, kind: "title" });
    return 18;
  };
  /** A table section: rows of cells in columns (fractions of w); rows wrap; rows past maxY go to `rest`. */
  let cellSeq = 0;
  /** Rows of cells as { t, id } (a cell keeps its id when it is split). */
  const cellsOf = (rows) => rows.map(r => r.map(c => { if (c && typeof c === "object" && "id" in c) return c; const id = `c${cellSeq++}`; const t = String(c ?? ""); cellText[id] = t; return { t, id }; }));
  const table = (title, rowsIn, cols, x, y, w, maxY) => {
    let rows = cellsOf(rowsIn);
    let cy = y + bar(title, x, y, w);
    const rest = [];
    let placed = 0;
    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r];
      const heights = cells.map((c, i) => (c.t ? wrap(c.t, i === 0 ? BODY : 9, w * cols[i] - 4, 400).length * (i === 0 ? BODY : 9) * LINE : 0));
      const h = Math.max(BODY * LINE, ...heights) + 2;
      if (cy + h > maxY) {
        // A row taller than the whole space left on a fresh page is split by lines; the rest continues (r1 #3).
        if (r === 0 && cy + 3 * BODY * LINE <= maxY) {
          const fit = Math.max(1, Math.floor((maxY - cy - 2) / (BODY * LINE)));
          const cut = cells.map((c, i) => { const ln = c.t ? wrap(c.t, i === 0 ? BODY : 9, w * cols[i] - 4, 400) : []; return [{ t: ln.slice(0, fit).join("\n"), id: c.id }, { t: ln.slice(fit).join("\n"), id: c.id }]; });
          if (cut.some(([, more]) => more.t)) {
            rows = [cut.map(([now]) => now), cut.map(([, more]) => more), ...rows.slice(1)];
            r = -1;   // place the first part as an ordinary row
            continue;
          }
        }
        rest.push(...rows.slice(r)); break;
      }
      let cx = x;
      cells.forEach((c, i) => { block(c.t, cx, cy, w * cols[i] - 4, { size: i === 0 ? BODY : 9, floor: FLOOR, cell: c.id, box: { x: cx, y: cy, w: w * cols[i] - 4, h } }); cx += w * cols[i]; });
      doc.save().lineWidth(0.3).moveTo(x, cy + h - 1).lineTo(x + w, cy + h - 1).stroke("#888").restore();
      cy += h;
      placed++;
    }
    return { y: cy + 8, rest, placed };
  };

  // ── Page 1: the at-the-table sections, in fixed places ──────────────────────────────────────────────────────
  newPage();
  const L = MARGIN, R = W - MARGIN, CW = R - L, colW = (CW - 18) / 2, X2 = L + colW + 18, BOTTOM = H - MARGIN - 14;
  let y = MARGIN;
  y += block(model.title, L, y, CW, { size: 18, floor: 11, weight: 700, maxLines: 2 }) + 2;
  if (model.draft) y += block("DRAFT — character creation not finished", L, y, CW, { size: 9, weight: 700, maxLines: 1 });
  y += block(model.header.map(([k, v]) => `${k}: ${v}`).join("   "), L, y, CW, { size: 9.5, floor: FLOOR }) + 8;
  const top = y;
  // Left: attributes, pools, armor.
  let ly = table("Attributes", model.attributes, [0.6, 0.4], L, top, colW, BOTTOM).y;
  ly = table("Dice pools", model.pools, [0.6, 0.4], L, ly, colW, BOTTOM).y;
  ly = table("Armor (Ballistic / Impact)", [["Worn", model.armor]], [0.6, 0.4], L, ly, colW, BOTTOM).y;
  // Right: condition monitors (pencil boxes), then attacks.
  let ry = top + bar("Condition monitors", X2, top, colW);
  for (const [name, n] of [["Physical", model.monitors.physical], ["Stun", model.monitors.stun]]) {
    block(name, X2, ry, colW, { size: 9, weight: 700, maxLines: 1 });
    ry += 12;
    const gap = Math.min(4, (colW - n * BOX) / Math.max(1, n - 1));
    for (let i = 0; i < n; i++) doc.save().lineWidth(0.8).rect(X2 + i * (BOX + gap), ry, BOX, BOX).stroke("#000").restore();
    ry += BOX + 6;
  }
  ry += block(`Physical overflow: up to ${model.monitors.overflow} boxes (Body)`, X2, ry, colW, { size: 8.5, floor: FLOOR }) + 8;
  const attacks = table("Attacks", model.attacks, [0.55, 0.2, 0.25], X2, ry, colW, BOTTOM);
  ry = attacks.y;
  const active = model.skills.filter(s => s[3] === "active").map(([n, r, sub]) => [n, r, sub]);
  const skillsY = Math.max(ly, ry);
  const act = table("Active skills", active, [0.4, 0.1, 0.5], L, skillsY, CW, BOTTOM);

  // ── Continuation pages: everything else, flowing ───────────────────────────────────────────────────────────
  const flow = [
    ["Attacks (continued)", attacks.rest, [0.55, 0.2, 0.25]],
    ["Active skills (continued)", act.rest, [0.4, 0.1, 0.5]],
    ["Knowledge, language and other skills", model.skills.filter(s => s[3] !== "active").map(([n, r, sub]) => [n, r, sub]), [0.4, 0.1, 0.5]],
    ["Cyberware", model.cyberware, [0.55, 0.1, 0.15, 0.2]],
    ["Adept powers", model.powers, [0.6, 0.15, 0.05, 0.2]],
    ["Spells", model.spells, [0.4, 0.1, 0.3, 0.2]],
    ["Foci", model.foci, [0.4, 0.1, 0.3, 0.2]],
    ["Gear", model.gear, [0.55, 0.12, 0.13, 0.2]]
  ].filter(([, rows]) => rows.length);
  let fy = act.y;   // the rest continues below, on page 1 while it fits
  for (let [title, rows, cols] of flow) {
    while (rows.length) {
      if (fy == null || fy + 60 > BOTTOM) { newPage(); fy = MARGIN; }
      const out = table(title, rows, cols, L, fy, CW, BOTTOM);
      if (!out.placed) { newPage(); fy = MARGIN; const again = table(title, rows, cols, L, fy, CW, BOTTOM); if (!again.placed) throw new SheetError(`${title}: a row is taller than a page.`); rows = again.rest; fy = again.y; }
      else { rows = out.rest; fy = out.y; }
      title = title.endsWith("(continued)") ? title : `${title} (continued)`;
    }
  }
  if (model.notes) {
    let lines = wrap(model.notes, BODY, CW, 400);
    let first = true;
    while (lines.length) {
      if (fy == null || fy + 60 > BOTTOM) { newPage(); fy = MARGIN; }
      fy += bar(first ? "Notes" : "Notes (continued)", L, fy, CW);
      const fit = Math.max(1, Math.floor((BOTTOM - fy) / (BODY * LINE)));
      lines.slice(0, fit).forEach((ln, i) => draw(ln, L, fy + i * BODY * LINE, BODY, 400, { x: L, y: fy, w: CW, h: fit * BODY * LINE }));
      fy += Math.min(fit, lines.length) * BODY * LINE + 8;
      lines = lines.slice(fit);
      first = false;
      if (lines.length) fy = BOTTOM + 1;
    }
  }
  // Footer on every page.
  const pages = page;
  for (let p = 1; p <= pages; p++) {
    doc.switchToPage(p - 1);
    page = p;
    draw(`Page ${p} of ${pages}`, L, H - MARGIN - 9, LABEL, 400, { x: L, y: H - MARGIN - 9, w: CW, h: 12 }, "footer");   // the title is in the header, in full
  }
  doc.end();
  await done;
  return { pdf: Buffer.concat(chunks), runs, cells: cellText, pages, size: [W, H], margin: MARGIN };
}
