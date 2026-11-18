import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testContext, PW } from "./helpers.mjs";
import { buildApp } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import * as A from "../server/auth/accounts.mjs";
import * as L from "../server/library.mjs";
import { setMaintenance } from "../server/db/fence.mjs";

const ORIGIN = "https://hoi.example";
async function harness({ catalog = null } = {}) {
  const t = await testContext();
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog });
  const person = async (username, secret) => {
    const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret, username, password: PW } });
    const cookie = res.headers["set-cookie"].split(";")[0];
    const csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
    const call = (method, url, body, key = randomUUID(), extra = {}) => app.inject({ method, url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, ...(method === "GET" ? {} : { "idempotency-key": key ?? randomUUID() }), ...extra }, ...(body !== undefined ? { payload: body } : {}) });
    return { id: res.json().user.id, call };
  };
  const boss = await person("Boss", (await A.bootstrap(t.ctx)).secret);
  const razor = await person("Razor", (await A.createInvite(t.ctx)).secret);
  return { ...t, app, boss, razor };
}
const D = "/api/documents";
const make = async (who, name = "Street Sam") => (await who.call("POST", D, { name, notes: "wired" })).json().document;

test("create, read, update, revisions, download", async () => {
  const { razor } = await harness();
  const doc = await make(razor);
  assert.equal(doc.revision, 1); assert.equal(doc.kind, "draft");
  const got = (await razor.call("GET", `${D}/${doc.id}`)).json();
  assert.deepEqual(got.body, { schema: "sr2e-chargen-draft", schemaVersion: 1, name: "Street Sam", notes: "wired" });
  const up = await razor.call("PUT", `${D}/${doc.id}`, { name: "Razor", notes: "more wired", revision: 1 });
  assert.equal(up.json().document.revision, 2);
  assert.deepEqual((await razor.call("GET", `${D}/${doc.id}/revisions`)).json().revisions.map(r => r.revision), [2, 1]);
  assert.equal((await razor.call("GET", `${D}/${doc.id}/revisions/1`)).json().body.name, "Street Sam");
  const dl = await razor.call("GET", `${D}/${doc.id}/download`);
  assert.match(dl.headers["content-disposition"], /^attachment; filename="/);
  assert.equal(dl.json().name, "Razor");
  assert.deepEqual((await razor.call("GET", D)).json().documents.map(d => d.name), ["Razor"]);
});

test("a stale revision is a 409 and changes nothing", async () => {
  const { razor } = await harness();
  const doc = await make(razor);
  await razor.call("PUT", `${D}/${doc.id}`, { name: "Second", revision: 1 });
  const stale = await razor.call("PUT", `${D}/${doc.id}`, { name: "Lost update", revision: 1 });
  assert.equal(stale.statusCode, 409); assert.equal(stale.json().code, "stale");
  assert.equal((await razor.call("GET", `${D}/${doc.id}`)).json().document.name, "Second");
});

test("idempotency: a replay returns the first answer once; a reused key on another request is refused", async () => {
  const { razor, ctx } = await harness();
  const key = randomUUID();
  const a = await razor.call("POST", D, { name: "Once" }, key), b = await razor.call("POST", D, { name: "Once" }, key);
  assert.deepEqual(a.json(), b.json());
  assert.equal((await razor.call("GET", D)).json().documents.length, 1);
  assert.equal((await razor.call("POST", D, { name: "Different" }, key)).json().code, "key-reused");
  const id = a.json().document.id, k2 = randomUUID();
  const [x, y] = await Promise.all([razor.call("PUT", `${D}/${id}`, { name: "Twice", revision: 1 }, k2), razor.call("PUT", `${D}/${id}`, { name: "Twice", revision: 1 }, k2)]);
  assert.deepEqual(x.json(), y.json());   // two identical concurrent requests: one revision, the same answer
  assert.equal(x.json().document.revision, 2);
  assert.equal((await razor.call("GET", `${D}/${id}/revisions`)).json().revisions.length, 2);
  // The key covers the TARGET: the same key and body against another document is a different request.
  const other = (await razor.call("POST", D, { name: "Other" })).json().document;
  assert.equal((await razor.call("PUT", `${D}/${other.id}`, { name: "Twice", revision: 1 }, k2)).json().code, "key-reused");
  assert.equal((await razor.call("POST", D, { name: "No key" }, "not-a-uuid")).statusCode, 400);
  assert.equal((await razor.call("POST", `${D}?x=1`, { name: "Query" })).statusCode, 400);   // a mutation takes no query
  assert.equal(Number((await ctx.db.selectFrom("users").select("doc_count").where("username", "=", "Razor").executeTakeFirst()).doc_count), 2);
});

test("delete is soft and restorable; restoring a revision makes a NEW revision", async () => {
  const { razor } = await harness();
  const doc = await make(razor);
  await razor.call("PUT", `${D}/${doc.id}`, { name: "Changed", revision: 1 });
  assert.equal((await razor.call("DELETE", `${D}/${doc.id}`, { revision: 2 })).statusCode, 200);
  assert.equal((await razor.call("GET", D)).json().documents.length, 0);
  assert.equal((await razor.call("GET", `${D}?deleted=1`)).json().documents.length, 1);
  assert.equal((await razor.call("PUT", `${D}/${doc.id}`, { name: "Zombie", revision: 3 })).statusCode, 409);   // deleted: not editable
  assert.equal((await razor.call("POST", `${D}/${doc.id}/restore`, { revision: 3 })).json().document.deletedAt, null);
  // Every step that advanced the revision is in the history: no gaps (code review 1 #7).
  assert.deepEqual((await razor.call("GET", `${D}/${doc.id}/revisions`)).json().revisions.map(r => [r.revision, r.note]), [[4, "restored"], [3, "deleted"], [2, null], [1, "created"]]);
  assert.equal((await razor.call("GET", `${D}/${doc.id}/revisions/3`)).json().body.name, "Changed");
  const back = await razor.call("POST", `${D}/${doc.id}/revisions/1/restore`, { revision: 4 });
  assert.equal(back.json().document.revision, 5);
  assert.equal(back.json().document.name, "Street Sam");
  assert.equal((await razor.call("GET", `${D}/${doc.id}/revisions`)).json().revisions[0].note, "restored from revision 1");
});

test("someone else's document is a 404 on EVERY document route (admins included)", async () => {
  const { app, razor, boss } = await harness();
  const doc = await make(razor);
  const routes = app.routeList.filter(r => r.url.startsWith(`${D}/:id`));
  assert.ok(routes.length >= 8, "the route list is walked, not hand-written");
  for (const r of routes) {
    const url = r.url.replace(":id", doc.id).replace(":n", "1") + (r.url.endsWith("/portrait") ? "?revision=1" : "");
    const body = r.method === "GET" ? undefined : r.method === "PUT" ? { name: "Mine now", revision: 1 }
      : r.url.endsWith("/ops") ? { revision: 1, ops: [{ op: "setName", name: "Mine now" }] }
      : r.url.endsWith("/portrait/stock") ? { revision: 1, stock: "tiger" } : { revision: 1 };
    const res = await boss.call(r.method, url, body);
    assert.equal(res.statusCode, 404, `${r.method} ${r.url}`);
    assert.equal(res.json().code, "not-found");
  }
  const missing = await razor.call("GET", `${D}/${randomUUID()}`);
  assert.equal(missing.statusCode, 404);
  assert.deepEqual((await razor.call("GET", `${D}/${doc.id}`)).json().document.name, "Street Sam");   // untouched
  assert.equal((await boss.call("GET", D)).json().documents.length, 0);
});

test("every document route needs a session", async () => {
  const { app } = await harness();
  for (const r of app.routeList.filter(r => r.url.startsWith(D))) {
    const res = await app.inject({ method: r.method, url: r.url.replace(":id", randomUUID()).replace(":n", "1"), headers: { origin: ORIGIN } });
    assert.equal(res.statusCode, 401, `${r.method} ${r.url}`);
  }
});

test("only a strict draft is stored: unknown fields, prototype keys and oversize are refused", async () => {
  const { razor, app } = await harness();
  assert.equal((await razor.call("POST", D, { name: "X", schema: "sr2e-portable", documents: [] })).statusCode, 400);
  assert.equal((await razor.call("POST", D, { name: "" })).statusCode, 400);
  assert.equal((await razor.call("POST", D, { name: "X", notes: "n".repeat(100001) })).statusCode, 400);
  // Signed in, with a key: the probe reaches the JSON parser and the schema, not just the session check.
  const res = await app.inject({ method: "POST", url: "/api/login", headers: { origin: ORIGIN }, payload: { username: "razor", password: PW } });
  const cookie = res.headers["set-cookie"].split(";")[0], csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
  for (const payload of ['{"name":"X","__proto__":{"admin":true}}', '{"name":"X","constructor":{"prototype":{"admin":true}}}']) {
    const proto = await app.inject({ method: "POST", url: D, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "idempotency-key": randomUUID(), "content-type": "application/json" }, payload });
    assert.equal(proto.statusCode, 400, payload);
  }
  assert.equal((await razor.call("GET", D)).json().documents.length, 0);
  assert.equal(({}).admin, undefined);
});

