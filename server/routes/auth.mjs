/** Sign-in, links and the account (docs/PLAN-M3.md §4). */
import { getSaleMode } from "../rules-settings.mjs";
import * as A from "../auth/accounts.mjs";
import { writeTx, updateLock } from "../db/fence.mjs";
import { deleteSession, deleteUserSessions, readPrefs, THEMES } from "../auth/sessions.mjs";

const str = (max, min = 1) => ({ type: "string", minLength: min, maxLength: max });
const body = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const AUTH_LIMIT = { rateLimit: { max: 10, timeWindow: "1 minute" } };

export default async function authRoutes(app) {
  const { ctx } = app;

  app.post("/login", { config: AUTH_LIMIT, schema: { body: body({ username: str(64), password: str(256) }) } }, async (req, reply) => {
    const { user, sessionSecret } = await A.login(ctx, { ...req.body, ip: req.ip });
    app.setSessionCookie(reply, sessionSecret);
    return { user };
  });
  app.post("/redeem", { config: AUTH_LIMIT, schema: { body: body({ secret: str(64), username: str(64), password: str(256) }) } }, async (req, reply) => {
    const { user, sessionSecret } = await A.redeem(ctx, { ...req.body, ip: req.ip });
    app.setSessionCookie(reply, sessionSecret);
    return { user };
  });
  app.post("/reset", { config: AUTH_LIMIT, schema: { body: body({ secret: str(64), password: str(256) }) } }, async (req) => {
    await A.redeemReset(ctx, { ...req.body, ip: req.ip });
    return { ok: true };
  });

  // The rules settings ride along, so the client shows what the server will do (PLAN-M4b Draft 2).
  app.get("/session", { onRequest: app.needSession }, async (req) => ({ user: req.session.user, csrf: req.session.csrf, rules: { saleMode: await getSaleMode(app.ctx.db) } }));
  app.post("/logout", { onRequest: app.needSession }, async (req, reply) => {
    await writeTx(req.ctx, trx => deleteSession(trx, req.session.sessionId));
    app.clearSessionCookie(reply);
    return { ok: true };
  });
  app.post("/logout-everywhere", { onRequest: app.needSession }, async (req, reply) => {
    await writeTx(req.ctx, trx => deleteUserSessions(trx, req.session.user.id));
    app.clearSessionCookie(reply);
    return { ok: true };
  });
  // Per-user preferences (docs/PLAN-sheet.md slice 2): the readable font, on the site and as the sheet default.
  app.get("/account/prefs", { onRequest: app.needSession }, async (req) => req.session.user.prefs);
  // A partial update: each field given replaces that field; the rest are re-read in the same transaction, so a font save
  // and a theme save from two devices don't undo each other.
  app.put("/account/prefs", { onRequest: app.needSession, schema: { body: { type: "object", additionalProperties: false, minProperties: 1,
    properties: { readableFont: { type: "boolean" }, theme: { type: "string", enum: [...THEMES] }, banter: { type: "boolean" } } } } },
    async (req) => writeTx(req.ctx, async trx => {
      const row = await updateLock(req.ctx, trx.selectFrom("users").select("prefs").where("id", "=", req.session.user.id)).executeTakeFirst();
      const prefs = { ...readPrefs(row?.prefs), ...req.body };
      await trx.updateTable("users").set({ prefs: JSON.stringify(prefs) }).where("id", "=", req.session.user.id).execute();
      return prefs;
    }));
  app.post("/account/password", { config: AUTH_LIMIT, onRequest: app.needSession, schema: { body: body({ current: str(256), next: str(256) }) } }, async (req, reply) => {
    await A.changePassword(req.ctx, { userId: req.session.user.id, ...req.body, ip: req.ip });
    app.clearSessionCookie(reply);   // every session ended, this one too: sign in again
    return { ok: true };
  });
}
