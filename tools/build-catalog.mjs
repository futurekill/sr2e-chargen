#!/usr/bin/env node
/**
 * Build the catalog (docs/PLAN-catalog.md): read this project's checked copy of the pinned content (content/,
 * Amendment A), select what a character can have,
 * shape each document, tag every piece of book wording with its book, and write catalog/.
 * The same pins give a byte-identical catalog.json (no timestamp, sorted entries).
 *
 *   node tools/build-catalog.mjs [outDir]    build outDir (default catalog/) from content/ and content-pins.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readVendored, shapeRepo, checkContentRoot, DESIGN_TABLES } from "./content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PATHS = JSON.parse(readFileSync(join(ROOT, "tools/string-paths.json"), "utf8"));
/** A path from string-paths.json → a RegExp: every character literal, except the `{@}` marker (an optional @variant). */
const asPattern = (p) => new RegExp(`^${p.split("{@}").map(part => part.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")).join("(@[A-Za-z]+)?")}$`);
const CLASSES = ["text", "category", "short", "formula"].map(kind => ({ kind, max: PATHS[kind].max ?? null,
  values: PATHS[kind].values ? new Set(PATHS[kind].values) : null, paths: PATHS[kind].paths.map(asPattern) }));
const NO_BOOK = new Set(PATHS.noBook.ids);
/** A citation's page: `124`, `98–100`, `12, 14`. */
const PAGE = /^\d{1,3}([–-]\d{1,3})?(, ?\d{1,3}([–-]\d{1,3})?)*$/;
/**
 * Words that make a sentence and that no code, key, label or formula in the content uses (checked against the
 * pinned content): the word-run test alone resets at punctuation ("It gains speed. It gains control.").
 */
const SENTENCE_WORD = /(^|\s)(the|is|are|was|were|that|this|these|those|will|which|their|its|has|have|and|when|with|from|your|you|can|must|may|gains?)(?=\s|$|[.,;:!?])/i;
/** The longest run of plain words in a string. Codes and formulas name a stat or two; a sentence runs on. */
const wordRun = (s) => Math.max(0, ...(String(s).match(/(?:[A-Za-z]{2,} +)*[A-Za-z]{2,}/g) ?? []).map(m => m.trim().split(/ +/).length));
/** The class of a string path (`{ kind, max, pattern }`), or null when nobody has classified it. */
export const classify = (path) => CLASSES.find(c => c.paths.some(r => r.test(path))) ?? null;
/** Why a string may not stay at a data path, or null: too long, more than one line, or not the path's pattern. */
function dataProblem(cls, value) {
  if (cls.values) return cls.values.has(value) ? null : "is not a known category (tools/string-paths.json)";
  if (cls.max && value.length > cls.max) return `is ${value.length} characters (at most ${cls.max} there)`;
  if (/[\r\n]/.test(value)) return "has more than one line";
  if (wordRun(value) > 4 || SENTENCE_WORD.test(value)) return "reads as a sentence (more than 4 words in a row, or a sentence word)";
  return null;
}

/**
 * Compendium HTML → plain text (the client renders text only; nothing here is ever interpreted as markup).
 * Tags are removed by a scanner, not a pattern: everything from `<` to the next `>` goes, so no arrangement of
 * nested or broken tags can leave one behind. Block ends become line breaks. Entities are decoded LAST.
 */
export function plain(html) {
  const src = String(html ?? "");
  let out = "";
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "<") { out += src[i]; continue; }
    const end = src.indexOf(">", i);
    if (end < 0) break;                                   // an unclosed tag: the rest is dropped
    if (/^<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b/i.test(src.slice(i, end + 1))) out += "\n";
    i = end;
  }
  const ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", times: "×", divide: "÷", yen: "¥" };
  return out
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, n) => (n[0] !== "#" ? ENT[n.toLowerCase()] ?? m
      : String.fromCodePoint(n[1].toLowerCase() === "x" ? parseInt(n.slice(2), 16) : Number(n.slice(1)))))
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Move every `text` string out of `node` (tagged with `book`) and check every other string against its class.
 * `root` is the path of `node` ("system" or "flags.sr2e"); text keys are relative to the document (`notes`,
 * `flags.drug.notes`). A string at an unclassified path, or one that doesn't fit its class, is a problem.
 */