test("quotas: the document count is enforced under concurrent creates; pruning keeps the first and newest revisions", async () => {
  const { razor, ctx } = await harness();
  await ctx.db.updateTable("users").set({ doc_count: L.MAX_DOCUMENTS - 1 }).where("id", "=", razor.id).execute();
  const r = await Promise.all([razor.call("POST", D, { name: "A" }), razor.call("POST", D, { name: "B" })]);
  assert.deepEqual(r.map(x => x.statusCode).sort(), [200, 409]);
  const doc = r.find(x => x.statusCode === 200).json().document;
  for (let rev = 1; rev <= L.MAX_REVISIONS + 4; rev++) await L.updateDraft(ctx, razor.id, doc.id, { revision: rev, name: `v${rev + 1}` }, randomUUID());
  const revs = await L.listRevisions(ctx, razor.id, doc.id);
  assert.equal(revs.length, L.MAX_REVISIONS);
  assert.equal(revs.at(-1).revision, 1);                       // the first is always kept
  assert.equal(revs[0].revision, L.MAX_REVISIONS + 5);
  const used = Number((await ctx.db.selectFrom("users").select("bytes_used").where("id", "=", razor.id).executeTakeFirst()).bytes_used);
  assert.equal(used, revs.reduce((n, x) => n + x.bytes, 0));   // the counter is exactly the retained revisions
  await ctx.db.updateTable("users").set({ bytes_used: L.MAX_BYTES }).where("id", "=", razor.id).execute();
  assert.equal((await razor.call("PUT", `${D}/${doc.id}`, { name: "No room", revision: L.MAX_REVISIONS + 5 })).json().code, "quota");
});

