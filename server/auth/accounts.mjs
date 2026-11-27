/**
 * The account lifecycle (docs/PLAN-M3.md §4): one-time links (invite, first-admin setup, password reset), login with
 * lockout, password change, disabling. Every function takes `ctx = { db, dialect, now }`. Errors a person should see
 * are `Refused` (with an HTTP status); anything else is a bug.
 */
import { randomUUID } from "node:crypto";
import { writeTx, updateLock, changed } from "../db/fence.mjs";
import { newSecret, sha256, looksLikeSecret } from "./tokens.mjs";
import { hashPassword, verifyPassword, dummyHash, passwordProblem } from "./passwords.mjs";
import { createSession, deleteUserSessions } from "./sessions.mjs";

export class Refused extends Error {
  constructor(message, statusCode = 400, code = "refused") { super(message); this.statusCode = statusCode; this.code = code; }
}
const TTL = { invite: 7 * 86400e3, setup: 7 * 86400e3, reset: 86400e3 };
const BAD_LINK = "That link is dead, chummer: used, expired, or never was.";
const BAD_LOGIN = "Wrong handle or password.";
const LOCK_AFTER = 5, LOCK_BASE_MS = 60e3, LOCK_MAX_MS = 3600e3;

export const usernameKey = (name) => String(name ?? "").normalize("NFKC").toLowerCase();
export function usernameProblem(name) {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/.test(String(name ?? "")) ? null
    : "Handles are 3–32 letters, digits, dots, dashes or underscores, starting with a letter or digit.";
}
export const audit = (trx, ctx, action, { actor = null, target = null, ip = null } = {}) =>
  trx.insertInto("audit").values({ id: randomUUID(), at: ctx.now(), actor_id: actor, action, target, ip }).execute();

async function issue(trx, ctx, { kind, role = null, userId = null, createdBy = null, generation = null }) {
  const { secret, hash } = newSecret(), now = ctx.now(), id = randomUUID();
  await trx.insertInto("tokens").values({ id, kind, token_hash: hash, user_id: userId, role, generation, created_by: createdBy,
    created_at: now, expires_at: now + TTL[kind], used_at: null }).execute();
  return { id, secret, expiresAt: now + TTL[kind] };
}
/** Consume a token by its SECRET and kind (never by id): exactly one row, or null. */
async function consume(trx, ctx, secret, kinds) {
  if (!looksLikeSecret(secret)) return null;
  const hash = sha256(secret), now = ctx.now();
  const r = await trx.updateTable("tokens").set({ used_at: now })
    .where("token_hash", "=", hash).where("kind", "in", kinds).where("used_at", "is", null).where("expires_at", ">", now).executeTakeFirst();
  if (changed(r) !== 1) return null;
  return trx.selectFrom("tokens").selectAll().where("token_hash", "=", hash).executeTakeFirst();
}
const enabledAdmins = async (trx) => Number((await trx.selectFrom("users").select(eb => eb.fn.countAll().as("n"))
  .where("role", "=", "admin").where("disabled_at", "is", null).executeTakeFirst()).n);
/** Lock the admin set (the `admin_gen` row) and return the generation. Call FIRST in any admin-set transaction. */
async function lockAdmins(trx, ctx) {
  const row = await updateLock(ctx, trx.selectFrom("settings").select("value").where("key", "=", "admin_gen")).executeTakeFirst();
  return Number(row.value);
}

