/** M5a (docs/PLAN-M5a.md): sourcebook toggles — what a character may buy from the books turned on. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp, undoable, booksOf } from "../shared/creation.mjs";
import { offerReason, BOOK_TYPES, bookOf } from "../shared/purchase.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const BOOKS = catalog.books.map(b => b.key), SOURCEBOOKS = BOOKS.filter(k => k !== "sr2");
const op = (b, o) => applyOp(b, o, lookup, { now: 5, catalogBooks: BOOKS });
const find = (book, type, name) => { const e = catalog.entries.find(x => x.book === book && x.type === type && (!name || name.test(x.name))); assert.ok(e, `${book} ${type} ${name}`); return e; };
function finished(b = newCharacter("Shopper")) {
  b.creation.finished = { at: 1, leftover: 0, roll: 10, nuyen: 100000, karmaPool: 1 };
  b.actor.system.chargen.inProgress = false;
  b.actor.system.nuyen = 100000;
  return b;
}

test("setBooks: catalog sourcebooks only (never core, no repeats), sorted; old bodies have none", () => {
  assert.deepEqual(newCharacter("New").creation.options.books, []);
  const b = newCharacter("Reader");
  delete b.creation.options.books;
  assert.deepEqual(booksOf(b), []);
  assert.deepEqual(booksOf(op(b, { op: "setBooks", books: ["ssc", "grim"] })), ["grim", "ssc"]);
  assert.throws(() => op(b, { op: "setBooks", books: ["sr2"] }), /isn't a sourcebook/);
  assert.throws(() => op(b, { op: "setBooks", books: ["nope"] }), /isn't a sourcebook/);
  assert.throws(() => op(b, { op: "setBooks", books: ["ssc", "ssc"] }), /different sourcebooks/);
});

test("a Grimoire spell needs the Grimoire turned on; a book in use can't be turned off until its things are gone", () => {
  const spell = find("grim", "spell");
  let b = newCharacter("Mage");
  assert.throws(() => op(b, { op: "addItem", catalogId: spell.id }), /sourcebook isn't turned on/);
  b = op(op(b, { op: "setBooks", books: ["grim"] }), { op: "addItem", catalogId: spell.id });
  assert.ok(b.actor.items.some(i => i.name === spell.name));
  assert.throws(() => op(b, { op: "setBooks", books: [] }), /comes from grim/);
  const id = Object.keys(b.creation.items).find(k => b.creation.items[k].catalogId === spell.id);
  b = op(op(b, { op: "removeItem", itemId: id }), { op: "setBooks", books: [] });
  assert.deepEqual(booksOf(b), []);
});

test("in play: books can be turned on after finishing without rebuilding; a sale of a book item can't be undone once its book is off", () => {
  const gun = find("ssc", "weapon");
  let b = op(finished(), { op: "setBooks", books: ["ssc"] });
  b = op(b, { op: "buyItem", catalogId: gun.id, choices: {}, price: 100 });
  const item = b.actor.items.find(i => i.name === gun.name);
  b = op(b, { op: "sellItem", itemId: item._id, shownMode: "refund", quoted: 100 });
  b = op(b, { op: "setBooks", books: [] });
  assert.throws(() => op(b, { op: "undo", entryId: undoable(b).id }), /sourcebook is turned off/);
  b = op(b, { op: "setBooks", books: ["ssc"] });
  assert.ok(op(b, { op: "undo", entryId: undoable(b).id }).actor.items.some(i => i.name === gun.name));
  // Code review r1 #1: a creation-bought book item, sold after finishing, no longer holds its book.
  let c = op(op(newCharacter("Seller"), { op: "setBooks", books: ["ssc"] }), { op: "addItem", catalogId: gun.id });
  c = finished(c);
  c.actor.items = c.actor.items.filter(i => i.name !== gun.name);
  assert.deepEqual(booksOf(op(c, { op: "setBooks", books: [] })), []);
});

test("Draft 3: a maglock authored above Rating 6 is refused at creation and bought at its own rating in play", () => {
  const lock = find("csh", "gear", /Type IV/);
  let b = op(newCharacter("Sec"), { op: "setBooks", books: ["csh"] });
  assert.throws(() => op(b, { op: "addItem", catalogId: lock.id }), /Rated above 6/);
  b = op(finished(b), { op: "buyItem", catalogId: lock.id, choices: {}, price: 2500 });
  assert.equal(b.actor.items.find(i => i.name === lock.name).system.rating, 10);
  // A fixed rating above 6 is bought and reported by the rules check, core or not (as M2c); a rated choice is refused.
  assert.equal(offerReason(find("sr2", "gear", /Deluxe Improved Gyro/), []), null);
  for (const e of catalog.entries.filter(x => x.book !== "sr2" && x.type === "gear" && Number(x.system.rating) > 6 && x.system.costPerRating > 0))
    assert.match(offerReason(e, SOURCEBOOKS) ?? "", /Rated above 6|special rules|Drugs/, e.name);
});

test("every sourcebook entry: offered only as plain data — and then it can really be added at creation", () => {
  const all = op(newCharacter("Everything"), { op: "setBooks", books: SOURCEBOOKS });
  let offered = 0;
  for (const e of catalog.entries.filter(x => bookOf(x) !== "sr2")) {
    const why = offerReason(e, SOURCEBOOKS);
    if (why) continue;
    offered++;
    assert.ok(BOOK_TYPES.includes(e.type) || ["quality", "bioware", "cyberware"].includes(e.type), `${e.name}: ${e.type}`);   // qualities: M5d; bioware: M5e; cyberware: M5f
    if (!["quality", "bioware", "cyberware"].includes(e.type)) assert.ok(!e.effects?.length && !e.flags?.sr2e?.rule && !e.flags?.sr2e?.drug && e.system.category !== "skillsoft", e.name);
    assert.doesNotThrow(() => op(all, { op: "addItem", catalogId: e.id }), e.name);
  }
  assert.ok(offered > 300, `${offered} offered`);
  assert.match(offerReason(find("st", "gear", /Kamikaze/), SOURCEBOOKS), /special rules|Drugs/);
  assert.match(offerReason(catalog.entries.find(x => x.book === "ct" && x.type === "cyberware" && x.name === "Cyberarm Cyberdeck"), SOURCEBOOKS) ?? "", /own rules/);   // PLAN-M5j
});

test("server: the books field is bounded; the catalog search lists only what the books offer", async () => {
  const { testContext, PW } = await import("./helpers.mjs");
  const { buildApp } = await import("../server/app.mjs");
  const { loadConfig } = await import("../server/config.mjs");
  const { searchCatalog } = await import("../server/catalog.mjs");
  const A = await import("../server/auth/accounts.mjs");
  const { randomUUID } = await import("node:crypto");
  const t = await testContext(), ORIGIN = "https://hoi.example";
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog: { byId, manifest: { books: catalog.books } } });
  const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret: (await A.bootstrap(t.ctx)).secret, username: "Boss", password: PW } });
  const cookie = res.headers["set-cookie"].split(";")[0], csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
  const call = (url, body) => app.inject({ method: "POST", url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "idempotency-key": randomUUID() }, payload: body });
  const id = (await call("/api/documents/characters", { name: "Reader" })).json().document.id;
  assert.equal((await call(`/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "setBooks", books: Array.from({ length: 21 }, (_, i) => `b${i}`) }] })).statusCode, 400);
  assert.deepEqual((await call(`/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "setBooks", books: ["grim"] }] })).json().body.creation.options.books, ["grim"]);
  await app.close();
  const index = catalog.entries.map(e => ({ e, hay: e.name.toLowerCase() }));
  const hits = (books) => searchCatalog({ index }, { books, types: ["spell"], offerable: "creation", limit: 100 }).total;
  assert.ok(hits(["sr2", "grim"]) > hits(["sr2"]));
  assert.equal(searchCatalog({ index }, { books: ["sr2", "st"], types: ["gear"], q: "kamikaze", offerable: "creation" }).total, 0);
  // r1 #3: the search agrees with addSkill (core skills) and addVehicle (core, priced).
  assert.ok(searchCatalog({ index }, { books: ["sr2"], types: ["skill"], q: "firearms", offerable: "creation" }).total > 0);
  assert.ok(searchCatalog({ index }, { books: ["sr2"], types: ["vehicle"], offerable: "creation", limit: 100 }).entries.every(e => e.cost > 0));
});
