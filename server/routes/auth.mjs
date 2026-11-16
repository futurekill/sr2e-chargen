/** Sign-in, links and the account (docs/PLAN-M3.md §4). */
import * as A from "../auth/accounts.mjs";
import { writeTx } from "../db/fence.mjs";
import { deleteSession, deleteUserSessions } from "../auth/sessions.mjs";

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

  app.get("/session", { preHandler: app.needSession }, async (req) => ({ user: req.session.user, csrf: req.session.csrf }));
  app.post("/logout", { preHandler: app.needSession }, async (req, reply) => {
    await writeTx(ctx, trx => deleteSession(trx, req.session.sessionId));
    app.clearSessionCookie(reply);
    return { ok: true };
  });
  app.post("/logout-everywhere", { preHandler: app.needSession }, async (req, reply) => {
    await writeTx(ctx, trx => deleteUserSessions(trx, req.session.user.id));
    app.clearSessionCookie(reply);
    return { ok: true };
  });
  app.post("/account/password", { config: AUTH_LIMIT, preHandler: app.needSession, schema: { body: body({ current: str(256), next: str(256) }) } }, async (req, reply) => {
    await A.changePassword(ctx, { userId: req.session.user.id, ...req.body, ip: req.ip });
    app.clearSessionCookie(reply);   // every session ended, this one too: sign in again
    return { ok: true };
  });
}
