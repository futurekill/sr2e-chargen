import { test } from "node:test";
import assert from "node:assert/strict";
import { testContext, PW } from "./helpers.mjs";
import * as A from "../server/auth/accounts.mjs";
import { findSession, csrfOk, csrfFor, IDLE_MS, ABSOLUTE_MS } from "../server/auth/sessions.mjs";
import { setMaintenance, Maintenance, SessionGone } from "../server/db/fence.mjs";

const refused = (code) => (err) => err instanceof A.Refused && (!code || err.code === code);
async function withAdmin() {
  const t = await testContext();
  const link = await A.bootstrap(t.ctx);
  const admin = await A.redeem(t.ctx, { secret: link.secret, username: "Boss", password: PW });
  return { ...t, admin };
}

test("bootstrap → setup link → the first admin, signed in", async () => {
  const { ctx, admin } = await withAdmin();
  assert.equal(admin.user.role, "admin");
  assert.equal((await findSession(ctx, admin.sessionSecret)).user.username, "Boss");
  await assert.rejects(A.bootstrap(ctx), refused());   // an admin exists now
});

// (The lock ORDER of bootstrap vs redemption matters on Postgres/MySQL; that race is tested when those dialects land.)
test("two setup links of the same generation make only one admin", async () => {
  const { ctx } = await testContext();
  const a = await A.bootstrap(ctx);
  // A second run revokes the first link; simulate the true race by reviving it (both issued under generation 0).
  const b = await A.bootstrap(ctx);
  await ctx.db.updateTable("tokens").set({ used_at: null }).where("id", "=", a.id).execute();
  await A.redeem(ctx, { secret: a.secret, username: "First", password: PW });
  await assert.rejects(A.redeem(ctx, { secret: b.secret, username: "Second", password: PW }), refused("bad-link"));
  assert.equal((await A.listUsers(ctx)).length, 1);
});

test("a link works once, by its secret only, for its kind, before it expires", async () => {
  const { ctx, advance } = await withAdmin();
  const inv = await A.createInvite(ctx);
  await assert.rejects(A.redeem(ctx, { secret: inv.id, username: "Sneak", password: PW }), refused("bad-link"));   // the id is not the secret
  await assert.rejects(A.redeemReset(ctx, { secret: inv.secret, password: PW }), refused("bad-link"));              // wrong kind
  const r = await Promise.allSettled([A.redeem(ctx, { secret: inv.secret, username: "Razor", password: PW }), A.redeem(ctx, { secret: inv.secret, username: "Razor2", password: PW })]);
  assert.deepEqual(r.map(x => x.status).sort(), ["fulfilled", "rejected"]);
  const late = await A.createInvite(ctx);
  advance(7 * 86400e3 + 1);
  await assert.rejects(A.redeem(ctx, { secret: late.secret, username: "Late", password: PW }), refused("bad-link"));
});

test("a taken handle leaves the invite usable; handles are unique case-insensitively", async () => {
  const { ctx } = await withAdmin();
  const inv = await A.createInvite(ctx);
  await assert.rejects(A.redeem(ctx, { secret: inv.secret, username: "BOSS", password: PW }), refused("username-taken"));
  assert.equal((await A.redeem(ctx, { secret: inv.secret, username: "Patch", password: PW })).user.role, "user");
  await assert.rejects(A.redeem(ctx, { secret: inv.secret, username: "x", password: PW }), refused());
  await assert.rejects(A.redeem(ctx, { secret: inv.secret, username: "Okay", password: "short" }), refused());
});

test("a revoked invite is dead; the list shows only open ones", async () => {
  const { ctx } = await withAdmin();
  const inv = await A.createInvite(ctx);
  assert.equal((await A.listInvites(ctx)).length, 1);
  await A.revokeInvite(ctx, inv.id);
  assert.equal((await A.listInvites(ctx)).length, 0);
  await assert.rejects(A.redeem(ctx, { secret: inv.secret, username: "Ghost", password: PW }), refused("bad-link"));
});

test("login: same answer for unknown, wrong, locked and disabled; lockout doubles; success resets", async () => {
  const { ctx, advance } = await withAdmin();
  await assert.rejects(A.login(ctx, { username: "nobody", password: PW }), refused("bad-login"));
  for (let i = 0; i < 5; i++) await assert.rejects(A.login(ctx, { username: "boss", password: "wrong wrong wrong" }), refused("bad-login"));
  await assert.rejects(A.login(ctx, { username: "boss", password: PW }), refused("bad-login"));   // locked: even the right one
  advance(60e3 + 1);
  await assert.rejects(A.login(ctx, { username: "boss", password: "wrong wrong wrong" }), refused("bad-login"));   // 6th: 2 minutes
  advance(60e3 + 1);
  await assert.rejects(A.login(ctx, { username: "boss", password: PW }), refused("bad-login"));
  advance(60e3);
  const ok = await A.login(ctx, { username: "Boss", password: PW });
  assert.equal(ok.user.username, "Boss");
  const u = await ctx.db.selectFrom("users").select(["failed_logins", "locked_until"]).executeTakeFirst();
  assert.deepEqual({ ...u }, { failed_logins: 0, locked_until: null });
});

