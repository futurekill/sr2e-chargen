import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assemble, writeCatalog, plain, classify, selected, shape, parseBooks, manifestOf } from "../tools/build-catalog.mjs";
import { fixtureRepos, BOOKS } from "./fixtures/make-catalog.mjs";
import { loadCatalog, searchCatalog, CatalogError } from "../server/catalog.mjs";
import { testContext, PW } from "./helpers.mjs";
import { buildApp } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import * as A from "../server/auth/accounts.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/catalog/", import.meta.url));
const built = () => assemble(fixtureRepos(), BOOKS);
const by = (c, name) => c.entries.find(e => e.name === name);

test("selection: by the record's kind first — folders, NPCs and critters are not entries", () => {
  const c = built();
  assert.deepEqual(c.entries.map(e => e.name).sort(), ["Catalog Blade", "Catalog Rifle", "Test Fixer", "Test Medkit", "Test Pistol", "Test Runner", "Test Van", "Zebra Rope"]);
  assert.equal(selected({ _key: "!folders!x", type: "Item" }, "weapons"), null);
  assert.equal(selected({ _key: "!actors!x", type: "npc" }, "critters"), null);
  assert.equal(selected({ _key: "!actors!x", type: "character" }, "contact-npcs"), null);   // a character outside the archetypes pack
});

test("an entry: ids, the compendium uuid, the source the rules read, category from folders or the pack label", () => {
  const c = built(), p = by(c, "Test Pistol");
  assert.equal(p.id, "sr2e.weapons.fixture000000010");
  assert.equal(p.uuid, "Compendium.sr2e.weapons.Item.fixture000000010");
  assert.deepEqual(p._stats, { compendiumSource: p.uuid });
  assert.deepEqual(p.category, ["Firearms", "Test Pistols", "pistol"]);
  assert.deepEqual(by(c, "Zebra Rope").effects, [{ name: "Rope trick", disabled: false, transfer: true, changes: [{ key: "system.body.mod", mode: 2, value: "1" }] }]);
  assert.deepEqual(by(c, "Catalog Rifle").category, ["SSC Weapons"]);          // no folders in that package: the pack's label
  assert.deepEqual([p.cost, p.streetIndex, p.availability], [450, 0.5, "3/24 hrs"]);
  assert.deepEqual(p.flags, { sr2e: { rule: "test-rule", pairedWeapon: "x" } });   // every sr2e flag stays; other packages' flags go
  assert.equal(by(c, "Test Van").uuid, "Compendium.sr2e.vehicles.Actor.fixture000000030");
});

test("package and book are separate; a 'none' citation has no book and no badge, but lists with its package", () => {
  const c = built(), blade = by(c, "Catalog Blade"), fixer = by(c, "Test Fixer"), runner = by(c, "Test Runner");
  assert.deepEqual([blade.package, blade.book, blade.listBook], ["sr2e", "ssc", "ssc"]);
  assert.deepEqual([fixer.book, fixer.citation, fixer.listBook], [null, null, "sr2"]);
  assert.deepEqual([runner.book, runner.citation, runner.listBook], [null, null, "sr2"]);
  assert.deepEqual(c.books.map(b => [b.key, b.count]), [["sr2", 6], ["ssc", 2]]);
  // Two books name the core package (sr2 and vr2): an uncited core entry belongs to the CORE book, not the last one.
  assert.equal(BOOKS.vr2.module, "sr2e");
  assert.equal(fixer.text.description.book, "sr2");
});

test("book wording is moved out of `system`, tagged with its book, and stored as plain text", () => {
  const c = built(), p = by(c, "Test Pistol"), van = by(c, "Test Van");
  assert.equal(p.system.notes, undefined);
  assert.deepEqual(p.text.notes, { book: "sr2", value: "An invented pistol for the tests.\nSecond & last line." });
  assert.deepEqual(Object.keys(van.text).sort(), ["otherFeatures", "seating"]);   // short strings too: classified by field, not length
  assert.equal(by(c, "Catalog Blade").text.notes.book, "ssc");
  assert.equal(by(c, "Test Runner").text.biography.value, "An invented archetype.");
  // …and wording kept in a flag: out of the flags, into `text`.
  const rope = by(c, "Zebra Rope");
  assert.deepEqual(rope.flags, { sr2e: { drug: { key: "test-drug" } } });
  assert.deepEqual(rope.text["flags.drug.notes"], { book: "sr2", value: "A note the system wrote about this invented drug." });
  assert.equal(JSON.stringify(c.entries).includes("<p>"), false);
  assert.equal(plain("<p>a &lt;b&gt; &#65;&nbsp;c</p><script>x</script>"), "a <b> A c\nx");
});

