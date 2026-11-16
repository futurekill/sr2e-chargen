import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assemble, writeCatalog, plain, classify, selected, shape } from "../tools/build-catalog.mjs";
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
});

test("book wording is moved out of `system`, tagged with its book, and stored as plain text", () => {
  const c = built(), p = by(c, "Test Pistol"), van = by(c, "Test Van");
  assert.equal(p.system.notes, undefined);
  assert.deepEqual(p.text.notes, { book: "sr2", value: "An invented pistol for the tests.\nSecond & last line." });
  assert.deepEqual(Object.keys(van.text).sort(), ["otherFeatures", "seating"]);   // short strings too: classified by field, not length
  assert.equal(by(c, "Catalog Blade").text.notes.book, "ssc");
  assert.equal(by(c, "Test Runner").text.biography.value, "An invented archetype.");
  assert.equal(JSON.stringify(c.entries).includes("<p>"), false);
  assert.equal(plain("<p>a &lt;b&gt; &#65;&nbsp;c</p><script>x</script>"), "a <b> A c\nx");
});

test("a string at a path nobody classified fails the build, naming the path", () => {
  assert.equal(classify("system.notes"), "text");
  assert.equal(classify("system.custom.formulas.partsCost@bike"), "data");
  assert.equal(classify("system.ratingStats[].availability"), "data");
  assert.equal(classify("system.newProseField"), null);
  const repos = fixtureRepos();
  repos[0].docs[2].doc.system.flavour = "Some new wording";
  assert.throws(() => assemble(repos, BOOKS), /system\.flavour is not classified/);
});

test("the build refuses an item without a citation, an unknown book, a duplicate id and an unknown package", () => {
  const broken = (fn) => { const r = fixtureRepos(); fn(r); return () => assemble(r, BOOKS); };
  assert.throws(broken(r => { delete r[0].docs[2].doc.system.citation; }), /an item with no citation/);
  assert.throws(broken(r => { r[0].docs[2].doc.system.citation.book = "nope"; }), /cites an unknown book "nope"/);
  assert.throws(broken(r => { r[0].docs.push(structuredClone(r[0].docs[2])); }), /duplicate catalog id/);
  assert.throws(broken(r => { r[1].id = "sr2e-unknown-module"; }), /no book in the system's BOOKS table/);
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
  assert.throws(() => loadCatalog(dir, { pins: pins.slice(0, 1) }), /other pins/);
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
