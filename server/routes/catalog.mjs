/** The catalog's routes (docs/PLAN-catalog.md §6): signed-in users only, like everything else. Read-only. */
import { searchCatalog } from "../catalog.mjs";

const KEY = "^[A-Za-z0-9_]{1,40}$";
const list = { anyOf: [{ type: "string", pattern: KEY }, { type: "array", maxItems: 40, items: { type: "string", pattern: KEY } }] };
const many = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export default async function catalogRoutes(app) {
  app.addHook("onRequest", app.needSession);
  const none = (reply) => reply.code(503).send({ error: "The catalog isn't loaded on this node.", code: "no-catalog" });

  app.get("/", async (_req, reply) => (app.catalog ? { ...app.catalog.manifest } : none(reply)));
  app.get("/entries", { schema: { querystring: { type: "object", additionalProperties: false, properties: {
    book: list, type: list, q: { type: "string", maxLength: 64 },
    offset: { type: "string", pattern: "^[0-9]{1,6}$" }, limit: { type: "string", pattern: "^([1-9][0-9]?|100)$" } } } } },
  async (req, reply) => (app.catalog ? searchCatalog(app.catalog, { books: many(req.query.book), types: many(req.query.type), q: req.query.q ?? "",
    offset: Number(req.query.offset ?? 0), limit: Number(req.query.limit ?? 50) }) : none(reply)));
  // The id is looked up in a Map: it is never a path, a pattern or part of a query.
  app.get("/entries/:id", { schema: { params: { type: "object", required: ["id"], properties: { id: { type: "string", pattern: "^[A-Za-z0-9._#-]{3,160}$" } } } } },
    async (req, reply) => {
      if (!app.catalog) return none(reply);
      const entry = app.catalog.byId.get(req.params.id);
      return entry ?? reply.code(404).send({ error: "No such entry.", code: "not-found" });
    });
}