test("sessions: idle and absolute expiry, CSRF token bound to the session", async () => {
  const { ctx, admin, advance } = await withAdmin();
  const s = await findSession(ctx, admin.sessionSecret);
  assert.equal(s.csrf, csrfFor(admin.sessionSecret));
  assert.equal(csrfOk(s, s.csrf), true);
  assert.equal(csrfOk(s, "nope"), false);
  assert.equal(csrfOk(s, undefined), false);
  assert.equal(await findSession(ctx, "not-a-session"), null);
  advance(IDLE_MS - 1000);
  assert.ok(await findSession(ctx, admin.sessionSecret));        // seen: the idle clock restarts
  advance(IDLE_MS - 1000);
  assert.ok(await findSession(ctx, admin.sessionSecret));
  advance(IDLE_MS + 1);
  assert.equal(await findSession(ctx, admin.sessionSecret), null);   // idle
  const again = await A.login(ctx, { username: "boss", password: PW });
  for (let d = 0; d < 29; d++) { advance(86400e3); assert.ok(await findSession(ctx, again.sessionSecret)); }
  advance(86400e3 + 1);
  assert.equal(await findSession(ctx, again.sessionSecret), null);   // absolute, however active
  assert.equal(ABSOLUTE_MS, 30 * 86400e3);
});

test("password change needs the current password and ends every session", async () => {
  const { ctx, admin } = await withAdmin();
  const other = await A.login(ctx, { username: "boss", password: PW });
  await assert.rejects(A.changePassword(ctx, { userId: admin.user.id, current: "not it at all!", next: "another fine password" }), refused("bad-password"));
  await A.changePassword(ctx, { userId: admin.user.id, current: PW, next: "another fine password" });
  assert.equal(await findSession(ctx, admin.sessionSecret), null);
  assert.equal(await findSession(ctx, other.sessionSecret), null);
  await assert.rejects(A.login(ctx, { username: "boss", password: PW }), refused("bad-login"));
  assert.ok(await A.login(ctx, { username: "boss", password: "another fine password" }));
});

test("reset link: bound to its user, single use, ends sessions and clears a lockout", async () => {
  const { ctx, admin } = await withAdmin();
  for (let i = 0; i < 5; i++) await A.login(ctx, { username: "boss", password: "wrong wrong wrong" }).catch(() => {});
  const link = await A.resetLink(ctx, "Boss");
  await A.redeemReset(ctx, { secret: link.secret, password: "fresh new password!" });
  assert.equal(await findSession(ctx, admin.sessionSecret), null);
  assert.ok(await A.login(ctx, { username: "boss", password: "fresh new password!" }));
  await assert.rejects(A.redeemReset(ctx, { secret: link.secret, password: "and again, please" }), refused("bad-link"));
  await assert.rejects(A.resetLink(ctx, "nobody"), refused());
});

test("disabling: sessions end, login fails, the last admin is protected, bootstrap recovers", async () => {
  const { ctx, admin } = await withAdmin();
  await assert.rejects(A.setDisabled(ctx, "Boss", true), refused("last-admin"));
  const inv = await A.createInvite(ctx, { role: "admin" });
  const second = await A.redeem(ctx, { secret: inv.secret, username: "Deputy", password: PW });
  await A.setDisabled(ctx, "Boss", true);
  assert.equal(await findSession(ctx, admin.sessionSecret), null);
  await assert.rejects(A.login(ctx, { username: "boss", password: PW }), refused("bad-login"));
  await assert.rejects(A.setDisabled(ctx, "Deputy", true), refused("last-admin"));
  assert.ok(await findSession(ctx, second.sessionSecret));
  await A.setDisabled(ctx, "Boss", false);
  assert.ok(await A.login(ctx, { username: "boss", password: PW }));
  // Both disabled behind the app's back (a direct database edit): bootstrap works again.
  await ctx.db.updateTable("users").set({ disabled_at: 1 }).execute();
  assert.ok((await A.bootstrap(ctx)).secret);
});

test("the fence: no write gets through while maintenance is on; turning it off does", async () => {
  const { ctx, admin } = await withAdmin();
  await setMaintenance(ctx, true);
  await assert.rejects(A.createInvite(ctx), Maintenance);
  await assert.rejects(A.login(ctx, { username: "boss", password: PW }), Maintenance);
  assert.ok(await findSession(ctx, admin.sessionSecret));   // reads still work; the touch is skipped
  await setMaintenance(ctx, false);
  assert.ok(await A.createInvite(ctx));
});

test("auth events are audited, without secrets", async () => {
  const { ctx } = await withAdmin();
  await A.login(ctx, { username: "boss", password: "wrong wrong wrong" }).catch(() => {});
  const rows = await ctx.db.selectFrom("audit").selectAll().execute();
  assert.deepEqual(rows.map(r => r.action).sort(), ["login.failed", "setup.issued", "setup.redeemed"]);   // (same instant on the test clock: no order)
  assert.ok(!JSON.stringify(rows).includes(PW));
});

