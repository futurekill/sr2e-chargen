import { test } from "node:test";
import assert from "node:assert/strict";
import { testContext, PW } from "./helpers.mjs";
import { buildApp, REDACT } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import * as A from "../server/auth/accounts.mjs";

const ORIGIN = "https://hoi.example";
async function harness({ baseUrl = ORIGIN, logger = false } = {}) {
  const t = await testContext();
  const config = loadConfig({ NODE_ENV: "production", BASE_URL: baseUrl });
  const app = await buildApp({ ctx: t.ctx, config, logger });
  const setup = await A.bootstrap(t.ctx);
  const call = (method, url, { body, cookie, csrf, origin = ORIGIN, headers = {} } = {}) => app.inject({ method, url,
    headers: { ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}), ...headers },
    ...(body !== undefined ? { payload: body } : {}) });
  /** Redeem a link (or sign in) and return the cookie and CSRF token of that session. */
  const signIn = async (url, body) => {
    const res = await call("POST", url, { body });
    assert.equal(res.statusCode, 200, res.body);
    const cookie = res.headers["set-cookie"].split(";")[0];
    const csrf = (await call("GET", "/api/session", { cookie })).json().csrf;
    return { cookie, csrf, res };
  };
  const admin = await signIn("/api/redeem", { secret: setup.secret, username: "Boss", password: PW });
  return { ...t, app, config, call, signIn, admin };
}

test("redeem signs in with a hardened cookie; /session gives the user and the CSRF token", async () => {
  const { call, admin } = await harness();
  const set = admin.res.headers["set-cookie"];
  assert.match(set, /^__Host-sid=[A-Za-z0-9_-]{43};/);
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(set.includes(flag), flag);
  assert.ok(!/Domain=/i.test(set));
  const s = await call("GET", "/api/session", { cookie: admin.cookie });
  assert.deepEqual(s.json().user.username, "Boss");
  assert.equal(s.headers["cache-control"], "no-store");
  assert.equal((await call("GET", "/api/session")).statusCode, 401);
});

test("on localhost over http the cookie is plain `sid` without Secure", async () => {
  const t = await testContext();
  const config = loadConfig({ BASE_URL: "http://localhost:3000" });
  const app = await buildApp({ ctx: t.ctx, config, logger: false });
  const setup = await A.bootstrap(t.ctx);
  const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: "http://localhost:3000" }, payload: { secret: setup.secret, username: "Boss", password: PW } });
  assert.match(res.headers["set-cookie"], /^sid=/);
  assert.ok(!res.headers["set-cookie"].includes("Secure"));
  assert.throws(() => loadConfig({ BASE_URL: "http://example.com" }), /https/);
  assert.throws(() => loadConfig({ NODE_ENV: "production" }), /BASE_URL/);
});

test("state changes need the right Origin, and with a session its CSRF token", async () => {
  const { call, admin } = await harness();
  assert.equal((await call("POST", "/api/login", { body: { username: "boss", password: PW }, origin: null })).statusCode, 403);
  assert.equal((await call("POST", "/api/login", { body: { username: "boss", password: PW }, origin: "https://evil.example" })).statusCode, 403);
  assert.equal((await call("POST", "/api/logout", { cookie: admin.cookie })).json().code, "csrf");
  assert.equal((await call("POST", "/api/logout", { cookie: admin.cookie, csrf: "wrong" })).json().code, "csrf");
  assert.equal((await call("POST", "/api/logout", { cookie: admin.cookie, csrf: admin.csrf })).statusCode, 200);
  assert.equal((await call("GET", "/api/session", { cookie: admin.cookie })).statusCode, 401);   // signed out
});

test("only JSON bodies are accepted (a cross-site form can't post)", async () => {
  const { call } = await harness();
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
    const res = await call("POST", "/api/login", { body: "username=boss&password=x", headers: { "content-type": type } });
    assert.equal(res.statusCode, 415, type);
  }
});

test("inputs are validated: unknown fields, wrong types and oversized bodies are refused without echo", async () => {
  const { call } = await harness();
  const bad = await call("POST", "/api/login", { body: { username: "boss", password: PW, admin: true } });
  assert.equal(bad.statusCode, 400);
  assert.ok(!bad.body.includes("admin"));
  assert.equal((await call("POST", "/api/login", { body: { username: 7, password: PW } })).statusCode, 400);
  assert.equal((await call("POST", "/api/login", { body: { username: "boss", password: "x".repeat(20000) } })).statusCode, 413);
});

test("login: one generic failure, and the auth routes are rate limited per address", async () => {
  const { call } = await harness();
  const wrong = await call("POST", "/api/login", { body: { username: "boss", password: "wrong wrong wrong" } });
  const unknown = await call("POST", "/api/login", { body: { username: "nobody", password: "wrong wrong wrong" } });
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(wrong.json(), unknown.json());
  let last;
  for (let i = 0; i < 10; i++) last = await call("POST", "/api/login", { body: { username: "nobody", password: "wrong wrong wrong" } });
  assert.equal(last.statusCode, 429);
});

