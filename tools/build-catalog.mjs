#!/usr/bin/env node
/**
 * Build the catalog (docs/PLAN-catalog.md): read the pinned content from Git, select what a character can have,
 * shape each document, tag every piece of book wording with its book, and write catalog/.
 * The same pins give a byte-identical catalog.json (no timestamp, sorted entries).
 *
 *   node tools/build-catalog.mjs            build catalog/ from content-pins.json
 *   node tools/build-catalog.mjs --pins     rewrite the pins' commits from their tags (a reviewed change)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPinned, readFile, tagCommit } from "./content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PATHS = JSON.parse(readFileSync(join(ROOT, "tools/string-paths.json"), "utf8"));
const asPattern = (p) => new RegExp(`^${p.replace(/[.[\]]/g, "\\$&").replace(/\*/g, "[^.]+")}$`);
const TEXT = PATHS.text.map(asPattern), DATA = PATHS.data.map(asPattern);
export const classify = (path) => (TEXT.some(r => r.test(path)) ? "text" : DATA.some(r => r.test(path)) ? "data" : null);

/** Compendium HTML → plain text (the client renders text only; nothing here is ever interpreted as markup). */
export function plain(html) {
  const ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", times: "×", divide: "÷", yen: "¥" };
  return String(html ?? "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Move every `text` string out of `system` (tagged with `book`); report strings at paths nobody classified. */
export function splitText(system, book, problems, where) {
  const text = {};
  const walk = (node, path, generic) => {
    for (const [k, v] of Object.entries(node)) {
      const p = `${path}.${k}`, g = `${generic}.${k}`;
      if (typeof v === "string") {
        if (!v) continue;
        const kind = classify(g);
        if (kind === "text") { text[p.slice("system.".length)] = { book, value: plain(v) }; delete node[k]; }
        else if (!kind) problems.push(`${where}: a string at ${g} is not classified in tools/string-paths.json ("${v.slice(0, 40)}")`);
      } else if (Array.isArray(v)) {
        v.forEach((x, i) => {
          if (typeof x === "string") { if (x && !classify(`${g}[]`)) problems.push(`${where}: a string at ${g}[] is not classified ("${x.slice(0, 40)}")`); }
          else if (x && typeof x === "object") walk(x, `${p}[${i}]`, `${g}[]`);
        });
      } else if (v && typeof v === "object") walk(v, p, g);
    }
  };
  walk(system, "system", "system");
  return text;
}

const kindOf = (doc) => /^!(\w+)!/.exec(String(doc._key ?? ""))?.[1] ?? null;
/** A catalog record? Decided by its KIND first: a folder record has `type: "Item"` and is not an item. */
export function selected(doc, pack) {
  const kind = kindOf(doc);
  if (kind === "items") return "item";
  if (kind === "actors" && (doc.type === "vehicle" || (doc.type === "character" && pack === "runners"))) return "actor";
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
  const text = splitText(system, listBook, problems, where);
  const id = embeddedIn ? `${embeddedIn}#${doc._id}` : `${ctx.package}.${ctx.pack}.${doc._id}`;
  const kind = embeddedIn ? "item" : selected(doc, ctx.pack);
  const uuid = embeddedIn ? null : `Compendium.${ctx.package}.${ctx.pack}.${kind === "actor" ? "Actor" : "Item"}.${doc._id}`;
  const source = embeddedIn ? (doc._stats?.compendiumSource ?? null) : uuid;
  const folderPath = []; for (let f = ctx.folders.get(doc.folder), guard = 0; f && guard < 8; f = ctx.folders.get(f.folder), guard++) folderPath.unshift(f.name);
  const category = [...(folderPath.length ? folderPath : [ctx.packLabel]), ...(typeof system.category === "string" && system.category ? [system.category] : [])];
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const entry = {
    id, uuid, package: ctx.package, pack: ctx.pack, book: citedBook, listBook, kind, type: doc.type, name: doc.name,
    category, citation, cost: num(system.cost), streetIndex: system.streetIndex ?? null, availability: system.availability ?? null,
    img: typeof doc.img === "string" ? doc.img : null,
    system, text,
    flags: doc.flags?.sr2e && Object.keys(doc.flags.sr2e).length ? { sr2e: doc.flags.sr2e } : {},
    _stats: { compendiumSource: source },
    effects: (doc.effects ?? []).map(e => ({ name: e.name, disabled: !!e.disabled, transfer: e.transfer !== false, changes: e.changes ?? e.system?.changes ?? [] })),
    ...(embeddedIn ? { embeddedIn } : {})
  };
  if (Array.isArray(doc.items) && !embeddedIn) entry.items = doc.items.map(i => shape(i, ctx, problems, id));
  if (!embeddedIn && kind === "item" && !citation && cite?.book !== "none") problems.push(`${where}: an item with no citation (give it one, or cite book "none")`);
  return entry;
}

