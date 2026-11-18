/** The library's routes (docs/PLAN-M3.md §5). Every one goes through the session and `ownedDocument`. */
import * as L from "../library.mjs";
import { OPS } from "../../shared/creation.mjs";

const UUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const idParams = { type: "object", required: ["id"], properties: { id: { type: "string", pattern: UUID }, n: { type: "string", pattern: "^[1-9][0-9]{0,8}$" } } };   // no coercion anywhere: numbers in the URL are checked strings
const keyHeader = { type: "object", required: ["idempotency-key"], properties: { "idempotency-key": { type: "string", pattern: UUID } } };
const revisionBody = { type: "object", additionalProperties: false, required: ["revision"], properties: { revision: { type: "integer", minimum: 1 } } };
const updateBody = { ...L.DRAFT_SCHEMA, required: ["name", "revision"], properties: { ...L.DRAFT_SCHEMA.properties, revision: { type: "integer", minimum: 1 } } };
const noQuery = { type: "object", additionalProperties: false };   // a mutation takes no query: nothing outside the fingerprint (review 1 #9)
const BIG = { bodyLimit: 2.5 * 1024 * 1024 };
const characterBody = { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 200 } } };
/** Each operation's exact fields, from the reducer's own list (the reducer checks the values). */
const FIELD = { string: { type: "string", maxLength: 20000 }, boolean: { type: "boolean" }, integer: { type: "integer", minimum: -1000, maximum: 1000 } };
const opSchema = { oneOf: Object.entries(OPS).map(([op, fields]) => ({ type: "object", additionalProperties: false, required: ["op", ...Object.keys(fields)],
  properties: { op: { const: op }, ...Object.fromEntries(Object.entries(fields).map(([k, t]) => [k, FIELD[t]])) } })) };
const opsBody = { type: "object", additionalProperties: false, required: ["revision", "ops"],
  properties: { revision: { type: "integer", minimum: 1 }, ops: { type: "array", minItems: 1, maxItems: 50, items: opSchema } } };

export default async function documentRoutes(app) {
  app.addHook("onRequest", app.needSession);   // before validation: an anonymous caller learns nothing from a 400
  const me = (req) => req.session.user.id, key = (req) => req.headers["idempotency-key"].toLowerCase();

  app.get("/", { schema: { querystring: { type: "object", additionalProperties: false, properties: { deleted: { enum: ["0", "1"] }, limit: { type: "string", pattern: "^([1-9][0-9]?|100)$" }, offset: { type: "string", pattern: "^[0-9]{1,6}$" } } } } },
    async (req) => ({ documents: await L.listDocuments(req.ctx, me(req), { deleted: req.query.deleted === "1", limit: Number(req.query.limit ?? 50), offset: Number(req.query.offset ?? 0) }) }));
  app.post("/", { ...BIG, schema: { headers: keyHeader, querystring: noQuery, body: L.DRAFT_SCHEMA } }, (req) => L.createDraft(req.ctx, me(req), req.body, key(req)));
  app.post("/characters", { schema: { headers: keyHeader, querystring: noQuery, body: characterBody } }, (req) => L.createCharacter(req.ctx, me(req), req.body, key(req)));
  app.post("/:id/ops", { schema: { params: idParams, headers: keyHeader, querystring: noQuery, body: opsBody } }, (req) => L.applyOps(req.ctx, me(req), req.params.id, req.body, key(req)));
  app.get("/:id", { schema: { params: idParams } }, (req) => L.getDocument(req.ctx, me(req), req.params.id));
  app.put("/:id", { ...BIG, schema: { params: idParams, headers: keyHeader, querystring: noQuery, body: updateBody } }, (req) => L.updateDraft(req.ctx, me(req), req.params.id, req.body, key(req)));
  app.delete("/:id", { schema: { params: idParams, headers: keyHeader, querystring: noQuery, body: revisionBody } }, (req) => L.deleteDocument(req.ctx, me(req), req.params.id, req.body, key(req)));
  app.post("/:id/restore", { schema: { params: idParams, headers: keyHeader, querystring: noQuery, body: revisionBody } }, (req) => L.restoreDocument(req.ctx, me(req), req.params.id, req.body, key(req)));
  app.get("/:id/revisions", { schema: { params: idParams } }, async (req) => ({ revisions: await L.listRevisions(req.ctx, me(req), req.params.id) }));
  app.get("/:id/revisions/:n", { schema: { params: idParams } }, (req) => L.getRevision(req.ctx, me(req), req.params.id, Number(req.params.n)));
  app.post("/:id/revisions/:n/restore", { schema: { params: idParams, headers: keyHeader, querystring: noQuery, body: revisionBody } },
    (req) => L.restoreRevision(req.ctx, me(req), req.params.id, Number(req.params.n), req.body, key(req)));
  app.get("/:id/download", { schema: { params: idParams } }, async (req, reply) => {
    const { document, body } = await L.getDocument(req.ctx, me(req), req.params.id);
    reply.header("content-disposition", `attachment; filename="${document.id}.json"`).type("application/json");
    return body;
  });
}