/** The first admin's setup link — only while no ENABLED admin exists. Earlier unused setup links die. */
export function bootstrap(ctx) {
  return writeTx(ctx, async trx => {
    const generation = await lockAdmins(trx, ctx);
    if (await enabledAdmins(trx)) throw new Refused("There's already an admin. Ask them for an invite.", 409);
    await trx.updateTable("tokens").set({ used_at: ctx.now() }).where("kind", "=", "setup").where("used_at", "is", null).execute();
    const t = await issue(trx, ctx, { kind: "setup", role: "admin", generation });
    await audit(trx, ctx, "setup.issued", { target: t.id });
    return t;
  });
}
export function createInvite(ctx, { role = "user", createdBy = null } = {}) {
  if (!["user", "admin"].includes(role)) throw new Refused("No such role.");
  return writeTx(ctx, async trx => {
    const t = await issue(trx, ctx, { kind: "invite", role, createdBy });
    await audit(trx, ctx, "invite.created", { actor: createdBy, target: t.id });
    return t;
  });
}
export const listInvites = (ctx) => ctx.db.selectFrom("tokens").select(["id", "kind", "role", "created_by", "created_at", "expires_at"])
  .where("kind", "in", ["invite", "setup"]).where("used_at", "is", null).where("expires_at", ">", ctx.now()).orderBy("created_at").execute();
export function revokeInvite(ctx, id, { actor = null } = {}) {
  return writeTx(ctx, async trx => {
    const r = await trx.updateTable("tokens").set({ used_at: ctx.now() }).where("id", "=", id).where("kind", "in", ["invite", "setup"]).where("used_at", "is", null).executeTakeFirst();
    if (changed(r) !== 1) throw new Refused("No such open invite.", 404);
    await audit(trx, ctx, "invite.revoked", { actor, target: id });
  });
}

/** Redeem an invite or setup link: creates the account. The token is spent only if the account is created. */
export async function redeem(ctx, { secret, username, password, ip = null }) {
  const problem = usernameProblem(username) ?? passwordProblem(password, username);
  if (problem) throw new Refused(problem);
  const password_hash = await hashPassword(password);   // before the transaction: slow, and no lock is held
  return writeTx(ctx, async trx => {
    // The admin set's lock FIRST, as in bootstrap — the same order everywhere, so the two can't deadlock (review 1 #6).
    const generation = await lockAdmins(trx, ctx);
    const token = await consume(trx, ctx, secret, ["invite", "setup"]);
    if (!token) throw new Refused(BAD_LINK, 410, "bad-link");
    if (token.kind === "setup") {
      // Two racing bootstraps hold two links of the same generation: only one can advance it (round 1 #5).
      if (token.generation !== generation) throw new Refused(BAD_LINK, 410, "bad-link");
      await trx.updateTable("settings").set({ value: String(generation + 1) }).where("key", "=", "admin_gen").execute();
    }
    const key = usernameKey(username);
    if (await trx.selectFrom("users").select("id").where("username_key", "=", key).executeTakeFirst())
      throw new Refused("That handle's taken. Pick another.", 409, "username-taken");   // rolls the token back to unused
    const id = randomUUID();
    await trx.insertInto("users").values({ id, username, username_key: key, password_hash, role: token.role ?? "user", created_at: ctx.now() }).execute();
    await audit(trx, ctx, `${token.kind}.redeemed`, { actor: id, target: token.id, ip });
    return { user: { id, username, role: token.role ?? "user" }, sessionSecret: await createSession(trx, ctx, id) };
  });
}

const findUser = (db, username) => db.selectFrom("users").selectAll().where("username_key", "=", usernameKey(username)).executeTakeFirst();

