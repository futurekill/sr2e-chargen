/** The library's routes (docs/PLAN-M3.md §5). Every one goes through the session and `ownedDocument`. */
import * as L from "../library.mjs";
import { OPS, cardIds } from "../../shared/creation.mjs";
import { VEHICLE_OPS, vehicleActor } from "../../shared/vehicle.mjs";
import { entryOf } from "../catalog.mjs";
import { toFoundryActor, vehicleToFoundry } from "../../shared/foundry.mjs";
import { renderSheetPdf, processPortraitJob } from "../sheet/index.mjs";
import { checkUpload, PortraitError, MAX_UPLOAD, TYPES } from "../portrait/check.mjs";
import { Refused } from "../auth/accounts.mjs";
import { createHash } from "node:crypto";
import { sheetModel } from "../sheet/model.mjs";
import { statBlock } from "../sheet/markdown.mjs";
import { SHEET_STYLE_KEYS } from "../../shared/sheet-styles.mjs";

const UUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const idParams = { type: "object", required: ["id"], properties: { id: { type: "string", pattern: UUID }, n: { type: "string", pattern: "^[1-9][0-9]{0,8}$" } } };   // no coercion anywhere: numbers in the URL are checked strings
const keyHeader = { type: "object", required: ["idempotency-key"], properties: { "idempotency-key": { type: "string", pattern: UUID } } };
const revisionBody = { type: "object", additionalProperties: false, required: ["revision"], properties: { revision: { type: "integer", minimum: 1 } } };
const updateBody = { ...L.DRAFT_SCHEMA, required: ["name", "revision"], properties: { ...L.DRAFT_SCHEMA.properties, revision: { type: "integer", minimum: 1 } } };
const noQuery = { type: "object", additionalProperties: false };   // a mutation takes no query: nothing outside the fingerprint (review 1 #9)
const BIG = { bodyLimit: 2.5 * 1024 * 1024 };
const characterBody = { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 200 } } };
const vehicleBody = { oneOf: [
  { type: "object", additionalProperties: false, required: ["catalogId"], properties: { catalogId: { type: "string", maxLength: 200 }, name: { type: "string", maxLength: 200 } } },
  // A vehicle designed from scratch (docs/PLAN-workshop.md 2.3).
  { type: "object", additionalProperties: false, required: ["design"], properties: { design: { const: true }, name: { type: "string", maxLength: 200 } } }] };
/** Each operation's exact fields, from the reducer's own list (the reducer checks the values). */
const FIELD = { books: { type: "array", maxItems: 20, uniqueItems: true, items: { type: "string", pattern: "^[a-z0-9-]{1,16}$" } }, string: { type: "string", maxLength: 20000 }, boolean: { type: "boolean" }, integer: { type: "integer", minimum: -1000, maximum: 1000 },
  // A purchase's choices: a few small values; the reducer checks the keys and values per item type (PLAN-M2c §1).
  choices: { type: "object", maxProperties: 4, propertyNames: { pattern: "^[a-zA-Z]{1,20}$" },
    additionalProperties: { anyOf: [{ type: "integer", minimum: 0, maximum: 1000 }, { type: "string", maxLength: 60 }] } },
  // Followers' five archetypes (docs/PLAN-M2d.md): at most five short names.
  // Nuyen after creation (docs/PLAN-M4b.md): whole nuyen within the reducer's bounds.
  money: { type: "integer", minimum: 0, maximum: 10000000 }, signedMoney: { type: "integer", minimum: -10000000, maximum: 10000000 },
  archetypes: { type: "array", maxItems: 5, items: { type: "string", maxLength: 60 } },
  // A Karma advancement's target (docs/PLAN-M4a.md): one of its forms; the system's karmaTransition checks the rest.
  karmaTarget: { type: "object", additionalProperties: false, maxProperties: 4, properties: {
    attribute: { type: "string", maxLength: 20 }, itemId: { type: "string", maxLength: 16 }, tier: { enum: ["general", "concentration", "specialization"] },
    newConcentration: { type: "string", maxLength: 60 }, newSpecialization: { type: "string", maxLength: 60 }, newSkill: { type: "string", maxLength: 160 },
    newCustomSkill: { type: "object", additionalProperties: false, required: ["category", "name"], properties: { category: { type: "string", maxLength: 20 }, name: { type: "string", maxLength: 60 } } },
    gmApproved: { type: "boolean" }, libraryConfirmed: { type: "boolean" } } } };