/** A context whose clock runs `hook` once, at the first reading after `arm()` — i.e. in the middle of an operation. */
function interrupting(ctx) {
  let hook = null;
  return { ctx: { ...ctx, now: () => { const h = hook; hook = null; if (h) h(); return ctx.now(); } }, arm: (fn) => { hook = fn; } };
}

test("a password reset that lands while a login is verifying wins: the old password opens no session", async () => {
  const { ctx } = await withAdmin();
  const mid = interrupting(ctx);
  let landed;
  mid.arm(() => { landed = ctx.db.updateTable("users").set({ password_hash: "$reset-landed$" }).execute(); });
  await assert.rejects(A.login(mid.ctx, { username: "boss", password: PW }), refused("bad-login"));
  await landed;
  assert.equal((await ctx.db.selectFrom("sessions").selectAll().execute()).length, 1);   // only the setup session
});

test("a disable that lands while a login is verifying wins too", async () => {
  const { ctx } = await withAdmin();
  const mid = interrupting(ctx);
  mid.arm(() => { ctx.db.updateTable("users").set({ disabled_at: 5 }).execute(); });
  await assert.rejects(A.login(mid.ctx, { username: "boss", password: PW }), refused("bad-login"));
});

test("a reset that lands during a password change is not overwritten", async () => {
  const { ctx, admin } = await withAdmin();
  // Deterministic on every database (it raced on the Postgres pool): the reset lands AFTER changePassword has read and
  // verified the old hash, just before its write transaction opens.
  const transaction = () => {
    const tx = ctx.db.transaction();
    return { execute: async (fn) => { await ctx.db.updateTable("users").set({ password_hash: "$reset-landed$" }).execute(); return tx.execute(fn); } };
  };
  const db = new Proxy(ctx.db, { get: (t, k) => (k === "transaction" ? transaction : typeof t[k] === "function" ? t[k].bind(t) : t[k]) });   // Kysely keeps private fields
  await assert.rejects(A.changePassword({ ...ctx, db }, { userId: admin.user.id, current: PW, next: "another fine password" }), refused("bad-password"));
  assert.equal((await ctx.db.selectFrom("users").select("password_hash").executeTakeFirst()).password_hash, "$reset-landed$");
});

test("a write re-checks the acting session: revoked, disabled or demoted in the meantime, it is refused", async () => {
  const { ctx, admin } = await withAdmin();
  const sid = (await findSession(ctx, admin.sessionSecret)).sessionId;
  const acting = { ...ctx, session: { id: sid, role: "admin" } };
  assert.ok(await A.createInvite(acting));
  await ctx.db.updateTable("users").set({ role: "user" }).execute();
  await assert.rejects(A.createInvite(acting), (e) => e instanceof SessionGone && e.statusCode === 403);
  await ctx.db.updateTable("users").set({ role: "admin", disabled_at: 9 }).execute();
  await assert.rejects(A.createInvite(acting), (e) => e instanceof SessionGone && e.statusCode === 401);
  await ctx.db.updateTable("users").set({ disabled_at: null }).execute();
  await ctx.db.deleteFrom("sessions").execute();
  await assert.rejects(A.createInvite(acting), SessionGone);
});

test("preferences: the readable font is stored per user, comes with the session, and is the sheet's default", async () => {
  const { buildApp } = await import("../server/app.mjs");
  const { loadConfig } = await import("../server/config.mjs");
  const t = await testContext();
  const ORIGIN = "https://hoi.example";
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false });
  const { secret } = await A.bootstrap(t.ctx);
  const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret, username: "Boss", password: PW } });
  const cookie = res.headers["set-cookie"].split(";")[0];
  const s = (await app.inject({ url: "/api/session", headers: { cookie } })).json();
  assert.deepEqual(s.user.prefs, { readableFont: false, theme: "terminal" });
  const put = (body) => app.inject({ method: "PUT", url: "/api/account/prefs", headers: { origin: ORIGIN, cookie, "x-csrf-token": s.csrf }, payload: body });
  assert.equal((await put({ readableFont: true })).statusCode, 200);
  assert.equal((await put({ readableFont: "yes" })).statusCode, 400);
  assert.equal((await put({ readableFont: true, theme: "x" })).statusCode, 400, "an unknown theme");
  assert.equal((await put({})).statusCode, 400, "nothing to change");
  assert.equal((await put({ theme: "cybernoir" })).statusCode, 200);
  assert.deepEqual((await put({ readableFont: true })).json(), { readableFont: true, theme: "cybernoir" }, "a font save keeps the theme");
  assert.deepEqual((await app.inject({ url: "/api/session", headers: { cookie } })).json().user.prefs, { readableFont: true, theme: "cybernoir" });
  assert.deepEqual((await app.inject({ url: "/api/account/prefs", headers: { cookie } })).json(), { readableFont: true, theme: "cybernoir" });
  assert.equal((await app.inject({ method: "PUT", url: "/api/account/prefs", headers: { origin: ORIGIN, cookie }, payload: { readableFont: false } })).statusCode, 403, "CSRF");
});