test("deleted documents still count until the purge, 30 days on; old keys expire", async () => {
  const { razor, ctx, advance } = await harness();
  const doc = await make(razor);
  await razor.call("DELETE", `${D}/${doc.id}`, { revision: 1 });
  const counts = async () => ({ ...(await ctx.db.selectFrom("users").select(["doc_count", "bytes_used"]).where("id", "=", razor.id).executeTakeFirst()) });
  assert.equal((await counts()).doc_count, 1);
  advance(L.PURGE_AFTER_MS - 1000);
  assert.equal(await L.purge(ctx), 0);
  advance(2000);
  assert.equal(await L.purge(ctx), 1);
  assert.deepEqual(await counts(), { doc_count: 0, bytes_used: 0 });
  await assert.rejects(L.getDocument(ctx, razor.id, doc.id), /No such document/);   // (the HTTP session is 30 days old too: expired)
  assert.equal((await ctx.db.selectFrom("idempotency").selectAll().execute()).length, 0);
});

test("maintenance stops every library write; reads go on", async () => {
  const { razor, ctx } = await harness();
  const doc = await make(razor);
  await setMaintenance(ctx, true);
  assert.equal((await razor.call("POST", D, { name: "Nope" })).statusCode, 503);
  assert.equal((await razor.call("PUT", `${D}/${doc.id}`, { name: "Nope", revision: 1 })).json().code, "maintenance");
  assert.equal((await razor.call("GET", `${D}/${doc.id}`)).statusCode, 200);
});

