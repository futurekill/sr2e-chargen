/**
 * Server-side sessions (docs/PLAN-M3.md §4). The cookie carries 32 random bytes; the row stores their SHA-256.
 * Idle expiry 7 days, absolute 30 days. The CSRF token is derived from the session secret (the page can't read the
 * HttpOnly cookie, so only a response to that session can hand it out); its hash is on the row.
 */
import { randomUUID } from "node:crypto";
import { newSecret, sha256, sameHash } from "./tokens.mjs";
import { writeTx, Maintenance } from "../db/fence.mjs";
import { THEME_KEYS } from "../../shared/themes.mjs";

export const IDLE_MS = 7 * 86400e3, ABSOLUTE_MS = 30 * 86400e3, TOUCH_MS = 60e3;
export const csrfFor = (secret) => sha256(`csrf:${secret}`);

/** Inside a write transaction: a NEW session for the user (never reuse a pre-login one). Returns the cookie secret. */
export async function createSession(trx, ctx, userId) {
  const { secret, hash } = newSecret(), now = ctx.now();
  await trx.insertInto("sessions").values({ id: randomUUID(), user_id: userId, token_hash: hash, csrf_hash: sha256(csrfFor(secret)),
    created_at: now, last_seen_at: now, expires_at: now + ABSOLUTE_MS }).execute();
  return secret;
}

/** A user's preferences, with defaults; anything unknown or damaged in the column reads as the default. */
export const THEMES = THEME_KEYS;
export const PREF_DEFAULTS = Object.freeze({ readableFont: false, theme: THEMES[0], banter: true });
export function readPrefs(raw) {
  let p;
  try { p = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { p = null; }
  // banter: the footer's Shadowland board (docs/PLAN-help-footer.md 3); on unless turned off.
  return { readableFont: p?.readableFont === true, theme: THEMES.includes(p?.theme) ? p.theme : THEMES[0], banter: p?.banter !== false };
}

/** The live session for a cookie secret: `{ session, user, csrf }`, or null (unknown, expired, idle, disabled). */
export async function findSession(ctx, secret) {
  if (typeof secret !== "string" || !secret) return null;
  const row = await ctx.db.selectFrom("sessions").innerJoin("users", "users.id", "sessions.user_id")
    .select(["sessions.id as sid", "sessions.csrf_hash", "sessions.last_seen_at", "sessions.expires_at",
      "users.id as id", "users.username", "users.role", "users.disabled_at", "users.prefs"])
    .where("sessions.token_hash", "=", sha256(secret)).executeTakeFirst();
  const now = ctx.now();
  if (!row || row.disabled_at != null || Number(row.expires_at) <= now || Number(row.last_seen_at) + IDLE_MS <= now) return null;
  if (now - Number(row.last_seen_at) > TOUCH_MS) {
    // A touch is a write: behind the fence like any other, and simply skipped during maintenance.
    await writeTx(ctx, trx => trx.updateTable("sessions").set({ last_seen_at: now }).where("id", "=", row.sid).execute())
      .catch(err => { if (!(err instanceof Maintenance)) throw err; });
  }
  return { sessionId: row.sid, csrf: csrfFor(secret), csrfHash: row.csrf_hash, user: { id: row.id, username: row.username, role: row.role, prefs: readPrefs(row.prefs) } };
}
export const csrfOk = (session, presented) => typeof presented === "string" && sameHash(sha256(presented), session.csrfHash);

export const deleteSession = (trx, sessionId) => trx.deleteFrom("sessions").where("id", "=", sessionId).execute();
export const deleteUserSessions = (trx, userId) => trx.deleteFrom("sessions").where("user_id", "=", userId).execute();
/** Sweep: sessions past either expiry. */
export const purgeSessions = (ctx) => writeTx(ctx, trx => trx.deleteFrom("sessions")
  .where(eb => eb.or([eb("expires_at", "<=", ctx.now()), eb("last_seen_at", "<=", ctx.now() - IDLE_MS)])).execute());