export function splitText(node, root, book, problems, where, text = {}) {
  const keyOf = (p) => (root === "system" ? p.slice("system.".length) : p.replace(/^flags\.sr2e\./, "flags."));
  const check = (value, g, drop, p) => {
    if (!value) return;
    const cls = classify(g);
    if (!cls) return void problems.push(`${where}: a string at ${g} is not classified in tools/string-paths.json ("${value.slice(0, 40)}")`);
    if (cls.kind === "text") { text[keyOf(p)] = { book, value: plain(value) }; drop(); return; }
    const why = dataProblem(cls, value);
    if (why) problems.push(`${where}: the string at ${g} ${why} — book wording belongs in a text path ("${value.slice(0, 40)}")`);
  };
  const walk = (n, path, generic) => {
    for (const [k, v] of Object.entries(n)) {
      const p = `${path}.${k}`, g = `${generic}.${k}`;
      if (typeof v === "string") check(v, g, () => { delete n[k]; }, p);
      else if (Array.isArray(v)) v.forEach((x, i) => {
        if (typeof x === "string") check(x, `${g}[]`, () => { v[i] = ""; }, `${p}[${i}]`);
        else if (x && typeof x === "object") walk(x, `${p}[${i}]`, `${g}[]`);
      });
      else if (v && typeof v === "object") walk(v, p, g);
    }
  };
  walk(node, root, root);
  return text;
}
/** Strings in an effect's name and changes are rule data: short, one line (never book wording). */
function auditEffect(e, problems, where) {
  if (typeof e.name !== "string" || e.name.length > 80 || /[\r\n]/.test(e.name)) problems.push(`${where}: an effect name is too long to be a name`);
  // A change is { key: a system path, value: a number, mode/type: a word } — rule data by its shape, not its length.
  const SHAPE = { key: /^system\.[A-Za-z0-9_.]{1,80}$/, value: /^-?\d+(\.\d+)?$/, type: /^[a-z][A-Za-z0-9_.]{0,30}$/, mode: /^[a-z][A-Za-z0-9_.]{0,30}$/ };
  for (const c of e.changes) for (const [k, v] of Object.entries(c)) {
    if (typeof v !== "string") continue;
    if (!SHAPE[k] || !SHAPE[k].test(v)) problems.push(`${where}: an effect change's ${k} is not rule data ("${v.slice(0, 40)}")`);
  }
}

const kindOf = (doc) => /^!(\w+)!/.exec(String(doc._key ?? ""))?.[1] ?? null;
/** A catalog record? Decided by its KIND first: a folder record has `type: "Item"` and is not an item. */
export function selected(doc, pack) {
  const kind = kindOf(doc);
  if (kind === "items") return "item";
  if (kind === "actors" && (doc.type === "vehicle" || (doc.type === "character" && pack === "runners") || (doc.type === "npc" && pack === "contact-npcs"))) return "actor";
  return null;
}

