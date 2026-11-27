/** Admin: invites and users (docs/PLAN-M3.md §4). The same operations as the CLI, for a signed-in admin. */
import * as A from "../auth/accounts.mjs";
import { getSaleMode, setSaleMode, SALE_MODES } from "../rules-settings.mjs";

const link = (config, secret) => `${config.baseUrl}/redeem#k=${secret}`;   // the secret rides in the fragment: never sent to a server
const params = (name, max = 64) => ({ type: "object", required: [name], properties: { [name]: { type: "string", minLength: 1, maxLength: max } } });

export default async function adminRoutes(app) {
  const { ctx: appCtx, config } = app;
  app.addHook("onRequest", app.needSession);   // before validation: an anonymous caller learns nothing from a 400
  app.addHook("onRequest", app.needAdmin);

  app.get("/invites", async () => ({ invites: await A.listInvites(appCtx) }));
  app.post("/invites", { schema: { body: { type: "object", additionalProperties: false, properties: { role: { enum: ["user", "admin"] } } } } }, async (req) => {
    const t = await A.createInvite(req.ctx, { role: req.body?.role ?? "user", createdBy: req.session.user.id });
    return { id: t.id, expiresAt: t.expiresAt, link: link(config, t.secret) };
  });
  app.delete("/invites/:id", { schema: { params: params("id") } }, async (req) => {
    await A.revokeInvite(req.ctx, req.params.id, { actor: req.session.user.id });
    return { ok: true };
  });
  app.get("/users", async () => ({ users: await A.listUsers(appCtx) }));
  // The GM's rules settings (docs/PLAN-M4b.md, RULINGS R6): how selling pays.
  app.get("/rules", async () => ({ saleMode: await getSaleMode(appCtx.db) }));
  app.put("/rules", { schema: { body: { type: "object", additionalProperties: false, required: ["saleMode"], properties: { saleMode: { enum: SALE_MODES } } } } }, async (req) => {
    await setSaleMode(req.ctx, req.body.saleMode, req.session.user.id);
    return { saleMode: await getSaleMode(appCtx.db) };
  });
  for (const [verb, disabled] of [["disable", true], ["enable", false]]) {
    app.post(`/users/:username/${verb}`, { schema: { params: params("username") } }, async (req) => {
      await A.setDisabled(req.ctx, req.params.username, disabled, { actor: req.session.user.id });
      return { ok: true };
    });
  }
  app.put("/users/:username/role", { schema: { params: params("username"),
    body: { type: "object", additionalProperties: false, required: ["role"], properties: { role: { enum: ["user", "admin"] } } } } }, async (req) => {
    await A.setRole(req.ctx, req.params.username, req.body.role, { actor: req.session.user.id });
    return { ok: true };
  });
  app.post("/users/:username/reset-link", { schema: { params: params("username") } }, async (req) => {
    const t = await A.resetLink(req.ctx, req.params.username, { actor: req.session.user.id });
    return { expiresAt: t.expiresAt, link: `${config.baseUrl}/reset#k=${t.secret}` };
  });
}
