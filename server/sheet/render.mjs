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
import { SHEET_STYLES, SHEET_STYLE_KEYS } from "../../shared/sheet-styles.mjs";

export class SheetError extends Error {
  constructor(message, overflow = null) { super(message); this.overflow = overflow; }
}

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const SUBSETS = ["latin", "latin-ext", "greek", "greek-ext", "cyrillic", "cyrillic-ext", "vietnamese"];
/** Font sets (draft 3): each a family, then Noto Sans as the per-glyph fallback. SIL OFL 1.1, licence in each package. */
export const FONT_SETS = {
  standard: ["@fontsource/source-sans-3", "@fontsource/noto-sans"],
  readable: ["@fontsource/atkinson-hyperlegible-next", "@fontsource/noto-sans"]
};
/** Heading faces a style may use (docs/PLAN-sheet-styles.md): NOT user choices; the readable set still wins (U22). */
export const HEAD_FACES = {
  mono: ["@fontsource/noto-sans-mono", "@fontsource/noto-sans"],
  serif: ["@fontsource/noto-serif", "@fontsource/noto-sans"]
};
const faces = new Map();   // `${set}:${weight}` → [{ name, file, font }]
function facesFor(set, weight) {
  const key = `${set}:${weight}`;
  if (faces.has(key)) return faces.get(key);
  const list = [];
  for (const pkg of FONT_SETS[set] ?? HEAD_FACES[set]) {
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

/** Sheet styles (PLAN.md U16; shared/sheet-styles.mjs): Fohawk (black angled bars, magenta accents) and its ink-saver
 *  (outlined bars) on one layout; Classic, Printout (mono headings, dashed rules, grey bands) and Dossier (serif
 *  headings, double brass rules) on the other. */
export const STYLES = SHEET_STYLE_KEYS;
/** Column names for the tables whose columns carry meaning (docs/PLAN-a11y.md 3, r1 #9): shown and tagged TH Column. */
const HEADS = { attacks: ["Weapon", "Damage", "Skill"], skills: ["Skill", "Rating", "Concentration · Specialization"] };
const INK = "#0e0e10", ACCENT = "#c8006a", MUTED = "#55555d", BRASS = "#705024";   // magenta also differs by weight: never colour alone

export async function renderSheet(model, { paper = "letter", font = "standard", style = "fohawk" } = {}) {
  if (!PAPER[paper]) throw new SheetError("Unknown paper size.");
  if (!FONT_SETS[font]) throw new SheetError("Unknown font set.");
  if (!STYLES.includes(style)) throw new SheetError("Unknown sheet style.");
  const look = SHEET_STYLES.find(s => s.key === style);
  const fohawk = look.layout === "fohawk", inkSaver = look.ink;
  const headSet = font === "readable" || !look.head ? font : look.head;   // the readable font wins (U22)
  const [W, H] = PAPER[paper];
  // A TAGGED PDF (docs/PLAN-a11y.md 3): structure in reading order, decoration and page numbers as artifacts.
  const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, bufferPages: true, tagged: true, lang: "en-US", displayTitle: true,
    pdfVersion: "1.7", info: { Title: model.title, Producer: "sr2e-chargen" } });
  const root = doc.struct("Document");
  doc.addStructure(root);
  const stack = [root], top = () => stack.at(-1);
  /** A structure element holding the content `fn` draws now (pdfkit runs the closure at once, inside its marking). */
  const leaf = (type, opts, fn) => { const el = doc.struct(type, opts); top().add(el); el.add(fn); el.end(); };
  /** A structure element whose children `fn` adds (a section, a table, a row). */
  const group = (type, opts, fn) => { const el = doc.struct(type, opts); top().add(el); stack.push(el); try { return fn(); } finally { stack.pop(); el.end(); } };
  /** Drawing that carries no information (rules, bands, frames, page numbers): skipped by screen readers. */
  const art = (fn, type = "Layout") => { doc.markContent("Artifact", { type }); fn(); doc.endMarkedContent(); };
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((res, rej) => { doc.on("end", res); doc.on("error", rej); });
  const reg = new Set(), runs = [], shapes = [];   // shapes: bands and pencil boxes, for the fit test
  let page = 0;

  /** Split text into runs of one face each (per-glyph fallback); a character no face has is an error, never a box. */
  const segments = (text, weight, set = font) => {
    const list = facesFor(set, weight), out = [];
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
  const width = (text, size, weight, set = font) => segments(text, weight, set).reduce((t, s) => { use(s.face, size); return t + doc.widthOfString(s.text); }, 0);
  /** Wrap to lines no wider than w (a word longer than the line is broken by characters). */
  const wrap = (text, size, w, weight, set = font) => {
    const lines = [];
    for (const para of String(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const tryLine = line ? `${line} ${word}` : word;
        if (width(tryLine, size, weight, set) <= w) { line = tryLine; continue; }
        if (line) lines.push(line);
        let piece = "";
        for (const ch of word) {
          if (width(piece + ch, size, weight, set) > w && piece) { lines.push(piece); piece = ""; }
          piece += ch;
        }
        line = piece;
      }
      lines.push(line);
    }
    return lines;
  };
  const cellText = {};   // every table cell's full text by id, so the fit test checks split cells exactly
  const draw = (text, x, y, size, weight, box, kind = "text", cell = null, color = "#000", set = font) => {
    let cx = x;
    const used = [];   // the faces actually drawn (the font test checks them, not the set asked for)
    for (const s of segments(text, weight, set)) { use(s.face, size); used.push(s.face.name); doc.fillColor(color).text(s.text, cx, y, { lineBreak: false }); cx += doc.widthOfString(s.text); }
    runs.push({ text, page, x, y, w: cx - x, h: size * LINE, size, box, kind, cell, faces: used });
  };
  /** Text in a box: wrap; if it is a one-line field (maxLines), shrink toward the floor. Returns the height used. */
  const block = (text, x, y, w, { size = BODY, floor = FLOOR, weight = 400, maxLines = Infinity, box, kind, cell, color, set = font } = {}) => {
    if (!text) return 0;
    let s = size, lines = wrap(text, s, w, weight, set);
    while (lines.length > maxLines && s - 0.5 >= floor) { s -= 0.5; lines = wrap(text, s, w, weight, set); }
    lines.forEach((ln, i) => draw(ln, x, y + i * s * LINE, s, weight, box ?? { x, y, w, h: lines.length * s * LINE }, kind, cell, color, set));
    return lines.length * s * LINE;
  };

  const newPage = () => { doc.addPage({ size: [W, H], margin: 0 }); page++; };
  /** A black band with a clipped right corner (Fohawk), outlined in ink-saver. */
  const band = (x, y, w, h, cut = 7) => {
    shapes.push({ kind: "band", page, x, y, w, h });
    art(() => {
      doc.save().moveTo(x, y).lineTo(x + w - cut, y).lineTo(x + w, y + cut).lineTo(x + w, y + h).lineTo(x, y + h).closePath();
      if (inkSaver) doc.lineWidth(1.2).stroke(INK); else doc.fill(INK);
      doc.restore();
    });
  };
  const onBand = inkSaver ? INK : "#fff";
  /** The portrait (a JPEG made from the stored WebP), fitted into a square; recorded as a shape for the fit test. */
  const portrait = (x, y, side) => {
    leaf("Figure", { alt: `Portrait of ${model.title}` }, () => doc.image(model.portrait, x, y, { fit: [side, side], align: "center", valign: "center" }));
    shapes.push({ kind: "image", page, x, y, w: side, h: side });
  };
  /** A rule (a line ornament), recorded so the fit test can prove no text touches it. */
  const rule = (x, y, w, h) => shapes.push({ kind: "rule", page, x, y: y - h / 2, w, h });
  const bar = (title, x, y, w) => {
    if (fohawk) {
      band(x, y, w, 16);
      leaf("H2", {}, () => block(title.toUpperCase(), x + 6, y + 2.5, w - 16, { size: 9, floor: LABEL_FLOOR, weight: 700, maxLines: 1, kind: "title", color: onBand }));
      return 21;
    }
    // The classic layout's bar, per style; it returns the height it drew (a title that wraps grows it, never overlaps).
    const label = style === "printout" ? `> ${title.toUpperCase()}` : title.toUpperCase();
    let h = 0;
    leaf("H2", {}, () => { h = block(label, x, y + 1, w, { size: 9, floor: LABEL_FLOOR, weight: 700, maxLines: 1, kind: "title", set: headSet }); });
    const ry = y + Math.max(14, h + 2);
    art(() => {
      if (style === "printout") {
        doc.save().lineWidth(0.8).dash(2, { space: 2 }).moveTo(x, ry).lineTo(x + w, ry).stroke("#000").undash().restore();
        rule(x, ry, w, 0.8);
      } else if (style === "dossier") {
        doc.save().lineWidth(0.5).moveTo(x, ry - 1).lineTo(x + w, ry - 1).moveTo(x, ry + 1.5).lineTo(x + w, ry + 1.5).stroke(BRASS).restore();
        rule(x, ry - 1, w, 0.5); rule(x, ry + 1.5, w, 0.5);
      } else {
        doc.save().lineWidth(1.2).moveTo(x, ry).lineTo(x + w, ry).stroke("#000").restore();
        rule(x, ry, w, 1.2);
      }
    });
    return Math.max(18, ry - y + 4);
  };
  /** A table section: rows of cells in columns (fractions of w); rows wrap; rows past maxY go to `rest`. */
  let cellSeq = 0;
  /** Rows of cells as { t, id } (a cell keeps its id when it is split). */
  const cellsOf = (rows) => rows.map(r => r.map(c => { if (c && typeof c === "object" && "id" in c) return c; const id = `c${cellSeq++}`; const t = String(c ?? ""); cellText[id] = t; return { t, id }; }));
  /** `heads`: the column names (a visible header row, tagged TH Column); without them the first cell heads its row. */
  const table = (title, rowsIn, cols, x, y, w, maxY, { accent = [], heads = null } = {}) => group("Sect", {}, () => {
    let rows = cellsOf(rowsIn);
    let cy = y + bar(title, x, y, w);
    const rest = [];
    let placed = 0;
    const tableEl = doc.struct("Table");
    top().add(tableEl);
    stack.push(tableEl);
    try {
    if (heads && rows.length && cy + 2 * BODY * LINE <= maxY) {
      // As tall as its tallest label (a narrow column wraps its name), so no label meets the rule below.
      const lines = heads.map((t, i) => wrap(t, LABEL, w * cols[i] - 4, 700).length);
      const hh = Math.max(...lines) * LABEL * LINE + 3;
      group("TR", {}, () => {
        let hx = x;
        heads.forEach((t, i) => { leaf("TH", { scope: "Column" }, () => block(t, hx, cy, w * cols[i] - 4, { size: LABEL, floor: LABEL, weight: 700, color: MUTED, kind: "colhead", box: { x: hx, y: cy, w: w * cols[i] - 4, h: hh } })); hx += w * cols[i]; });
      });
      art(() => doc.save().lineWidth(0.3).moveTo(x, cy + hh - 1).lineTo(x + w, cy + hh - 1).stroke("#888").restore());
      rule(x, cy + hh - 1, w, 0.3);
      cy += hh;
    }
    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r];
      const sz = (i) => (i === 0 || (fohawk && accent.includes(i)) ? BODY : 9), wt = (i) => (fohawk && accent.includes(i) ? 700 : 400);
      const heights = cells.map((c, i) => (c.t ? wrap(c.t, sz(i), w * cols[i] - 4, wt(i)).length * sz(i) * LINE : 0));
      const h = Math.max(BODY * LINE, ...heights) + 2;
      if (cy + h > maxY) {
        // A row taller than the whole space left on a fresh page is split by lines; the rest continues (r1 #3).
        if (r === 0 && cy + 3 * BODY * LINE <= maxY) {
          const fit = Math.max(1, Math.floor((maxY - cy - 2) / (BODY * LINE)));
          const cut = cells.map((c, i) => { const ln = c.t ? wrap(c.t, sz(i), w * cols[i] - 4, wt(i)) : []; return [{ t: ln.slice(0, fit).join("\n"), id: c.id }, { t: ln.slice(fit).join("\n"), id: c.id }]; });
          if (cut.some(([, more]) => more.t)) {
            rows = [cut.map(([now]) => now), cut.map(([, more]) => more), ...rows.slice(1)];
            r = -1;   // place the first part as an ordinary row
            continue;
          }
        }
        rest.push(...rows.slice(r)); break;
      }
      // Printout: light grey bands behind every other row (the fanfold printout), under the row's text.
      if (style === "printout" && placed % 2 === 1) { art(() => doc.save().rect(x, cy, w, h - 1).fill("#efefef").restore()); shapes.push({ kind: "fill", page, x, y: cy, w, h: h - 1 }); }
      let cx = x;
      group("TR", {}, () => cells.forEach((c, i) => {
        const hot = fohawk && accent.includes(i);
        // The first cell names the row (a skill, a weapon, an attribute): a row header.
        leaf(i === 0 ? "TH" : "TD", i === 0 ? { scope: "Row" } : {}, () => block(c.t, cx, cy, w * cols[i] - 4, { size: i === 0 ? BODY : hot ? BODY : 9, floor: FLOOR, cell: c.id, weight: hot ? 700 : 400, color: hot ? ACCENT : "#000", box: { x: cx, y: cy, w: w * cols[i] - 4, h } }));
        cx += w * cols[i];
      }));
      art(() => doc.save().lineWidth(0.3).moveTo(x, cy + h - 1).lineTo(x + w, cy + h - 1).stroke("#888").restore());
      rule(x, cy + h - 1, w, 0.3);
      cy += h;
      placed++;
    }
    } finally { stack.pop(); tableEl.end(); }
    return { y: cy + 8, rest, placed };
  });

  // ── Page 1: the at-the-table sections, in fixed places ──────────────────────────────────────────────────────
  newPage();
  const L = MARGIN, R = W - MARGIN, CW = R - L, colW = (CW - 18) / 2, X2 = L + colW + 18, BOTTOM = H - MARGIN - 14;
  const active = model.skills.filter(s => s[3] === "active").map(([n, r, sub]) => [n, r, sub]);
  const overflowText = () => `Physical overflow: ${model.monitors.filled.overflow ? `${model.monitors.filled.overflow} of ` : "up to "}${model.monitors.overflow} boxes (Body)`;
  /** Condition monitors: pencil boxes; Fohawk marks the wound levels (L 1, M 3, S 6, D 10 boxes, p.112). */
  const monitors = (x, y0, w) => {
    let yy = y0;
    for (const [name, n, hurt] of [["Physical", model.monitors.physical, model.monitors.filled.physical], ["Stun", model.monitors.stun, model.monitors.filled.stun]]) {
      const label = fohawk ? name.toUpperCase() : name, ly = yy;
      // The boxes carry information (wounds marked): a Figure whose alt text says it; the name is its caption.
      const fig = doc.struct("Figure", { alt: `${name} condition monitor: ${hurt} of ${n} boxes marked.` });
      top().add(fig);
      fig.add(() => block(label, x, ly, w, { size: fohawk ? 8 : 9, weight: 700, maxLines: 1, color: fohawk ? MUTED : "#000" }));
      yy += 12;
      // As many boxes per row as fit with a 2 pt gap at least; more wrap to a next row (never overlap, r1 #5).
      const per = Math.max(1, Math.min(n, Math.floor((w + 2) / (BOX + 2))));
      const gap = per > 1 ? Math.min(4, (w - per * BOX) / (per - 1)) : 0;
      const rowH = BOX + (fohawk ? 13 : 6);
      for (let i = 0; i < n; i++) {
        const lvl = fohawk ? { 0: "L", 2: "M", 5: "S", 9: "D" }[i] : null;
        const bx = x + (i % per) * (BOX + gap), by = yy + Math.floor(i / per) * rowH;
        shapes.push({ kind: "box", page, x: bx, y: by, w: BOX, h: BOX });
        fig.add(() => {
          doc.save().lineWidth(lvl ? 1.6 : 0.8).rect(bx, by, BOX, BOX).stroke(fohawk && !lvl ? "#888" : "#000").restore();
          if (i < hurt) doc.save().lineWidth(1.2).moveTo(bx + 2, by + 2).lineTo(bx + BOX - 2, by + BOX - 2).moveTo(bx + BOX - 2, by + 2).lineTo(bx + 2, by + BOX - 2).stroke("#000").restore();   // a wound carried
          if (lvl) block(lvl, bx + BOX / 2 - 3, by + BOX + 1, 10, { size: 6.5, floor: 6.5, weight: 700, maxLines: 1, color: MUTED });
        });
      }
      fig.end();
      yy += Math.ceil(n / per) * rowH;
    }
    let oh = 0;
    leaf("P", {}, () => { oh = block(overflowText(), x, yy, w, { size: 8.5, floor: FLOOR }); });
    return yy + oh + 8;
  };
  /** The monitors' height in a column of width w, computed exactly as monitors() lays them out. */
  const monitorsHeight = (w) => {
    const per = Math.max(1, Math.floor((w + 2) / (BOX + 2))), rowH = BOX + (fohawk ? 13 : 6);
    const rows = [model.monitors.physical, model.monitors.stun].reduce((t, n) => t + 12 + Math.ceil(n / Math.max(1, Math.min(n, per))) * rowH, 0);
    return rows + wrap(overflowText(), 8.5, w, 400).length * 8.5 * LINE + 8;
  };
  let y = MARGIN;
  let attacks, act;
  if (!fohawk) {
  // ── The classic layout (Classic, Printout, Dossier): the same places; the style changes bars, bands and faces ──
  const PIC = model.portrait ? 72 : 0, HW = CW - (PIC ? PIC + 12 : 0);
  const y0 = y;
  const tagged = (type, fn) => { let h = 0; leaf(type, {}, () => { h = fn(); }); return h; };
  y += tagged("H1", () => block(model.title, L, y, HW, { size: 18, floor: 11, weight: 700, maxLines: 2, kind: "head", set: headSet })) + 2;
  if (PIC) portrait(R - PIC, y0, PIC);
  if (model.draft) y += tagged("P", () => block("DRAFT — character creation not finished", L, y, HW, { size: 9, weight: 700, maxLines: 1 }));
  y += tagged("P", () => block(model.header.map(([k, v]) => `${k}: ${v}`).join("   "), L, y, HW, { size: 9.5, floor: FLOOR, kind: "head", set: headSet })) + 8;
  y = Math.max(y, y0 + PIC + 8);
  const top = y;
  // Left: attributes, pools, armor.
  let ly = table("Attributes", model.attributes, [0.6, 0.4], L, top, colW, BOTTOM).y;
  ly = table("Dice pools", model.pools, [0.6, 0.4], L, ly, colW, BOTTOM).y;
  ly = table("Armor (Ballistic / Impact)", [["Worn", model.armor]], [0.6, 0.4], L, ly, colW, BOTTOM).y;
  // Right: condition monitors (pencil boxes), then attacks.
  let ry = group("Sect", {}, () => monitors(X2, top + bar("Condition monitors", X2, top, colW), colW));
  attacks = table("Attacks", model.attacks, [0.55, 0.2, 0.25], X2, ry, colW, BOTTOM, { heads: HEADS.attacks });
  ry = attacks.y;
  act = table("Active skills", active, [0.4, 0.1, 0.5], L, Math.max(ly, ry), CW, BOTTOM, { heads: HEADS.skills });
  } else {
    // ── Fohawk: header band, big attribute row, stat strip, then skills | monitors + attacks ───────────────────
    const PIC = model.portrait ? 84 : 0, TX = L + 14 + (PIC ? PIC + 12 : 0);
    const PRW = 34 * model.priorities.length, TW = CW - PRW - 44 - (PIC ? PIC + 12 : 0);   // the title stops 16 pt before the priority letters
    const titleH = (() => { let s = 22, lines = wrap(model.title, s, TW, 700); while (lines.length > 2 && s - 0.5 >= 13) { s -= 0.5; lines = wrap(model.title, s, TW, 700); } return lines.length * s * LINE; })();   // as block() will draw it
    const subH = wrap(model.subtitle.toUpperCase(), 9.5, TW, 700).length * 9.5 * LINE;
    const extra = model.header.filter(([k]) => !["Metatype", "Magic", "Priorities", "Karma Pool"].includes(k)).map(([k, v]) => `${k}: ${v}`).join("   ");
    const extraH = extra ? wrap(extra, 8.5, TW, 400).length * 8.5 * LINE + 2 : 0;
    const headH = Math.max(12 + titleH + 4 + subH + (model.draft ? 13 : 0) + extraH + 12, PIC ? PIC + 16 : 0);
    band(L, y, CW, Math.max(headH, 56), 14);
    let hy = y + 12;
    const tagged = (type, fn) => { let h = 0; leaf(type, {}, () => { h = fn(); }); return h; };
    hy += tagged("H1", () => block(model.title, TX, hy, TW, { size: 22, floor: 13, weight: 700, maxLines: 2, color: onBand, kind: "head" })) + 4;
    if (PIC) portrait(L + 8, y + 8, PIC);
    hy += tagged("P", () => block(model.subtitle.toUpperCase(), TX, hy, TW, { size: 9.5, floor: FLOOR, weight: 700, color: inkSaver ? ACCENT : "#e8e8ee" }));   // light on black (r1 #4)
    if (model.draft) hy += 2 + tagged("P", () => block("DRAFT — character creation not finished", TX, hy + 2, TW, { size: 8, floor: 6.5, weight: 700, maxLines: 1, color: onBand }));
    if (extra) tagged("P", () => block(extra, TX, hy + 2, TW, { size: 8.5, floor: FLOOR, color: onBand }));
    // Priorities: a one-row table, each letter headed by its category.
    if (model.priorities.length) group("Table", {}, () => {
      group("TR", {}, () => model.priorities.forEach(([k], i) => leaf("TH", { scope: "Column" }, () => block(k, R - 14 - PRW + i * 34, y + 12, 32, { size: 6.5, floor: 6.5, weight: 700, maxLines: 1, color: inkSaver ? MUTED : "#b5b5bd" }))));
      group("TR", {}, () => model.priorities.forEach(([, v], i) => leaf("TD", {}, () => block(v, R - 14 - PRW + i * 34, y + 22, 32, { size: 16, floor: 12, weight: 700, maxLines: 1, color: i === 0 ? ACCENT : onBand }))));
    });
    y += Math.max(headH, 56) + 10;
    // Attributes: big values, accent when augmented, "nat X" under them.
    // The attribute row and the stat strip: tables whose column heads are the abbreviations above each value.
    group("Sect", {}, () => {
    y += bar("Attributes", L, y, CW);
    const aw = CW / model.attrRow.length;
    let rowH = 0;
    const hs = [];   // each label's drawn height (the TH row draws first), so the value sits exactly where it did
    group("Table", {}, () => {
      group("TR", {}, () => model.attrRow.forEach((a, i) => leaf("TH", { scope: "Column" }, () => { hs[i] = block(a.abbr, L + i * aw + 4, y, aw - 8, { size: 7.5, floor: 6.5, weight: 700, maxLines: 1, color: MUTED }); })));
      group("TR", {}, () => model.attrRow.forEach((a, i) => leaf("TD", {}, () => {
        const ax = L + i * aw;
        let h = hs[i];
        h += block(a.value, ax + 4, y + h, aw - 8, { size: 20, floor: 12, weight: 700, maxLines: 1, color: a.natural ? ACCENT : "#000" });
        if (a.natural) h += block(`nat ${a.natural}`, ax + 4, y + h, aw - 8, { size: 7.5, floor: 6.5, maxLines: 1, color: MUTED });
        rowH = Math.max(rowH, h);   // measured: a long value pushes the row down, never into the next (r1 #2)
      })));
    });
    y += Math.max(rowH, 46) + 4;
    art(() => doc.save().lineWidth(0.5).moveTo(L, y).lineTo(R, y).stroke("#999").restore());
    y += 4;
    const perRow = Math.min(model.stats.length, 6), sw = CW / perRow;
    group("Table", {}, () => {
    for (let r = 0; r * perRow < model.stats.length; r++) {
      let rowH2 = 0;
      const part = model.stats.slice(r * perRow, r * perRow + perRow);
      const kh = [];
      group("TR", {}, () => part.forEach(([k], i) => leaf("TH", { scope: "Column" }, () => { kh[i] = Math.max(block(k.toUpperCase(), L + i * sw + 4, y, sw - 8, { size: 6.5, floor: 6.5, weight: 700, maxLines: 2, color: MUTED }), 16); })));
      group("TR", {}, () => part.forEach(([, v], i) => leaf("TD", {}, () => {
        const h = kh[i] + block(v, L + i * sw + 4, y + kh[i], sw - 8, { size: 13, floor: 9, weight: 700, maxLines: 1 });
        rowH2 = Math.max(rowH2, h);
      })));
      y += rowH2 + 6;   // measured per row (r1 #3)
    }
    });
    });
    y += 4;
    // The fixed part must fit: the condition monitor (bar + boxes) and the Attacks bar with one row below it (r1 #1, r2 #1).
    if (y + 21 + monitorsHeight(colW) + 21 + BODY * LINE + 2 > BOTTOM) throw new SheetError("This character's header is too long for the Fohawk style: print it in the Classic style.");
    act = table("Skills", active, [0.62, 0.12, 0.26], L, y, colW, BOTTOM, { accent: [1], heads: HEADS.skills });
    let ry = group("Sect", {}, () => monitors(X2, y + bar("Condition monitor", X2, y, colW), colW));
    attacks = table("Attacks", model.attacks, [0.5, 0.25, 0.25], X2, ry, colW, BOTTOM, { accent: [1], heads: HEADS.attacks });
    act = { ...act, y: Math.max(act.y, attacks.y) };
  }

  // ── Continuation pages: everything else, flowing ───────────────────────────────────────────────────────────
  const flow = [
    ["Attacks (continued)", attacks.rest, [0.55, 0.2, 0.25], HEADS.attacks],
    ["Active skills (continued)", act.rest, [0.4, 0.1, 0.5], HEADS.skills],
    ["Knowledge, language and other skills", model.skills.filter(s => s[3] !== "active").map(([n, r, sub]) => [n, r, sub]), [0.4, 0.1, 0.5], HEADS.skills],
    ["Cyberware", model.cyberware, [0.55, 0.1, 0.15, 0.2], ["Cyberware", "Rating", "Essence", "Source"]],
    ["Bioware", model.bioware ?? [], [0.45, 0.1, 0.25, 0.2], ["Bioware", "Rating", "Grade · Body Cost", "Source"]],
    ["Adept powers", model.powers, [0.35, 0.1, 0.4, 0.15], ["Power", "Level", "Choice", "Source"]],
    ["Spells", model.spells, [0.4, 0.1, 0.3, 0.2], ["Spell", "Force", "Category · Drain", "Source"]],
    ["Foci", model.foci, [0.4, 0.1, 0.3, 0.2], ["Focus", "Force", "Bound spell", "Source"]],
    ["Edges and Flaws", model.qualities ?? [], [0.4, 0.1, 0.3, 0.2], ["Edge or Flaw", "Value", "Detail", "Source"]],
    ["Gear", model.gear, [0.55, 0.12, 0.13, 0.2], ["Item", "Qty / Rating", "Armor", "Source"]],
    ["Vehicles", model.vehicles ?? [], [0.3, 0.25, 0.3, 0.15], ["Vehicle", "Handling · Speed", "Body · Armor · Sig · Pilot", "Source"]],
    ["History", model.history ?? [], [0.14, 0.56, 0.2, 0.1], ["Date", "What", "By · Note", "Undone"]]
  ].filter(([, rows]) => rows.length);
  // Page 1's fixed part must lie inside the page (an absurd imported name, say): refuse, never cut (card r1 #2).
  if (runs.some(r => r.page === 1 && r.y + r.h > BOTTOM + 0.5) || shapes.some(b => b.page === 1 && b.y + b.h > BOTTOM + 0.5))
    throw new SheetError("This character's header is too long to print. Shorten the name or notes.", [{ section: "Header", rows: 0 }]);
  let fy = act.y;   // the rest continues below, on page 1 while it fits
  if (model.card) {
    // The table card is ONE page: what doesn't fit is reported by section, never moved to a new page or cut.
    const overflow = [];
    const sectionOf = (t) => t.replace(/ \(continued\)$/, "");
    for (const [title, rows, cols, heads] of flow) {
      if (!rows.length) continue;
      if (fy + 40 > BOTTOM) { overflow.push({ section: sectionOf(title), rows: rows.length }); continue; }
      const out = table(title, rows, cols, L, fy, CW, BOTTOM, { heads });
      fy = out.y;
      if (out.rest.length) overflow.push({ section: sectionOf(title), rows: out.rest.length });
    }
    if (overflow.length) throw new SheetError(`The card is too full: ${overflow.map(o => `${o.rows} ${o.section.toLowerCase()}`).join(", ")} don't fit. Untick something.`, overflow);
    flow.length = 0;
  }
  for (let [title, rows, cols, heads] of flow) {
    while (rows.length) {
      if (fy == null || fy + 60 > BOTTOM) { newPage(); fy = MARGIN; }
      const out = table(title, rows, cols, L, fy, CW, BOTTOM, { heads });
      if (!out.placed) { newPage(); fy = MARGIN; const again = table(title, rows, cols, L, fy, CW, BOTTOM, { heads }); if (!again.placed) throw new SheetError(`${title}: a row is taller than a page.`); rows = again.rest; fy = again.y; }
      else { rows = out.rest; fy = out.y; }
      title = title.endsWith("(continued)") ? title : `${title} (continued)`;
    }
  }
  if (model.notes) {
    let lines = wrap(model.notes, BODY, CW, 400);
    let first = true;
    while (lines.length) {
      if (fy == null || fy + 60 > BOTTOM) { newPage(); fy = MARGIN; }
      group("Sect", {}, () => {
        fy += bar(first ? "Notes" : "Notes (continued)", L, fy, CW);
        const fit0 = Math.max(1, Math.floor((BOTTOM - fy) / (BODY * LINE)));
        leaf("P", {}, () => lines.slice(0, fit0).forEach((ln, i) => draw(ln, L, fy + i * BODY * LINE, BODY, 400, { x: L, y: fy, w: CW, h: fit0 * BODY * LINE })));
      });
      const fit = Math.max(1, Math.floor((BOTTOM - fy) / (BODY * LINE)));
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
    art(() => draw(`Page ${p} of ${pages}`, L, H - MARGIN - 9, LABEL, 400, { x: L, y: H - MARGIN - 9, w: CW, h: 12 }, "footer"), "Pagination");   // the title is in the header, in full
  }
  root.end();
  doc.end();
  await done;
  return { pdf: Buffer.concat(chunks), runs, shapes, cells: cellText, pages, size: [W, H], margin: MARGIN };
}