const broken = (fn) => { const r = fixtureRepos(); fn(r); return () => assemble(r, BOOKS); };
const pistol = (r) => r[0].docs[2].doc;

test("every string path is classified; an unknown one fails the build, naming it — no wildcards", () => {
  assert.equal(classify("system.notes").kind, "text");
  assert.equal(classify("system.custom.formulas.partsCost@bike").kind, "formula");
  assert.equal(classify("system.ratingStats[].availability").kind, "short");
  assert.equal(classify("system.category").kind, "category");
  assert.equal(classify("system.newProseField"), null);
  assert.equal(classify("system.effects.bookExcerpt"), null);             // not "any key under effects"
  assert.equal(classify("system.custom.formulas.anything"), null);
  assert.equal(classify("flags.sr2e.note"), null);
  assert.throws(broken(r => { pistol(r).system.flavour = "Some new wording"; }), /system\.flavour is not classified/);
  assert.throws(broken(r => { pistol(r).system.effects = { bookExcerpt: "A paragraph of the book." }; }), /system\.effects\.bookExcerpt is not classified/);
  assert.throws(broken(r => { pistol(r).flags.sr2e.note = "Wording in a flag"; }), /flags\.sr2e\.note is not classified/);
});

test("book wording can't hide in a data path: a category is a key, codes are short, rule data is one line", () => {
  const prose = "A whole paragraph of wording from the book, far longer than any code or key a rule would ever read, placed where data belongs.";
  assert.throws(broken(r => { pistol(r).system.category = "A sentence, not a key"; }), /not a known category/);
  assert.throws(broken(r => { pistol(r).system.category = "quick_brown_fox_jumps_over_lazy_dog"; }), /not a known category/);   // key-shaped is not enough
  assert.throws(broken(r => { pistol(r).system.effects = { acceleration: "The vehicle gains speed when the rigger wills it so" }; }), /reads as a sentence/);
  assert.throws(broken(r => { pistol(r).system.availability = "ask your friendly local fixer"; }), /reads as a sentence/);
  assert.throws(broken(r => { pistol(r).system.effects = { acceleration: "The vehicle gains speed. The rigger gains control." }; }), /reads as a sentence/);   // short sentences, split by punctuation
  assert.throws(broken(r => { pistol(r).system.damageCode = "It is deadly."; }), /reads as a sentence/);
  assert.doesNotThrow(broken(r => { pistol(r).flags.sr2e.vehicleId = "toyota-mk-guyver-search-and-rescue-robot"; }));   // a slug is not a sentence
  assert.doesNotThrow(broken(r => { pistol(r).system.effects = { acceleration: "min(2 x R, B) + 1" }; }));
  assert.throws(broken(r => { pistol(r).system.damageCode = prose; }), /system\.damageCode is \d+ characters/);
  assert.throws(broken(r => { pistol(r).system.availability = "two\nlines"; }), /more than one line/);
  assert.throws(broken(r => { pistol(r).flags.sr2e.rule = prose; }), /flags\.sr2e\.rule is \d+ characters/);
  assert.throws(broken(r => { r[0].docs[5].doc.effects[0].changes[0].value = prose; }), /effect change's value is not rule data/);
  assert.throws(broken(r => { r[0].docs[5].doc.effects[0].changes[0].value = "The bearer gains this power at dawn."; }), /value is not rule data/);
  assert.throws(broken(r => { r[0].docs[5].doc.effects[0].changes[0].note = "wording"; }), /change's note is not rule data/);
  assert.throws(broken(r => { r[0].docs[5].doc.effects[0].name = prose; }), /effect name is too long/);
  // What reaches a search SUMMARY is only names, keys and numbers.
  const c = built();
  for (const e of c.entries) for (const part of e.category) assert.ok(part.length <= 40, part);
});

test("citations: every item has a book and a page; only a contact may cite \"none\"; ids and packages are checked", () => {
  assert.throws(broken(r => { delete pistol(r).system.citation; }), /an item with no citation/);
  assert.throws(broken(r => { pistol(r).system.citation.book = "nope"; }), /cites an unknown book "nope"/);
  assert.throws(broken(r => { pistol(r).system.citation = { book: "none", page: "" }; }), /only the listed contacts may cite book "none"/);
  assert.throws(broken(r => { const c = structuredClone(r[0].docs[6]); c.doc._id = "fixture000000099"; c.doc._key = "!items!fixture000000099"; r[0].docs.push(c); }), /only the listed contacts/);   // ANOTHER contact may not
  for (const page of ["", "banana", "12a", "p.12"]) assert.throws(broken(r => { pistol(r).system.citation.page = page; }), /is not a page/, page);
  for (const page of ["7", "231", "98–100", "12, 14", "12-13,20"]) assert.doesNotThrow(broken(r => { pistol(r).system.citation.page = page; }), page);
  assert.throws(broken(r => { r[0].docs.push(structuredClone(r[0].docs[2])); }), /duplicate catalog id/);
  assert.throws(broken(r => { r[1].id = "sr2e-unknown-module"; }), /no book in the system's BOOKS table/);
});

test("the book table is PARSED, never run: anything but plain entries fails", () => {
  const head = "export const BOOKS = Object.freeze({\n", tail = "\n});\nexport const NO_BOOK = \"none\";\n";
  const core = '  sr2: { abbr: "SR2", title: "Shadowrun, Second Edition", code: "FASA 7901", module: "sr2e" },';
  const ok = parseBooks(`/** doc */\n${head}${core}\n  naw: { abbr: "NAGRL", title: "The Neo-Anarchists' Guide \\"X\\"", code: "FASA 7208", module: "sr2e-neo-anarchists" }${tail}`);
  assert.deepEqual(Object.keys(ok), ["sr2", "naw"]);
  assert.equal(ok.naw.title, 'The Neo-Anarchists\' Guide "X"');
  for (const evil of ['  x: await import("node:fs"),', '  x: { abbr: "A", title: "T", code: "C", module: process.env.HOME },', "  ...require('child_process').execSync('id'),", '  x: { abbr: "A", title: `T${1}`, code: "C", module: "m" },'])
    assert.throws(() => parseBooks(`${head}${core}\n${evil}${tail}`), /not a plain entry/, evil);
  assert.throws(() => parseBooks("export const OTHER = 1;"), /not found/);
  assert.throws(() => parseBooks(`${head}  ssc: { abbr: "SSC", title: "T", code: "C", module: "m" }${tail}`), /no core book/);
  assert.throws(() => parseBooks(`${head}${core}\n${core}${tail}`), /twice/);
});

test("archetypes: embedded items keep their own source uuid, or none; a citation is optional there", () => {
  const runner = by(built(), "Test Runner");
  assert.deepEqual(runner.items.map(i => [i.name, i.uuid, i._stats.compendiumSource, i.citation?.page ?? null, i.embeddedIn]), [
    ["Runner's Pistol", null, "Compendium.sr2e.weapons.Item.fixture000000010", "231", runner.id],
    ["Unsourced Knife", null, null, null, runner.id]]);
  assert.equal(runner.items[0].text.notes.value, "Embedded.");
});

test("the output is deterministic and its manifest carries the checksum", () => {
  const a = mkdtempSync(join(tmpdir(), "cat-")), b = mkdtempSync(join(tmpdir(), "cat-"));
  const ma = writeCatalog(built(), a); writeCatalog(built(), b);
  assert.equal(readFileSync(join(a, "catalog.json"), "utf8"), readFileSync(join(b, "catalog.json"), "utf8"));
  assert.equal(ma.entries, 8);
  assert.match(ma.sha256, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(ma).includes("builtAt"), false);
  assert.deepEqual(readFileSync(join(FIXTURE, "catalog.json"), "utf8"), readFileSync(join(a, "catalog.json"), "utf8"), "the committed fixture is stale: node test/fixtures/make-catalog.mjs");
});

test("loading: refuses a missing, damaged, empty or stale catalog", () => {
  const dir = mkdtempSync(join(tmpdir(), "cat-"));
  assert.throws(() => loadCatalog(dir), CatalogError);
  cpSync(FIXTURE, dir, { recursive: true });
  assert.equal(loadCatalog(dir).size, 8);
  const pins = [{ dir: "sr2e-foundryvtt", tag: "v9.9.9", commit: "a".repeat(40) }, { dir: "sr2e-street-samurai-catalog", tag: "v1.0.0", commit: "b".repeat(40) }];
  assert.equal(loadCatalog(dir, { pins }).size, 8);
  assert.throws(() => loadCatalog(dir, { pins: [{ ...pins[0], commit: "c".repeat(40) }, pins[1]] }), /other pins/);
  assert.throws(() => loadCatalog(dir, { pins: [{ ...pins[0], dir: "some-other-repository" }, pins[1]] }), /other pins/);   // the directory is part of the pin
  assert.throws(() => loadCatalog(dir, { pins: pins.slice(0, 1) }), /other pins/);
  // A manifest edited on its own (the catalog body untouched, its checksum still right) is refused.
  const manifestFile = join(dir, "manifest.json"), honest = readFileSync(manifestFile, "utf8"), m = JSON.parse(honest);
  for (const lie of [{ ...m, books: [] }, { ...m, entries: 9999 }, { ...m, pins: [] }, { ...m, extra: true }]) {
    writeFileSync(manifestFile, JSON.stringify(lie));
    assert.throws(() => loadCatalog(dir), /manifest doesn't describe/);
  }
  writeFileSync(manifestFile, honest);
  assert.equal(loadCatalog(dir).size, 8);
  delete m.sha256;
  assert.deepEqual(manifestOf(built()), m);
  writeFileSync(join(dir, "catalog.json"), readFileSync(join(dir, "catalog.json"), "utf8").replace("Test Pistol", "Best Pistol"));
  assert.throws(() => loadCatalog(dir), /checksum/);
  const empty = mkdtempSync(join(tmpdir(), "cat-"));
  writeCatalog({ ...built(), entries: [] }, empty);
  assert.throws(() => loadCatalog(empty), /empty/);
});

test("search: by book (the list book), type and text; sorted by name; paged", () => {
  const c = loadCatalog(FIXTURE);
  const names = (o) => searchCatalog(c, o).entries.map(e => e.name);
  assert.deepEqual(names({}), ["Catalog Blade", "Catalog Rifle", "Test Fixer", "Test Medkit", "Test Pistol", "Test Runner", "Test Van", "Zebra Rope"]);
  assert.deepEqual(names({ books: ["ssc"] }), ["Catalog Blade", "Catalog Rifle"]);
  assert.deepEqual(names({ books: ["sr2"], types: ["weapon", "gear"] }), ["Test Medkit", "Test Pistol", "Zebra Rope"]);
  assert.deepEqual(names({ q: "PISTOL" }), ["Test Pistol"]);              // the name, case-insensitive
  assert.deepEqual(names({ q: "firearms" }), ["Test Pistol"]);            // …and the category
  assert.deepEqual(names({ q: ".*" }), []);                               // a plain substring, never a pattern
  const page = searchCatalog(c, { offset: 2, limit: 3 });
  assert.deepEqual([page.total, page.entries.length, page.entries[0].name], [8, 3, "Test Fixer"]);
  assert.equal("system" in page.entries[0], false);                       // summaries only
  assert.equal(searchCatalog(c, { limit: 5000 }).entries.length, 8);
});

const ORIGIN = "https://hoi.example";
async function harness(catalog) {
  const t = await testContext();
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog });
  const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret: (await A.bootstrap(t.ctx)).secret, username: "Boss", password: PW } });
  const cookie = res.headers["set-cookie"].split(";")[0];
  return { app, get: (url, signedIn = true) => app.inject({ url, headers: signedIn ? { cookie } : {} }) };
}