/** Shape one document into a catalog entry. `ctx`: { package, pack, packLabel, packType, books, packageBook, folders }. */
export function shape(doc, ctx, problems, embeddedIn = null) {
  const where = `${ctx.package}/${ctx.pack}/${doc.name}`;
  const system = structuredClone(doc.system ?? {});
  const cite = system.citation;
  const citedBook = cite && typeof cite.book === "string" && ctx.books[cite.book] ? cite.book : null;
  if (cite?.book && cite.book !== "none" && !citedBook) problems.push(`${where}: cites an unknown book "${cite.book}"`);
  const citation = citedBook ? { book: citedBook, page: String(cite.page ?? "") } : null;
  const listBook = citedBook ?? ctx.packageBook;   // the toggles' book: its own, else the package's (never shown as a citation)
  const flags = structuredClone(doc.flags?.sr2e ?? {});
  const text = splitText(system, "system", listBook, problems, where);
  splitText(flags, "flags.sr2e", listBook, problems, where, text);
  const effects = (doc.effects ?? []).map(e => ({ name: e.name, disabled: !!e.disabled, transfer: e.transfer !== false, changes: e.changes ?? e.system?.changes ?? [] }));
  for (const e of effects) auditEffect(e, problems, where);
  const id = embeddedIn ? `${embeddedIn}#${doc._id}` : `${ctx.package}.${ctx.pack}.${doc._id}`;
  const kind = embeddedIn ? "item" : selected(doc, ctx.pack);
  const uuid = embeddedIn ? null : `Compendium.${ctx.package}.${ctx.pack}.${kind === "actor" ? "Actor" : "Item"}.${doc._id}`;
  const source = embeddedIn ? (doc._stats?.compendiumSource ?? null) : uuid;
  const folderPath = []; for (let f = ctx.folders.get(doc.folder), guard = 0; f && guard < 8; f = ctx.folders.get(f.folder), guard++) folderPath.unshift(f.name);
  const category = [...(folderPath.length ? folderPath : [ctx.packLabel]), ...(typeof system.category === "string" && system.category ? [system.category] : [])];
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const entry = {
    id, uuid, package: ctx.package, pack: ctx.pack, book: citedBook, listBook, kind, type: doc.type, name: doc.name,
    category, citation, cost: system.focusType === "weapon" ? null : num(system.cost) /* by its weapon's Reach, p.263 */, streetIndex: system.streetIndex ?? null, availability: system.availability ?? null,
    img: typeof doc.img === "string" ? doc.img : null,
    system, text,
    flags: Object.keys(flags).length ? { sr2e: flags } : {},
    _stats: { compendiumSource: source },
    effects,
    ...(embeddedIn ? { embeddedIn } : {})
  };
  if (Array.isArray(doc.items) && !embeddedIn) entry.items = doc.items.map(i => shape(i, ctx, problems, id));
  // Every top-level item cites a book and a page. The one exception: a CONTACT may cite "none" (not printed in any
  // book) — never a way to drop another item's badge.
  if (!embeddedIn && kind === "item") {
    const none = cite?.book === "none";
    if (none && !NO_BOOK.has(id)) problems.push(`${where}: only the listed contacts may cite book "none" (tools/string-paths.json noBook)`);
    else if (!none && !citation) problems.push(`${where}: an item with no citation`);
    else if (citation && !PAGE.test(citation.page)) problems.push(`${where}: "${citation.page.slice(0, 20)}" is not a page`);
  }
  return entry;
}

/**
 * The system's book table at the pinned commit: `{ key: { abbr, title, code, module } }`. PARSED, never evaluated:
 * a pinned commit is data, and importing it would run whatever it contains on the build host. Every line of the
 * table must be one plain entry; anything else fails the build.
 */
export function parseBooks(src) {
  const start = src.indexOf("export const BOOKS = Object.freeze({");
  const end = start < 0 ? -1 : src.indexOf("\n});", start);
  if (start < 0 || end < 0) throw new Error("books.mjs: the BOOKS table was not found");
  const books = {}, STR = '"((?:[^"\\\\]|\\\\.)*)"';
  const line = new RegExp(`^\\s*([a-z][a-z0-9]{0,15}): \\{ abbr: ${STR}, title: ${STR}, code: ${STR}, module: ${STR} \\},?$`);
  for (const raw of src.slice(src.indexOf("\n", start) + 1, end).split("\n")) {
    if (!raw.trim()) continue;
    const m = line.exec(raw);
    if (!m) throw new Error(`books.mjs: a line of the BOOKS table is not a plain entry: ${raw.trim().slice(0, 60)}`);
    if (books[m[1]]) throw new Error(`books.mjs: the book key ${m[1]} is there twice`);
    const [abbr, title, code, module] = m.slice(2).map(v => JSON.parse(`"${v}"`));
    books[m[1]] = { abbr, title, code, module };
  }
  if (!books.sr2 || books.sr2.module !== "sr2e") throw new Error("books.mjs: no core book (sr2 → sr2e)");
  return books;
}
function booksOf(system) {
  const src = system.files.get("module/rules/books.mjs");
  if (!src) throw new Error("the system's copy has no module/rules/books.mjs");
  return parseBooks(src.toString("utf8"));
}

export function buildCatalog({ pins, contentDir }) {
  checkContentRoot(contentDir, pins);
  const repos = pins.map(pin => shapeRepo(pin, readVendored(contentDir, pin)));
  const system = repos[0];
  if (system.id !== "sr2e") throw new Error("the first pin must be the system (sr2e)");
  return assemble(repos, booksOf(system));
}

