/** The admin page's users list: what each user has made, by kind, and what is in their trash. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testContext, PW } from "./helpers.mjs";
import { buildApp } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import * as A from "../server/auth/accounts.mjs";

const ORIGIN = "https://hoi.example", D = "/api/documents";
const catalog = { byId: new Map([["sr2e.vehicles.x", { id: "sr2e.vehicles.x", type: "vehicle", book: "sr2", name: "X" }]]), vehicles: new Map(), index: [], manifest: { books: [] } };

test("admin: each user's characters, vehicles and drafts, and their trash; not for a plain user", async () => {
  const t = await testContext();
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog });
  const person = async (username, secret) => {
    const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret, username, password: PW } });
    const cookie = res.headers["set-cookie"].split(";")[0];
    const csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
    return (method, url, body) => app.inject({ method, url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, ...(method === "GET" ? {} : { "idempotency-key": randomUUID() }) }, ...(body !== undefined ? { payload: body } : {}) });
  };
  const boss = await person("Boss", (await A.bootstrap(t.ctx)).secret);
  const razor = await person("Razor", (await A.createInvite(t.ctx)).secret);
  assert.equal((await razor("POST", `${D}/characters`, { name: "Rigger" })).statusCode, 200);
  const d1 = (await razor("POST", D, { name: "Note one" })).json().document;
  assert.equal((await razor("POST", D, { name: "Note two" })).statusCode, 200);
  await razor("DELETE", `${D}/${d1.id}`, { revision: 1 });
  const users = (await boss("GET", "/api/admin/users")).json().users;
  const r = users.find(u => u.username === "Razor"), b = users.find(u => u.username === "Boss");
  assert.deepEqual([r.made, r.trashed], [{ character: 1, vehicle: 0, npc: 0, draft: 1 }, 1]);
  assert.deepEqual([b.made, b.trashed], [{ character: 0, vehicle: 0, npc: 0, draft: 0 }, 0]);
  assert.equal((await razor("GET", "/api/admin/users")).statusCode, 403, "admins only");
  // Roles change after creation (admins only; the last admin keeps theirs; a new admin's page opens at once).
  assert.equal((await razor("PUT", "/api/admin/users/Razor/role", { role: "admin" })).statusCode, 403);
  assert.equal((await boss("PUT", "/api/admin/users/Boss/role", { role: "user" })).json().code, "last-admin");
  assert.equal((await boss("PUT", "/api/admin/users/Razor/role", { role: "gm" })).statusCode, 400);
  assert.equal((await boss("PUT", "/api/admin/users/Razor/role", { role: "admin" })).statusCode, 200);
  assert.equal((await razor("GET", "/api/admin/users")).statusCode, 200);
  assert.equal((await razor("PUT", "/api/admin/users/Boss/role", { role: "user" })).statusCode, 200);
  assert.equal((await boss("GET", "/api/admin/users")).statusCode, 403, "demoted at once");
  await app.close();
});