/** A single-use reset link for a user (no email in v1: an admin hands it over). */
export async function resetLink(ctx, username, { actor = null } = {}) {
  const user = await findUser(ctx.db, username);
  if (!user) throw new Refused("No such user.", 404);
  return writeTx(ctx, async trx => {
    const t = await issue(trx, ctx, { kind: "reset", userId: user.id, createdBy: actor });
    await audit(trx, ctx, "reset.issued", { actor, target: user.id });
    return t;
  });
}
export async function redeemReset(ctx, { secret, password, ip = null }) {
  const pre = looksLikeSecret(secret) ? await ctx.db.selectFrom("tokens").innerJoin("users", "users.id", "tokens.user_id")
    .select(["users.username"]).where("tokens.token_hash", "=", sha256(secret)).where("tokens.kind", "=", "reset").executeTakeFirst() : null;
  if (!pre) throw new Refused(BAD_LINK, 410, "bad-link");
  const problem = passwordProblem(password, pre.username);
  if (problem) throw new Refused(problem);
  const password_hash = await hashPassword(password);
  return writeTx(ctx, async trx => {
    const token = await consume(trx, ctx, secret, ["reset"]);
    if (!token?.user_id) throw new Refused(BAD_LINK, 410, "bad-link");
    await trx.updateTable("users").set({ password_hash, failed_logins: 0, locked_until: null }).where("id", "=", token.user_id).execute();
    await deleteUserSessions(trx, token.user_id);
    await audit(trx, ctx, "reset.redeemed", { actor: token.user_id, ip });
  });
}

/** Sign in. Every failure — unknown handle, wrong password, disabled, locked — is the same answer. */
export async function login(ctx, { username, password, ip = null }) {
  const user = await findUser(ctx.db, username);
  const now = ctx.now();
  const blocked = !user || user.disabled_at != null || (user.locked_until != null && Number(user.locked_until) > now);
  // Always do the work, so the answer's timing doesn't say which case it was.
  const { ok, rehash } = await verifyPassword(String(password ?? ""), user?.password_hash ?? await dummyHash());
  if (blocked) {
    if (user) await writeTx(ctx, trx => audit(trx, ctx, user.disabled_at != null ? "login.disabled" : "login.locked", { actor: user.id, ip }));
    throw new Refused(BAD_LOGIN, 401, "bad-login");
  }
  if (!ok) {
    await writeTx(ctx, async trx => {
      await trx.updateTable("users").set(eb => ({ failed_logins: eb("failed_logins", "+", 1) })).where("id", "=", user.id).execute();
      const { failed_logins: n } = await trx.selectFrom("users").select("failed_logins").where("id", "=", user.id).executeTakeFirst();
      if (n >= LOCK_AFTER) await trx.updateTable("users").set({ locked_until: now + Math.min(LOCK_MAX_MS, LOCK_BASE_MS * 2 ** (n - LOCK_AFTER)) }).where("id", "=", user.id).execute();
      await audit(trx, ctx, "login.failed", { actor: user.id, ip });
    });
    throw new Refused(BAD_LOGIN, 401, "bad-login");
  }
  const upgraded = rehash ? await hashPassword(password) : null;
  return writeTx(ctx, async trx => {
    // The password was checked BEFORE this transaction: a reset, a change, a disable or a lock may have landed
    // since. Lock the user and check again, or an old password could open a session after a reset (review 1 #1).
    const live = await updateLock(ctx, trx.selectFrom("users").select(["password_hash", "disabled_at", "locked_until"]).where("id", "=", user.id)).executeTakeFirst();
    if (!live || live.password_hash !== user.password_hash || live.disabled_at != null || (live.locked_until != null && Number(live.locked_until) > ctx.now()))
      throw new Refused(BAD_LOGIN, 401, "bad-login");
    await trx.updateTable("users").set({ failed_logins: 0, locked_until: null, ...(upgraded ? { password_hash: upgraded } : {}) }).where("id", "=", user.id).execute();
    await audit(trx, ctx, "login.ok", { actor: user.id, ip });
    return { user: { id: user.id, username: user.username, role: user.role }, sessionSecret: await createSession(trx, ctx, user.id) };
  });
}