/** Documents → catalog. `repos`: [{ id, version, tag, commit, packs, docs }] (tools/content.mjs readPinned); `books`: the BOOKS table. */
export function assemble(repos, books) {
  // A package's own book: the FIRST book that names it. Two books name the core package (sr2 and vr2); the core
  // book is first in the table, and that is checked rather than assumed.
  const bookOfPackage = {};
  for (const [key, b] of Object.entries(books)) bookOfPackage[b.module] ??= key;
  if (bookOfPackage.sr2e !== "sr2") throw new Error("the core package's book must be sr2");
  const problems = [], entries = [], seen = new Set();
  for (const repo of repos) {
    const packageBook = bookOfPackage[repo.id];
    if (!packageBook) { problems.push(`${repo.id}: no book in the system's BOOKS table names this package`); continue; }
    const byPack = new Map(repo.packs.map(p => [p.name, p]));
    const folders = new Map(repo.docs.filter(d => kindOf(d.doc) === "folders").map(d => [d.doc._id, d.doc]));
    for (const { pack, doc } of repo.docs) {
      if (!selected(doc, pack)) continue;
      const ctx = { package: repo.id, pack, packLabel: byPack.get(pack)?.label ?? pack, books, packageBook, folders };
      const entry = shape(doc, ctx, problems);
      if (seen.has(entry.id)) problems.push(`duplicate catalog id ${entry.id}`);
      seen.add(entry.id);
      entries.push(entry);
    }
  }
  pairImplantWeapons(entries, problems);
  if (problems.length) throw new Error(`the catalog can't be built:\n  ${[...new Set(problems)].slice(0, 60).join("\n  ")}${problems.length > 60 ? `\n  … and ${problems.length - 60} more` : ""}`);
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const count = (key) => entries.reduce((m, e) => { m[e[key]] = (m[e[key]] ?? 0) + 1; return m; }, {});
  const byBook = count("listBook");
  return {
    pins: repos.map(r => ({ id: r.id, dir: r.dir ?? r.id, version: r.version, tag: r.tag, commit: r.commit })),
    books: Object.entries(books).filter(([key]) => byBook[key]).map(([key, b]) => ({ key, abbr: b.abbr, title: b.title, module: b.module, count: byBook[key] })),
    types: Object.entries(count("type")).sort(([a], [b]) => (a < b ? -1 : 1)).map(([type, n]) => ({ type, count: n })),
    entries
  };
}

/**
 * Implant weapons (docs/PLAN-M5l.md Draft 2): an implant's `pairedWeapon` "pkg:w-x" names the weapon whose `pairedWare`
 * is "pkg:x", in the same package; exactly one match each way, or the build fails. The implant gains `pairedWeaponId`.
 */
export function pairImplantWeapons(entries, problems) {
  const weapons = entries.filter(e => e.type === "weapon" && typeof e.flags?.sr2e?.pairedWare === "string");
  const implants = entries.filter(e => e.type === "cyberware" && typeof e.flags?.sr2e?.pairedWeapon === "string");
  for (const imp of implants) {
    const key = imp.flags.sr2e.pairedWeapon, m = /^([a-z0-9]+):w-(.+)$/.exec(key);
    const hits = m ? weapons.filter(w => w.package === imp.package && w.flags.sr2e.pairedWare === `${m[1]}:${m[2]}`) : [];
    if (hits.length !== 1) { problems.push(`${imp.id}: its paired weapon "${key}" matches ${hits.length} weapons`); continue; }
    imp.pairedWeaponId = hits[0].id;
    hits[0].pairedWareId = imp.id;
  }
  for (const w of weapons) {
    const n = implants.filter(i => i.pairedWeaponId === w.id).length;
    if (n !== 1) problems.push(`${w.id}: its paired ware "${w.flags.sr2e.pairedWare}" matches ${n} implants`);
  }
}

/**
 * Vehicles' COMPLETE actor sources by catalog id (docs/PLAN-S9-vehicles.md Draft 4): a character that buys one keeps
 * the whole source, so the Foundry connector recreates it whatever the destination world's compendium holds.
 */
export function vehicleSources({ pins, contentDir }) {
  const out = {};
  for (const pin of pins) {
    const repo = shapeRepo(pin, readVendored(contentDir, pin));
    for (const { pack, doc } of repo.docs) if (selected(doc, pack) === "actor" && doc.type === "vehicle") out[`${repo.id}.${pack}.${doc._id}`] = doc;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));   // byte-stable
}