/** Tighter bounds for some ops' fields (docs/PLAN-M2d.md Draft 2): refused at the door, checked again by the reducer. */
const short = { type: "string", maxLength: 60 }, choice = (...v) => ({ enum: ["", ...v] });
const box = { type: "integer", minimum: 1, maximum: 20 }, track = { enum: ["physical", "stun"] };
const BOUNDS = { setMethod: { method: { enum: ["standard", "sumto10", "points"] } },
  setPoints: { buildingPoints: { type: "integer", minimum: 1, maximum: 1000 }, nuyenTier: { enum: [0, 500, 5000, 90000, 200000, 400000, 650000, 1000000] }, forcePointTrade: { type: "integer", minimum: -15, maximum: 500 } }, setMetatype: { variant: { type: "string", maxLength: 200 } }, damage: { track, boxes: box }, heal: { track, boxes: box }, useAmmo: { rounds: { type: "integer", minimum: 1, maximum: 1000 } },
  installWare: { successes: { type: "integer", minimum: 0, maximum: 30 } }, sellItem: { pct: { enum: [10, 15, 20, 25, 30, 35, 40, 45, 50] }, shownMode: { enum: ["refund", "fence"] } }, nuyen: { note: { type: "string", maxLength: 120 } }, awardKarma: { amount: { type: "integer", minimum: 1, maximum: 200 }, note: { type: "string", maxLength: 120 } }, addExtra: { kind: { enum: ["gang", "follower"] }, name: short },
  setAllergy: { substance: short, rarity: choice("uncommon", "common"), severity: choice("nuisance", "mild", "moderate", "severe"),
    rarityBonus: choice("attributes", "skills", "force", "nuyen"), severityBonus: choice("attributes", "skills", "force", "nuyen") } };
/** Fields an op may leave out (the reducer decides when they are needed): a refund sale has no percentage. */
const garageId = { type: "string", pattern: UUID };
Object.assign(BOUNDS, { buyGarageVehicle: { garageId }, attachVehicle: { garageId }, detachVehicle: { garageId },
  mountWeapon: { kind: { enum: ["hardpoint", "firmpoint"] }, catalogId: { type: "string", maxLength: 200 } }, addGear: { quantity: { type: "integer", minimum: 1, maximum: 99 }, catalogId: { type: "string", maxLength: 200 } },
  unmountWeapon: { itemId: { type: "string", pattern: "^[A-Za-z0-9]{16}$" } }, removeGear: { itemId: { type: "string", pattern: "^[A-Za-z0-9]{16}$" } } });
// A design (PLAN-workshop 2.3): the first, coarse check — plain values at most three levels deep, few keys; the reducer's
// checkChoices is the real one.
const designLeaf = { anyOf: [{ type: "number" }, { type: "boolean" }, { type: "string", maxLength: 64 }] };
const designLevel = (inner) => ({ type: "object", maxProperties: 40, propertyNames: { pattern: "^[A-Za-z]{1,40}$" }, additionalProperties: inner });
const modItemId = { type: "string", pattern: "^[A-Za-z0-9]{16}$" }, modRating = { type: "integer", minimum: 1, maximum: 20 };
Object.assign(BOUNDS, { setDesign: { design: designLevel({ anyOf: [designLeaf, designLevel({ anyOf: [designLeaf, designLevel(designLeaf)] })] }) },
  addDesignMod: { catalogId: { type: "string", maxLength: 200 }, rating: modRating }, setDesignMod: { itemId: modItemId, rating: modRating }, removeDesignMod: { itemId: modItemId },
  mountDesignWeapon: { catalogId: { type: "string", maxLength: 200 }, mountId: modItemId } });
const OPTIONAL = { sellItem: ["pct"], installWare: ["fee", "wound"], setMetatype: ["variant"] };
// One schema for both kinds' operations (the reducer of the document's kind decides); shared names share their fields.
const opSchema = { oneOf: Object.entries({ ...VEHICLE_OPS, ...OPS }).map(([op, fields]) => ({ type: "object", additionalProperties: false, required: ["op", ...Object.keys(fields).filter(k => !OPTIONAL[op]?.includes(k))],
  properties: { op: { const: op }, ...Object.fromEntries(Object.entries(fields).map(([k, t]) => [k, BOUNDS[op]?.[k] ?? FIELD[t]])) } })) };
const opsBody = { type: "object", additionalProperties: false, required: ["revision", "ops"],
  properties: { revision: { type: "integer", minimum: 1 }, ops: { type: "array", minItems: 1, maxItems: 50, items: opSchema } } };