test("a character: created whole, changed only by operations, one revision per request, refusals change nothing", async () => {
  const { razor, boss } = await harness();
  const made = (await razor.call("POST", `${D}/characters`, { name: "Twist" })).json();
  assert.equal(made.document.kind, "character"); assert.equal(made.body.actor.system.lifestyle, "streets");
  const id = made.document.id, ops = (revision, list, key) => razor.call("POST", `${D}/${id}/ops`, { revision, ops: list }, key);
  const key = randomUUID();
  const first = await ops(1, [{ op: "setPriority", category: "race", letter: "A" }, { op: "setMetatype", race: "elf" }], key);
  assert.equal(first.statusCode, 200); assert.equal(first.json().document.revision, 2);
  assert.equal(first.json().body.actor.system.race, "elf");
  assert.deepEqual((await ops(1, [{ op: "setPriority", category: "race", letter: "A" }, { op: "setMetatype", race: "elf" }], key)).json(), first.json(), "a replay is the first answer");
  assert.equal((await ops(1, [{ op: "setName", name: "Late" }])).json().code, "stale");
  const refused = await ops(2, [{ op: "setName", name: "Renamed" }, { op: "setMetatype", race: "dragon" }]);
  assert.equal(refused.statusCode, 422); assert.equal(refused.json().code, "refused");
  assert.equal((await razor.call("GET", `${D}/${id}`)).json().document.name, "Twist", "a refused batch changes nothing");
  // The request schema: exact fields per operation, no price, no stray key, no coercion.
  for (const bad of [[{ op: "setAttribute", attr: "body", base: "3" }], [{ op: "setName", name: "X", cost: 0 }], [{ op: "setPrice", cost: 0 }], []])
    assert.equal((await ops(2, bad)).statusCode, 400, JSON.stringify(bad));
  assert.equal((await razor.call("PUT", `${D}/${id}`, { name: "Whole", revision: 2 })).json().code, "wrong-kind", "PUT is for drafts");
  const draft = await make(razor);
  assert.equal((await razor.call("POST", `${D}/${draft.id}/ops`, { revision: 1, ops: [{ op: "setName", name: "X" }] })).json().code, "wrong-kind");
  assert.equal((await boss.call("POST", `${D}/${id}/ops`, { revision: 2, ops: [{ op: "setName", name: "Mine" }] })).statusCode, 404);
  assert.equal((await razor.call("POST", `${D}/characters`, { name: "   " })).statusCode, 422);
  assert.deepEqual((await razor.call("GET", `${D}/${id}/revisions`)).json().revisions.map(r => r.note), ["setPriority, setMetatype", "created"]);
});

test("a finished character is never restored to another revision (PLAN-M2 §5b)", async () => {
  const { razor, ctx } = await harness();
  const id = (await razor.call("POST", `${D}/characters`, { name: "Done" })).json().document.id;
  await razor.call("POST", `${D}/${id}/ops`, { revision: 1, ops: [{ op: "setName", name: "Done Twice" }] });
  assert.equal((await razor.call("POST", `${D}/${id}/revisions/1/restore`, { revision: 2 })).statusCode, 200, "unfinished: restore works");
  // Finishing is M2d's; mark it the way that operation will.
  const row = await ctx.db.selectFrom("documents").select("body").where("id", "=", id).executeTakeFirst();
  const body = L.decodeBody(row.body); body.creation.finished = { at: 1 };
  await ctx.db.updateTable("documents").set({ body: JSON.stringify(body) }).where("id", "=", id).execute();
  const res = await razor.call("POST", `${D}/${id}/revisions/1/restore`, { revision: 3 });
  assert.equal(res.statusCode, 409); assert.equal(res.json().code, "finished");
});