/**
 * Book NPCs' COMPLETE actor sources by catalog id (docs/PLAN-npc-builder.md 1): the 22 contacts (core p.203–213) and the
 * 7 archetypes, for the NPC builder. `prRange` = a Professional Rating RANGE the book prints ("3-4") where the source
 * stores only its low end (r5 #2), read from the source's biography line; null otherwise.
 */
export function npcSources({ pins, contentDir }) {
  const out = {};
  const range = (doc) => {
    const m = /Professional Rating:(?:<\/strong>|\*\*)?\s*(\d)\s*[-–]\s*(\d)/.exec(String(doc.system?.biography ?? ""));
    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  for (const pin of pins) {
    const repo = shapeRepo(pin, readVendored(contentDir, pin));
    for (const { pack, doc } of repo.docs) if (selected(doc, pack) === "actor" && (doc.type === "npc" || doc.type === "character"))
      out[`${repo.id}.${pack}.${doc._id}`] = { source: doc, prRange: doc.type === "npc" ? range(doc) : null };
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));   // byte-stable
}

/**
 * Rigger 2's vehicle-design tables (docs/PLAN-workshop.md 1.2), keyed as the system's registerVehicleDesignTables keys
 * them, from the one pin that has them; null when none does. `pin` records where they came from.
 */
export function designTables({ pins, contentDir }) {
  for (const pin of pins) {
    const files = readVendored(contentDir, pin);
    if (!DESIGN_TABLES.every(f => files.has(f))) continue;
    const [c, p, rules] = DESIGN_TABLES.map(f => JSON.parse(files.get(f).toString("utf8")));
    const keyed = (rows) => Object.fromEntries(rows.map(r => [r.key, r]));
    if (!Array.isArray(c?.chassis) || !Array.isArray(p?.powerPlants) || !rules?.fuel || !rules?.markUp) throw new Error(`${pin.dir}: the design tables are misshapen`);
    return { pin: { dir: pin.dir, tag: pin.tag, commit: pin.commit }, chassis: keyed(c.chassis), powerPlants: keyed(p.powerPlants), fuel: rules.fuel, markUp: rules.markUp };
  }
  return null;
}

/** The manifest a catalog implies: everything but the entries (their count instead). The server recomputes it. */
export function manifestOf(catalog) {
  const { entries, ...rest } = catalog;
  return { ...rest, entries: entries.length };
}

/** Write {catalog.json, manifest.json} (and vehicles.json, design-tables.json, npcs.json when given) into `outDir`; the
 *  manifest carries each file's SHA-256. */
export function writeCatalog(catalog, outDir, vehicles = null, design = null, npcs = null) {
  mkdirSync(outDir, { recursive: true });
  const body = JSON.stringify(catalog);
  writeFileSync(join(outDir, "catalog.json"), body);
  const manifest = { ...manifestOf(catalog), sha256: createHash("sha256").update(body).digest("hex") };
  if (vehicles) {
    const v = JSON.stringify(vehicles);
    writeFileSync(join(outDir, "vehicles.json"), v);
    manifest.vehiclesSha256 = createHash("sha256").update(v).digest("hex");
  }
  if (design) {
    const d = JSON.stringify(design);
    writeFileSync(join(outDir, "design-tables.json"), d);
    manifest.designSha256 = createHash("sha256").update(d).digest("hex");
  }
  if (npcs) {
    const n = JSON.stringify(npcs);
    writeFileSync(join(outDir, "npcs.json"), n);
    manifest.npcsSha256 = createHash("sha256").update(n).digest("hex");
  }
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pins = JSON.parse(readFileSync(join(ROOT, "content-pins.json"), "utf8")).content;
  try {
    const out = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, "catalog");
    const contentDir = join(ROOT, "content");
    const manifest = writeCatalog(buildCatalog({ pins, contentDir }), out, vehicleSources({ pins, contentDir }), designTables({ pins, contentDir }), npcSources({ pins, contentDir }));
    console.log(`catalog: ${manifest.entries} entries from ${manifest.pins.length} packages, ${manifest.books.length} books — sha256 ${manifest.sha256.slice(0, 16)}…`);
    for (const b of manifest.books) console.log(`  ${b.abbr.padEnd(12)} ${String(b.count).padStart(5)}  ${b.title}`);
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