export default async function documentRoutes(app) {
  app.addHook("onRequest", app.needSession);   // before validation: an anonymous caller learns nothing from a 400
  const me = (req) => req.session.user.id, key = (req) => req.headers["idempotency-key"].toLowerCase();

  app.get("/", { schema: { querystring: { type: "object", additionalProperties: false, properties: { deleted: { enum: ["0", "1"] }, archived: { enum: ["0", "1"] }, limit: { type: "string", pattern: "^([1-9][0-9]?|100)$" }, offset: { type: "string", pattern: "^[0-9]{1,6}$" } } } } },
    async (req) => ({ documents: await L.listDocuments(req.ctx, me(req), { deleted: req.query.deleted === "1", archived: req.query.archived === "1", limit: Number(req.query.limit ?? 50), offset: Number(req.query.offset ?? 0) }) }));
  app.post("/", { ...BIG, schema: { headers: keyHeader, querystring: noQuery, body: L.DRAFT_SCHEMA } }, (req) => L.createDraft(req.ctx, me(req), req.body, key(req)));
  // The Foundry connector (docs/PLAN-M7.md): Foundry's own actor JSON, both ways.
  const pinned = () => app.catalog?.manifest?.pins?.find(p => p.id === "sr2e")?.version ?? null;
  app.post("/characters/import", { ...BIG, schema: { headers: keyHeader, querystring: noQuery, body: { type: "object" } } },
    (req) => L.importCharacter(req.ctx, me(req), req.body, key(req), pinned()));
  app.post("/characters", { schema: { headers: keyHeader, querystring: noQuery, body: characterBody } }, (req) => L.createCharacter(req.ctx, me(req), req.body, key(req)));
  app.post("/vehicles", { schema: { headers: keyHeader, querystring: noQuery, body: vehicleBody } }, (req) => L.createVehicle(req.ctx, me(req), req.body, key(req), (cid) => entryOf(app.catalog, cid), app.catalog?.design ?? null));
  app.post("/:id/ops", { schema: { params: idParams, headers: keyHeader, querystring: noQuery, body: opsBody } }, (req) => L.applyOps(req.ctx, me(req), req.params.id, req.body, key(req), (cid) => entryOf(app.catalog, cid), req.session.user.username, (app.catalog?.manifest?.books ?? []).map(x => x.key), app.catalog?.design ?? null));
  app.get("/:id", { schema: { params: idParams } }, (req) => L.getDocument(req.ctx, me(req), req.params.id));
  app.put("/:id", { ...BIG, schema: { params: idParams, headers: keyHeader, querystring: noQuery, body: updateBody } }, (req) => L.updateDraft(req.ctx, me(req), req.params.id, req.body, key(req)));
  app.delete("/:id", { schema: { params: idParams, headers: keyHeader, querystring: noQuery, body: revisionBody } }, (req) => L.deleteDocument(req.ctx, me(req), req.params.id, req.body, key(req)));
  app.post("/:id/archive", { schema: { params: idParams, headers: keyHeader, querystring: noQuery, body: { type: "object", additionalProperties: false, required: ["archived"], properties: { archived: { type: "boolean" } } } } },
    (req) => L.setArchived(req.ctx, me(req), req.params.id, req.body, key(req)));
  app.post("/:id/restore", { schema: { params: idParams, headers: keyHeader, querystring: noQuery, body: revisionBody } }, (req) => L.restoreDocument(req.ctx, me(req), req.params.id, req.body, key(req)));
  app.get("/:id/revisions", { schema: { params: idParams } }, async (req) => ({ revisions: await L.listRevisions(req.ctx, me(req), req.params.id) }));
  app.get("/:id/revisions/:n", { schema: { params: idParams } }, (req) => L.getRevision(req.ctx, me(req), req.params.id, Number(req.params.n)));
  app.post("/:id/revisions/:n/restore", { schema: { params: idParams, headers: keyHeader, querystring: noQuery, body: revisionBody } },
    (req) => L.restoreRevision(req.ctx, me(req), req.params.id, Number(req.params.n), req.body, key(req)));
  // The printable sheet (docs/PLAN-sheet.md): characters only; rate-limited per user, one render at a time server-wide.
  app.get("/:id/sheet.pdf", { config: { rateLimit: { max: 6, timeWindow: "1 minute", keyGenerator: (req) => `sheet:${me(req)}` } },
    schema: { params: idParams, querystring: { type: "object", additionalProperties: false, properties: { paper: { enum: ["letter", "a4"] }, font: { enum: ["standard", "readable"] }, style: { enum: [...SHEET_STYLE_KEYS] } } } } },
  async (req, reply) => {
    const { document, body } = await L.getDocument(req.ctx, me(req), req.params.id);
    if (document.kind !== "character") return reply.code(409).send({ error: "Only a character has a sheet.", code: "wrong-kind" });
    const font = req.query.font ?? (req.session.user.prefs?.readableFont ? "readable" : "standard");   // the user's preference by default
    const portrait = await L.portraitOf(req.ctx, me(req), req.params.id, body);   // the body already fetched (r1 #4, r2 #4)
    body._linked = await L.linkedVehicles(req.ctx.db, me(req), body);   // read now, never stored (PLAN-garage 7)
    const pdf = await renderSheetPdf(body, { paper: req.query.paper ?? "letter", font, style: req.query.style ?? SHEET_STYLE_KEYS[0], portrait });
    reply.header("content-disposition", `inline; filename="sheet-${document.id}.pdf"`).header("cache-control", "no-store").type("application/pdf");
    return pdf;
  });
  // The one-page table card (docs/PLAN-sheet.md slice 4): the chosen rows; refused when they don't fit.
  const sheetQuery = { type: "object", additionalProperties: false, properties: { paper: { enum: ["letter", "a4"] }, font: { enum: ["standard", "readable"] }, style: { enum: [...SHEET_STYLE_KEYS] } } };
  const cardOpts = (req, body, fitOnly) => ({ paper: req.query.paper ?? "letter", style: req.query.style ?? SHEET_STYLE_KEYS[0], card: cardIds(body), fitOnly,
    font: req.query.font ?? (req.session.user.prefs?.readableFont ? "readable" : "standard") });
  const characterOf = async (req, reply) => {
    const { document, body } = await L.getDocument(req.ctx, me(req), req.params.id);
    if (document.kind !== "character") { reply.code(409).send({ error: "Only a character has a table card.", code: "wrong-kind" }); return null; }
    return { document, body };
  };
  const SHEET_LIMIT = { rateLimit: { max: 20, timeWindow: "1 minute", keyGenerator: (req) => `sheet:${me(req)}` } };
  // Fit answers are cached by document revision and print options, so re-checking an unchanged card costs nothing
  // (card r1 #6); a separate, larger per-user limit than printing.
  const fitCache = new Map();
  app.get("/:id/card/fit", { config: { rateLimit: { max: 60, timeWindow: "1 minute", keyGenerator: (req) => `fit:${me(req)}` } }, schema: { params: idParams, querystring: sheetQuery } }, async (req, reply) => {
    const c = await characterOf(req, reply);
    if (!c) return reply;
    const opts = cardOpts(req, c.body, true);
    const key = `${me(req)}:${c.document.id}:${c.document.revision}:${opts.style}:${opts.paper}:${opts.font}`;
    if (fitCache.has(key)) return fitCache.get(key);
    const fit = await renderSheetPdf(c.body, opts);
    fitCache.set(key, fit);
    if (fitCache.size > 500) fitCache.delete(fitCache.keys().next().value);
    return fit;
  });
  app.get("/:id/card.pdf", { config: SHEET_LIMIT, schema: { params: idParams, querystring: sheetQuery } }, async (req, reply) => {
    const c = await characterOf(req, reply);
    if (!c) return reply;
    const pdf = await renderSheetPdf(c.body, cardOpts(req, c.body, false));
    reply.header("content-disposition", `inline; filename="card-${c.document.id}.pdf"`).header("cache-control", "no-store").type("application/pdf");
    return pdf;
  });
  // Portraits (docs/PLAN-portrait.md): the raw image as the body, parsed as a Buffer only inside this plugin.
  const revisionQuery = { type: "object", additionalProperties: false, required: ["revision"], properties: { revision: { type: "string", pattern: "^[1-9][0-9]{0,8}$" } } };
  await app.register(async (sub) => {
    sub.addContentTypeParser(Object.keys(TYPES), { parseAs: "buffer", bodyLimit: MAX_UPLOAD }, (_req, body, done) => done(null, body));
    sub.put("/:id/portrait", { bodyLimit: MAX_UPLOAD, config: { rateLimit: { max: 20, timeWindow: "1 minute", keyGenerator: (req) => `portrait:${me(req)}` } },
      schema: { params: idParams, headers: keyHeader, querystring: revisionQuery } }, async (req) => {
      const revision = Number(req.query.revision);
      const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      const uploadSha = createHash("sha256").update(Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? null))).digest("hex");
      const fp = L.portraitFingerprint(req.params.id, { revision, mime, uploadSha });
      const replay = await L.replayOf(req.ctx, me(req), key(req), fp);
      if (replay) return replay;   // a retried upload gets its first answer (r1 #1), before the revision check
      try { await L.portraitTarget(req.ctx, me(req), req.params.id, revision); }   // the caller's character at that revision (404/409 first)
      catch (e) {
        // An overlapping retry: the first may have committed since the replay check (r2 #1).
        if (e.code === "stale") { const again = await L.replayOf(req.ctx, me(req), key(req), fp); if (again) return again; }
        throw e;
      }
      try { checkUpload(req.body, mime); } catch (e) { if (e instanceof PortraitError) throw new Refused(e.message, e.status, e.code); throw e; }   // before the queue
      const processed = await processPortraitJob(req.body, mime);
      return L.setPortrait(req.ctx, me(req), req.params.id, { revision, mime, uploadSha }, key(req), processed);
    });
  });
  app.post("/:id/portrait/stock", { schema: { params: idParams, headers: keyHeader, querystring: noQuery,
    body: { type: "object", additionalProperties: false, required: ["revision", "stock"], properties: { revision: { type: "integer", minimum: 1 }, stock: { type: "string", pattern: "^[a-z0-9-]{1,40}$" } } } } },
  (req) => L.setStockPortrait(req.ctx, me(req), req.params.id, req.body, key(req)));
  app.delete("/:id/portrait", { schema: { params: idParams, headers: keyHeader, querystring: revisionQuery } },
    (req) => L.removePortrait(req.ctx, me(req), req.params.id, { revision: Number(req.query.revision) }, key(req)));
  app.get("/:id/portrait", { schema: { params: idParams, querystring: { type: "object", additionalProperties: false, properties: { revision: { type: "string", pattern: "^[1-9][0-9]{0,8}$" } } } } },
    async (req, reply) => {
      const webp = await L.getPortrait(req.ctx, me(req), req.params.id, req.query.revision ? Number(req.query.revision) : null);
      if (!webp) return reply.code(404).send({ error: "No portrait.", code: "not-found" });
      reply.header("cache-control", "private, no-store").header("x-content-type-options", "nosniff").header("content-disposition", "inline").type("image/webp");
      return webp;
    });
  app.get("/:id/statblock.md", { schema: { params: idParams } }, async (req, reply) => {
    const { document, body } = await L.getDocument(req.ctx, me(req), req.params.id);
    if (document.kind !== "character") return reply.code(409).send({ error: "Only a character has a stat block.", code: "wrong-kind" });
    body._linked = await L.linkedVehicles(req.ctx.db, me(req), body);
    reply.header("content-disposition", `attachment; filename="statblock-${document.id}.md"`).type("text/markdown; charset=utf-8");
    return statBlock(sheetModel(body));
  });
  const fileName = (n) => String(n).replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "character";
  app.get("/:id/foundry", { schema: { params: idParams } }, async (req, reply) => {
    const { document, body } = await L.getDocument(req.ctx, me(req), req.params.id);
    reply.header("content-disposition", `attachment; filename="fvtt-Actor-${fileName(body.name)}.json"`).type("application/json");
    if (document.kind === "vehicle") return vehicleToFoundry(vehicleActor(body), pinned());   // the Garage (PLAN-garage 8)
    if (document.kind !== "character") return reply.code(404).send({ error: "Only a character or a vehicle exports to Foundry.", code: "not-found" });
    return toFoundryActor(body, pinned());
  });
  app.get("/:id/foundry/vehicles/:key", { schema: { params: { type: "object", required: ["id", "key"], properties: { id: idParams.properties.id, key: { type: "string", pattern: "^v[0-9a-z]{5}$" } } } } }, async (req, reply) => {
    const { document, body } = await L.getDocument(req.ctx, me(req), req.params.id);
    const v = document.kind === "character" && Object.hasOwn(body.creation?.vehicles ?? {}, req.params.key) ? body.creation.vehicles[req.params.key] : null;
    if (!v?.source) return reply.code(404).send({ error: "No such vehicle on this character.", code: "not-found" });
    reply.header("content-disposition", `attachment; filename="fvtt-Actor-${fileName(v.source.name)}.json"`).type("application/json");
    return vehicleToFoundry(v.source, pinned());
  });
  app.get("/:id/download", { schema: { params: idParams } }, async (req, reply) => {
    const { document, body } = await L.getDocument(req.ctx, me(req), req.params.id);
    reply.header("content-disposition", `attachment; filename="${document.id}.json"`).type("application/json");
    return body;
  });
}