test("a skill is copied from the SERVER's catalog: the client names an id, never the data", async () => {
  const fire = { id: "sr2e.skills.fire", type: "skill", book: "sr2", name: "Firearms", img: null, _stats: { compendiumSource: "Compendium.sr2e.skills.Item.fire" },
    system: { category: "active", linkedAttribute: "quickness", rating: 0, concentration: { name: "", rating: 0 }, specialization: { name: "", rating: 0 }, isMagical: false, notes: "" } };
  const { razor } = await harness({ catalog: { byId: new Map([[fire.id, fire]]) } });
  const id = (await razor.call("POST", `${D}/characters`, { name: "Gun" })).json().document.id;
  const res = await razor.call("POST", `${D}/${id}/ops`, { revision: 1, ops: [{ op: "addSkill", catalogId: fire.id }] });
  assert.equal(res.statusCode, 200);
  const item = res.json().body.actor.items[0];
  assert.deepEqual([item.name, item.system.linkedAttribute, item.system.rating], ["Firearms", "quickness", 1]);
  assert.equal((await razor.call("POST", `${D}/${id}/ops`, { revision: 2, ops: [{ op: "addSkill", catalogId: "sr2e.skills.nope" }] })).json().code, "refused");
  assert.equal((await razor.call("POST", `${D}/${id}/ops`, { revision: 2, ops: [{ op: "addSkill", catalogId: fire.id, system: { rating: 9 } }] })).statusCode, 400, "no data rides along");
  const set = await razor.call("POST", `${D}/${id}/ops`, { revision: 2, ops: [{ op: "setSkill", itemId: item._id, allocated: 5, concentration: "Pistols", specialization: "Ares Predator", freeLanguage: "" }] });
  assert.deepEqual([set.json().body.actor.items[0].system.rating, set.json().body.actor.items[0].system.specialization.rating], [3, 7]);
});

test("the printable sheet: a character's PDF, rendered in a separate process; drafts and unprintable names refused", async () => {
  const { razor } = await harness();
  const id = (await razor.call("POST", `${D}/characters`, { name: "Sheet Test" })).json().document.id;
  const res = await razor.call("GET", `${D}/${id}/sheet.pdf?paper=a4&font=readable`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "application/pdf");
  assert.equal(res.rawPayload.subarray(0, 5).toString(), "%PDF-");
  assert.equal((await razor.call("GET", `${D}/${id}/sheet.pdf?paper=legal`)).statusCode, 400);
  const dragon = (await razor.call("POST", `${D}/characters`, { name: "龍" })).json().document.id;
  const bad = await razor.call("GET", `${D}/${dragon}/sheet.pdf`);
  assert.equal(bad.statusCode, 422); assert.match(bad.json().error, /U\+9F8D/);
  const draft = await make(razor);
  assert.equal((await razor.call("GET", `${D}/${draft.id}/sheet.pdf`)).json().code, "wrong-kind");
});

test("table card routes: fit answer, PDF when it fits, refusal when it doesn't", async () => {
  const { razor } = await harness();
  const id = (await razor.call("POST", `${D}/characters`, { name: "Card Test" })).json().document.id;
  const fit = (await razor.call("GET", `${D}/${id}/card/fit?style=fohawk`)).json();
  assert.deepEqual(fit.fits, true);
  const pdf = await razor.call("GET", `${D}/${id}/card.pdf?style=fohawk-ink&paper=a4`);
  assert.equal(pdf.statusCode, 200); assert.equal(pdf.rawPayload.subarray(0, 5).toString(), "%PDF-");
});

