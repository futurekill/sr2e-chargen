/**
 * What the footer shows (docs/PLAN-help-footer.md 2): the app's version to anyone; the content it runs (the pinned
 * system and modules) only to a signed-in user, like the catalog (r1 #6). Nothing from the environment. (No repository
 * links: the repository is private, so What's new and Report a problem are the app's own pages.)
 */
import { readFileSync } from "node:fs";

const PKG = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

export default async function aboutRoutes(app) {
  const about = Object.freeze({ app: PKG.version });
  app.get("/about", async () => about);
  app.get("/about/content", { onRequest: app.needSession }, async (_req, reply) => {
    const pins = app.catalog?.manifest?.pins;
    if (!pins) return reply.code(503).send({ error: "No catalog on this server.", code: "no-catalog" });
    return { content: pins.map(p => ({ id: p.id, name: p.dir, version: p.version ?? null })) };
  });
}