test("admin routes: admins only; invite → redeem → a user who can't reach them", async () => {
  const { call, signIn, admin } = await harness();
  assert.equal((await call("GET", "/api/admin/users")).statusCode, 401);
  const inv = (await call("POST", "/api/admin/invites", { cookie: admin.cookie, csrf: admin.csrf, body: {} })).json();
  assert.match(inv.link, /^https:\/\/hoi\.example\/redeem#k=[A-Za-z0-9_-]{43}$/);
  assert.equal((await call("GET", "/api/admin/invites", { cookie: admin.cookie })).json().invites.length, 1);
  const user = await signIn("/api/redeem", { secret: inv.link.split("#k=")[1], username: "Razor", password: PW });
  assert.equal((await call("GET", "/api/admin/users", { cookie: user.cookie })).json().code, "not-admin");
  assert.equal((await call("POST", "/api/admin/invites", { cookie: user.cookie, csrf: user.csrf, body: {} })).statusCode, 403);
  assert.deepEqual((await call("GET", "/api/admin/users", { cookie: admin.cookie })).json().users.map(u => u.username), ["Boss", "Razor"]);
  // Disable Razor: the session dies at once.
  assert.equal((await call("POST", "/api/admin/users/Razor/disable", { cookie: admin.cookie, csrf: admin.csrf })).statusCode, 200);
  assert.equal((await call("GET", "/api/session", { cookie: user.cookie })).statusCode, 401);
  assert.equal((await call("POST", "/api/admin/users/Boss/disable", { cookie: admin.cookie, csrf: admin.csrf })).json().code, "last-admin");
  const reset = (await call("POST", "/api/admin/users/Razor/reset-link", { cookie: admin.cookie, csrf: admin.csrf })).json();
  assert.match(reset.link, /\/reset#k=/);
});

test("changing the password over HTTP needs the current one and signs the session out", async () => {
  const { call, admin } = await harness();
  const no = await call("POST", "/api/account/password", { cookie: admin.cookie, csrf: admin.csrf, body: { current: "not the one, sorry", next: "another fine password" } });
  assert.equal(no.json().code, "bad-password");
  assert.equal((await call("POST", "/api/account/password", { cookie: admin.cookie, csrf: admin.csrf, body: { current: PW, next: "another fine password" } })).statusCode, 200);
  assert.equal((await call("GET", "/api/session", { cookie: admin.cookie })).statusCode, 401);
});

test("security headers", async () => {
  const { call } = await harness();
  const h = (await call("GET", "/healthz")).headers;
  assert.match(h["content-security-policy"], /default-src 'self'/);
  assert.match(h["content-security-policy"], /frame-ancestors 'none'/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(h["content-security-policy"]));
  assert.match(h["strict-transport-security"], /max-age=31536000/);
  assert.equal(h["x-content-type-options"], "nosniff");
  assert.equal(h["referrer-policy"], "no-referrer");
  assert.equal(h["x-frame-options"], "DENY");
});

test("logs never carry cookies, CSRF tokens, passwords or link secrets", async () => {
  const lines = [];
  const { call, admin, ctx } = await harness({ logger: { level: "trace", redact: REDACT, stream: { write: (l) => lines.push(l) } } });
  const inv = await A.createInvite(ctx);
  await call("POST", "/api/redeem", { body: { secret: inv.secret, username: "Razor", password: "hunter2 hunter2 hunter2" } });
  await call("POST", "/api/logout", { cookie: admin.cookie, csrf: admin.csrf });
  const log = lines.join("");
  assert.ok(log.length > 0);
  for (const secret of [admin.cookie.split("=")[1], admin.csrf, "hunter2", inv.secret, PW]) assert.ok(!log.includes(secret), "leaked a secret");
});

test("unknown routes are a plain 404; a server fault doesn't leak detail", async () => {
  const { call, app, admin } = await harness();
  assert.deepEqual((await call("GET", "/api/nope")).json(), { error: "Nothing here.", code: "not-found" });
  app.ctx.db.selectFrom = () => { throw new Error("SECRET INTERNAL DETAIL"); };
  const res = await call("GET", "/api/admin/users", { cookie: admin.cookie });
  assert.equal(res.statusCode, 500);
  assert.ok(!res.body.includes("SECRET"));
});

test("the built client: the app shell for any page address, immutable assets, JSON 404 for the API", { skip: !(await import("node:fs")).existsSync(new URL("../dist/client/index.html", import.meta.url)) && "client not built" }, async () => {
  const { call } = await harness();
  for (const url of ["/", "/redeem", "/doc/123", "/anything/else"]) {
    const res = await call("GET", url, { origin: null });
    assert.equal(res.statusCode, 200, url);
    assert.match(res.headers["content-type"], /text\/html/);
    assert.equal(res.headers["cache-control"], "no-cache");
    assert.match(res.body, /<div id="app">/);
    assert.ok(!/<script(?![^>]*\bsrc=)/.test(res.body), "no inline script");
    assert.ok(!/\sstyle=/.test(res.body), "no inline style");
  }
  const asset = /\/assets\/[^"]+\.js/.exec((await call("GET", "/", { origin: null })).body)[0];
  const js = await call("GET", asset, { origin: null });
  assert.equal(js.statusCode, 200);
  assert.match(js.headers["cache-control"], /immutable/);
  assert.equal((await call("GET", "/assets/nope.js", { origin: null })).statusCode, 404);
  assert.equal((await call("GET", "/api/nope", { origin: null })).json().code, "not-found");
});