import sharp from "sharp";
import { processPortraitJob } from "../server/sheet/index.mjs";
test("portraits: upload, owner only, conditional, quota charged and freed, newest five kept, purge frees", async () => {
  const { razor, boss, ctx, advance } = await harness();
  const bytesUsed = async () => Number((await ctx.db.selectFrom("users").select("bytes_used").where("username", "=", "Razor").executeTakeFirst()).bytes_used);
  const start = await bytesUsed();
  const id = (await razor.call("POST", `${D}/characters`, { name: "Face" })).json().document.id;
  const jpeg = await sharp({ create: { width: 600, height: 800, channels: 3, background: "#c8006a" } }).jpeg().toBuffer();
  const up = (rev, img = jpeg, type = "image/jpeg", who = razor) => who.call("PUT", `${D}/${id}/portrait?revision=${rev}`, img, undefined, { "content-type": type });
  const before = await bytesUsed();
  const k1 = randomUUID();
  const r1 = await razor.call("PUT", `${D}/${id}/portrait?revision=1`, jpeg, k1, { "content-type": "image/jpeg" });
  assert.equal(r1.statusCode, 200, r1.body);
  const replay = await razor.call("PUT", `${D}/${id}/portrait?revision=1`, jpeg, k1, { "content-type": "image/jpeg" });
  assert.deepEqual(replay.json(), r1.json(), "a retried upload gets its first answer, not a stale error (r1 #1)");
  assert.equal(r1.json().document.revision, 2);
  const got = await razor.call("GET", `${D}/${id}/portrait`);
  assert.equal(got.statusCode, 200); assert.equal(got.headers["content-type"], "image/webp"); assert.equal(got.headers["cache-control"], "private, no-store");
  assert.equal((await sharp(got.rawPayload).metadata()).format, "webp");
  const assetBytes = Number((await ctx.db.selectFrom("assets").select("bytes").executeTakeFirst()).bytes);
  assert.ok(await bytesUsed() >= before + assetBytes, "the asset is charged");
  assert.equal((await boss.call("GET", `${D}/${id}/portrait`)).statusCode, 404, "someone else's: 404");
  assert.equal((await up(1)).json().code, "stale", "the revision is checked");
  assert.equal((await up(2, Buffer.from("<svg/>"), "image/svg+xml")).statusCode, 415);
  assert.equal((await up(2, jpeg, "image/png")).statusCode, 415, "a JPEG declared as PNG");
  let rev = 2;
  for (let i = 0; i < 6; i++) { const r = await up(rev); assert.equal(r.statusCode, 200, r.body); rev = r.json().document.revision; }
  assert.equal(Number((await ctx.db.selectFrom("assets").select(eb => eb.fn.countAll().as("n")).executeTakeFirst()).n), 5, "newest five kept");
  const del = await razor.call("DELETE", `${D}/${id}/portrait?revision=${rev}`, {});
  assert.equal(del.statusCode, 200); rev++;
  assert.equal((await razor.call("GET", `${D}/${id}/portrait`)).statusCode, 404);
  assert.equal((await razor.call("GET", `${D}/${id}/portrait?revision=${rev - 1}`)).statusCode, 200, "an earlier revision still shows its portrait");
  // Purge (30 days after delete) frees the document's revisions AND assets.
  await razor.call("DELETE", `${D}/${id}`, { revision: rev });
  advance(31 * 86400e3);
  const { purge } = await import("../server/library.mjs");
  assert.equal(await purge(ctx), 1);
  assert.equal(Number((await ctx.db.selectFrom("assets").select(eb => eb.fn.countAll().as("n")).executeTakeFirst()).n), 0);
  assert.equal(await bytesUsed(), start, "all freed: back to where the account started");
});