/** The system's book table at the pinned commit: `{ key: { abbr, title, code, module } }`. */
async function booksAt(repo, commit) {
  const src = readFile(repo, commit, "module/rules/books.mjs");
  if (!src) throw new Error("the system has no module/rules/books.mjs at its pinned commit");
  if (/^\s*import\s/m.test(src.toString())) throw new Error("books.mjs imports other modules: the build reads it alone");
  const mod = await import(`data:text/javascript;base64,${src.toString("base64")}`);
  return JSON.parse(JSON.stringify(mod.BOOKS));
}

export async function buildCatalog({ pins, contentRoot }) {
  const repos = pins.map(pin => readPinned(contentRoot, pin));
  const system = repos[0];
  if (system.id !== "sr2e") throw new Error("the first pin must be the system (sr2e)");
  return assemble(repos, await booksAt(system.repo, system.commit));
}

/** Documents → catalog. `repos`: [{ id, version, tag, commit, packs, docs }] (tools/content.mjs readPinned); `books`: the BOOKS table. */
export function assemble(repos, books) {
  const bookOfPackage = Object.fromEntries(Object.entries(books).map(([key, b]) => [b.module, key]));
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
  if (problems.length) throw new Error(`the catalog can't be built:\n  ${[...new Set(problems)].slice(0, 60).join("\n  ")}${problems.length > 60 ? `\n  … and ${problems.length - 60} more` : ""}`);
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const count = (key) => entries.reduce((m, e) => { m[e[key]] = (m[e[key]] ?? 0) + 1; return m; }, {});
  const byBook = count("listBook");
  return {
    pins: repos.map(r => ({ id: r.id, version: r.version, tag: r.tag, commit: r.commit })),
    books: Object.entries(books).filter(([key]) => byBook[key]).map(([key, b]) => ({ key, abbr: b.abbr, title: b.title, module: b.module, count: byBook[key] })),
    types: Object.entries(count("type")).sort(([a], [b]) => (a < b ? -1 : 1)).map(([type, n]) => ({ type, count: n })),
    entries
  };
}

/** Write {catalog.json, manifest.json} into `outDir`; the manifest carries the catalog file's SHA-256. */
export function writeCatalog(catalog, outDir) {
  mkdirSync(outDir, { recursive: true });
  const body = JSON.stringify(catalog);
  writeFileSync(join(outDir, "catalog.json"), body);
  const { entries, ...rest } = catalog;
  const manifest = { ...rest, entries: entries.length, sha256: createHash("sha256").update(body).digest("hex") };
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pinsPath = join(ROOT, "content-pins.json"), file = JSON.parse(readFileSync(pinsPath, "utf8"));
  const contentRoot = process.env.CONTENT_ROOT ? resolve(process.env.CONTENT_ROOT) : resolve(ROOT, "..");
  try {
    if (process.argv.includes("--pins")) {
      for (const pin of file.content) {
        const c = tagCommit(join(contentRoot, pin.dir), pin.tag);
        if (!c) throw new Error(`${pin.dir}: no tag ${pin.tag}`);
        if (c !== pin.commit) console.log(`${pin.dir} ${pin.tag}: ${String(pin.commit).slice(0, 12)} → ${c.slice(0, 12)}`);
        pin.commit = c;
      }
      writeFileSync(pinsPath, `${JSON.stringify(file, null, 2)}\n`);
      console.log("pins written");
    } else {
      const manifest = writeCatalog(await buildCatalog({ pins: file.content, contentRoot }), join(ROOT, "catalog"));
      console.log(`catalog: ${manifest.entries} entries from ${manifest.pins.length} packages, ${manifest.books.length} books — sha256 ${manifest.sha256.slice(0, 16)}…`);
      for (const b of manifest.books) console.log(`  ${b.abbr.padEnd(12)} ${String(b.count).padStart(5)}  ${b.title}`);
    }
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