test("routes: signed-in only; the manifest, a filtered page, one entry; hostile input is refused", async () => {
  const { app, get } = await harness(loadCatalog(FIXTURE));
  for (const r of app.routeList.filter(r => r.url.startsWith("/api/catalog"))) assert.equal((await get(r.url.replace(":id", "x.y.z"), false)).statusCode, 401, r.url);
  const m = (await get("/api/catalog")).json();
  assert.equal(m.entries, 8); assert.deepEqual(m.books.map(b => b.abbr), ["SR2", "SSC"]);
  assert.equal("commit" in m.pins[0], true);
  const page = (await get("/api/catalog/entries?book=ssc&book=sr2&type=weapon&q=catalog")).json();
  assert.deepEqual(page.entries.map(e => e.name), ["Catalog Blade", "Catalog Rifle"]);
  assert.equal((await get("/api/catalog/entries?limit=2&offset=6")).json().entries.length, 2);
  const one = (await get("/api/catalog/entries/sr2e.weapons.fixture000000010")).json();
  assert.equal(one.text.notes.book, "sr2"); assert.equal(one.system.damageCode, "9M");
  assert.equal((await get("/api/catalog/entries/sr2e.weapons.nope")).statusCode, 404);
  for (const bad of ["/api/catalog/entries?limit=1000", "/api/catalog/entries?book=../etc", "/api/catalog/entries?x=1", `/api/catalog/entries?q=${"a".repeat(65)}`, "/api/catalog/entries/..%2F..%2Fetc%2Fpasswd"])
    assert.equal((await get(bad)).statusCode, 400, bad);
});

test("routes without a loaded catalog say so (503), they don't pretend it is empty", async () => {
  const { get } = await harness(null);
  for (const url of ["/api/catalog", "/api/catalog/entries", "/api/catalog/entries/a.b.c"]) assert.equal((await get(url)).json().code, "no-catalog", url);
});

test("shape() never changes the document it is given", () => {
  const repos = fixtureRepos(), doc = repos[0].docs[2].doc, before = JSON.stringify(doc);
  shape(doc, { package: "sr2e", pack: "weapons", packLabel: "Weapons", books: BOOKS, packageBook: "sr2", folders: new Map() }, []);
  assert.equal(JSON.stringify(doc), before);
});