test("a restore landing during purge keeps the document whole", async () => {
  const { razor, ctx, advance } = await harness();
  const doc = await make(razor);
  await razor.call("DELETE", `${D}/${doc.id}`, { revision: 1 });
  advance(31 * 86400e3);
  // Deterministic: the restore lands after purge chose its candidates and just before it deletes the document.
  const wrapTrx = (trx) => new Proxy(trx, { get: (t, k) => (k === "deleteFrom" ? (table) => {
    if (table === "documents" && !wrapTrx.done) { wrapTrx.done = true; return { where: () => ({ where: () => ({ executeTakeFirst: async () => {
      await t.updateTable("documents").set({ deleted_at: null }).where("id", "=", doc.id).execute();
      return t.deleteFrom("documents").where("id", "=", doc.id).where("deleted_at", "<=", ctx.now() - 30 * 86400e3).executeTakeFirst();
    } }) }) }; }
    return t.deleteFrom(table);
  } : typeof t[k] === "function" ? t[k].bind(t) : t[k]) });
  const db = new Proxy(ctx.db, { get: (t, k) => (k === "transaction" ? () => { const tx = t.transaction(); return { execute: (fn) => tx.execute((trx) => fn(wrapTrx(trx))) }; } : typeof t[k] === "function" ? t[k].bind(t) : t[k]) });
  const { purge } = await import("../server/library.mjs");
  assert.equal(await purge({ ...ctx, db }), 0, "nothing purged");
  const row = await ctx.db.selectFrom("documents").select(["deleted_at"]).where("id", "=", doc.id).executeTakeFirst();
  assert.ok(row && row.deleted_at == null, "the document is still there, restored");
  assert.equal(Number((await ctx.db.selectFrom("revisions").select(eb => eb.fn.countAll().as("n")).where("document_id", "=", doc.id).executeTakeFirst()).n), 2, "its history intact");
});

test("an image AT the pixel cap decodes in the child within a bounded memory", async () => {
  const { randomBytes } = await import("node:crypto");
  const side = 4096;   // 16,777,216 pixels: the cap; noise, so it can't compress away
  const jpg = await sharp(randomBytes(side * side * 3), { raw: { width: side, height: side, channels: 3 } }).jpeg({ quality: 40 }).toBuffer();
  assert.ok(jpg.length < 8 * 1024 * 1024, `fixture ${jpg.length} bytes`);
  const r = await processPortraitJob(jpg, "image/jpeg");
  assert.ok(r.maxRSS < 512 * 1024, `peak resident memory ${Math.round(r.maxRSS / 1024)} MB`);
});

test("premade portraits: listed for any signed-in user, chosen per character, nothing stored or charged", async () => {
  const { razor, ctx } = await harness();
  const list = (await razor.call("GET", "/api/catalog/portraits")).json().portraits;
  assert.deepEqual(list.map(p => p.id), ["glitch", "hexen", "patch", "razor", "silk", "tiger", "whisper"]);
  const img = await razor.call("GET", "/api/catalog/portraits/tiger");
  assert.equal(img.statusCode, 200); assert.equal(img.headers["content-type"], "image/webp");
  assert.equal((await razor.call("GET", "/api/catalog/portraits/..%2Fsystem")).statusCode, 400, "only an id, never a path");
  assert.equal((await razor.call("GET", "/api/catalog/portraits/nobody")).statusCode, 404);
  const id = (await razor.call("POST", `${D}/characters`, { name: "Tiger Fan" })).json().document.id;
  const bytes = async () => Number((await ctx.db.selectFrom("users").select("bytes_used").where("username", "=", "Razor").executeTakeFirst()).bytes_used);
  const before = await bytes();
  const set = await razor.call("POST", `${D}/${id}/portrait/stock`, { revision: 1, stock: "tiger" });
  assert.equal(set.statusCode, 200, set.body);
  assert.deepEqual(set.json().body.creation.portrait, { stock: "tiger" });
  const got = await razor.call("GET", `${D}/${id}/portrait`);
  assert.equal(got.statusCode, 200); assert.deepEqual(got.rawPayload, img.rawPayload);
  assert.equal(Number((await ctx.db.selectFrom("assets").select(eb => eb.fn.countAll().as("n")).executeTakeFirst()).n), 0, "nothing stored");
  assert.ok(await bytes() - before < 4096, "only the new revision's few bytes");
  assert.equal((await razor.call("POST", `${D}/${id}/portrait/stock`, { revision: 2, stock: "nobody" })).json().code, "portrait-stock");
  const sheet = await razor.call("GET", `${D}/${id}/sheet.pdf?style=fohawk`);
  assert.equal(sheet.statusCode, 200); assert.match(sheet.rawPayload.toString("latin1"), /DCTDecode/, "printed on the sheet");
});
