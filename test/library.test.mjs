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
async function harness() {
  const t = await testContext();
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false });
  const person = async (username, secret) => {
    const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret, username, password: PW } });
    const cookie = res.headers["set-cookie"].split(";")[0];
    const csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
    const call = (method, url, body, key = randomUUID()) => app.inject({ method, url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, ...(method === "GET" ? {} : { "idempotency-key": key }) }, ...(body !== undefined ? { payload: body } : {}) });
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
    const url = r.url.replace(":id", doc.id).replace(":n", "1");
    const body = r.method === "GET" ? undefined : r.method === "PUT" ? { name: "Mine now", revision: 1 } : { revision: 1 };
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