/** Change a password: needs the CURRENT one (a stolen session can't replace it). Ends every session of the user. */
export async function changePassword(ctx, { userId, current, next, ip = null }) {
  const user = await ctx.db.selectFrom("users").selectAll().where("id", "=", userId).executeTakeFirst();
  if (!user) throw new Refused("No such user.", 404);
  if (!(await verifyPassword(String(current ?? ""), user.password_hash)).ok) throw new Refused("That's not your current password.", 403, "bad-password");
  const problem = passwordProblem(next, user.username);
  if (problem) throw new Refused(problem);
  const password_hash = await hashPassword(next);
  return writeTx(ctx, async trx => {
    // Only if the password we verified is STILL the current one and the account is live (review 1 #2).
    const r = await trx.updateTable("users").set({ password_hash }).where("id", "=", userId)
      .where("password_hash", "=", user.password_hash).where("disabled_at", "is", null).executeTakeFirst();
    if (changed(r) !== 1) throw new Refused("That's not your current password.", 403, "bad-password");
    await deleteUserSessions(trx, userId);
    await audit(trx, ctx, "password.changed", { actor: userId, ip });
  });
}

/** Disable or enable an account. The LAST enabled admin can't be disabled; the admin set is locked first. */
export async function setDisabled(ctx, username, disabled, { actor = null } = {}) {
  return writeTx(ctx, async trx => {
    await lockAdmins(trx, ctx);
    const user = await findUser(trx, username);
    if (!user) throw new Refused("No such user.", 404);
    if (disabled && user.role === "admin" && user.disabled_at == null && (await enabledAdmins(trx)) <= 1)
      throw new Refused("That's the last admin. Make another one first.", 409, "last-admin");
    await trx.updateTable("users").set({ disabled_at: disabled ? ctx.now() : null, ...(disabled ? {} : { failed_logins: 0, locked_until: null }) }).where("id", "=", user.id).execute();
    if (disabled) await deleteUserSessions(trx, user.id);
    await audit(trx, ctx, disabled ? "user.disabled" : "user.enabled", { actor, target: user.id });
  });
}
/** Change an account's role ("user" or "admin"). The LAST enabled admin can't lose it; the admin set is locked first.
 * Sessions read the role from the users table on every request, so the change applies at once. */
export async function setRole(ctx, username, role, { actor = null } = {}) {
  if (!["user", "admin"].includes(role)) throw new Refused("No such role.");
  return writeTx(ctx, async trx => {
    await lockAdmins(trx, ctx);
    const user = await findUser(trx, username);
    if (!user) throw new Refused("No such user.", 404);
    if (user.role === role) return;
    if (user.role === "admin" && user.disabled_at == null && (await enabledAdmins(trx)) <= 1)
      throw new Refused("That's the last admin. Make another one first.", 409, "last-admin");
    await trx.updateTable("users").set({ role }).where("id", "=", user.id).execute();
    await audit(trx, ctx, `user.role.${role}`, { actor, target: user.id });
  });
}
/**
 * Every user for the admin page, with what they have made: `made` = live documents by kind (characters, vehicles,
 * NPCs, drafts; archived ones count, they are still theirs) and `trashed` = documents in the trash. One grouped query.
 */
export async function listUsers(ctx) {
  const users = await ctx.db.selectFrom("users").select(["id", "username", "role", "disabled_at", "created_at", "doc_count"]).orderBy("username_key").execute();
  const rows = await ctx.db.selectFrom("documents").select(eb => ["owner_id", "kind", eb.fn.countAll().as("n"),
    eb.fn.sum(eb.case().when("deleted_at", "is not", null).then(1).else(0).end()).as("trashed")]).groupBy(["owner_id", "kind"]).execute();
  const by = new Map(users.map(u => [u.id, { made: { character: 0, vehicle: 0, npc: 0, draft: 0 }, trashed: 0 }]));
  for (const r of rows) {
    const u = by.get(r.owner_id); if (!u) continue;
    const n = Number(r.n), t = Number(r.trashed ?? 0);   // counts arrive as strings on Postgres and MySQL
    if (Object.hasOwn(u.made, r.kind)) u.made[r.kind] += n - t;
    u.trashed += t;
  }
  return users.map(u => ({ ...u, ...by.get(u.id) }));
}
