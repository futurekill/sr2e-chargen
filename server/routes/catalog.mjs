/** The catalog's routes (docs/PLAN-catalog.md §6): signed-in users only, like everything else. Read-only. */
import { searchCatalog, entryOf } from "../catalog.mjs";
import { stockPortraits, stockPortrait } from "../portrait/stock.mjs";

const KEY = "^[A-Za-z0-9_]{1,40}$";
const list = { anyOf: [{ type: "string", pattern: KEY }, { type: "array", maxItems: 40, items: { type: "string", pattern: KEY } }] };
const many = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export default async function catalogRoutes(app) {
  app.addHook("onRequest", app.needSession);
  const none = (reply) => reply.code(503).send({ error: "The catalog isn't loaded on this node.", code: "no-catalog" });

  // Premade portraits (the system's pregen art): the list and each image, for any signed-in user.
  app.get("/portraits", async () => ({ portraits: stockPortraits() }));
  app.get("/portraits/:id", { schema: { params: { type: "object", required: ["id"], properties: { id: { type: "string", pattern: "^[a-z0-9-]{1,40}$" } } } } }, async (req, reply) => {
    const webp = stockPortrait(req.params.id);
    if (!webp) return reply.code(404).send({ error: "No such portrait.", code: "not-found" });
    reply.header("cache-control", "private, max-age=86400").header("x-content-type-options", "nosniff").type("image/webp");
    return webp;
  });
  // Rigger 2's vehicle-design tables (docs/PLAN-workshop.md 1.4), for the Workshop's live preview; 404 when none.
  app.get("/design-tables", async (req, reply) => {
    if (!app.catalog) return none(reply);
    const d = app.catalog.design;
    if (!d) return reply.code(404).send({ error: "This server has no Rigger 2 design tables.", code: "not-found" });
    reply.header("cache-control", "private, max-age=3600").header("etag", d.etag);
    if (req.headers["if-none-match"] === d.etag) return reply.code(304).send();
    return { pin: d.pin, chassis: d.chassis, powerPlants: d.powerPlants, fuel: d.fuel, markUp: d.markUp };
  });
  app.get("/", async (_req, reply) => (app.catalog ? { ...app.catalog.manifest, offers: app.catalog.offers ?? {} } : none(reply)));
  app.get("/entries", { schema: { querystring: { type: "object", additionalProperties: false, properties: {
    book: list, type: list, q: { type: "string", maxLength: 64 }, offerable: { enum: ["creation", "play"] },
    offset: { type: "string", pattern: "^[0-9]{1,6}$" }, limit: { type: "string", pattern: "^([1-9][0-9]?|100)$" } } } } },
  async (req, reply) => (app.catalog ? searchCatalog(app.catalog, { books: many(req.query.book), types: many(req.query.type), q: req.query.q ?? "",
    offset: Number(req.query.offset ?? 0), limit: Number(req.query.limit ?? 50), offerable: req.query.offerable ?? null }) : none(reply)));
  // The id is looked up in a Map: it is never a path, a pattern or part of a query.
  app.get("/entries/:id", { schema: { params: { type: "object", required: ["id"], properties: { id: { type: "string", pattern: "^[A-Za-z0-9._#-]{3,160}$" } } } } },
    async (req, reply) => {
      if (!app.catalog) return none(reply);
      const entry = entryOf(app.catalog, req.params.id);
      return entry ?? reply.code(404).send({ error: "No such entry.", code: "not-found" });
    });
}
