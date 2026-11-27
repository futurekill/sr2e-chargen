/**
 * The library (docs/PLAN-M3.md §5): documents with revisions. Authorization lives in ONE place (`ownedDocument`);
 * every mutation is idempotent (a key + a fingerprint of the request) and conditional on the revision the client read;
 * quotas are counters changed in the mutation's own transaction.
 * Four kinds: a DRAFT (free text, edited whole), a CHARACTER (docs/PLAN-M2.md), a VEHICLE (the Garage,
 * docs/PLAN-garage.md) and an NPC (docs/PLAN-npc-builder.md); all but drafts change only by operations through their
 * shared reducers, so the server stays the authority on what they hold.
 */
import { randomUUID, randomInt } from "node:crypto";
import { writeTx, changed } from "./db/fence.mjs";
import { Refused } from "./auth/accounts.mjs";
import { sha256 } from "./auth/tokens.mjs";
import { newCharacter, applyOp, Refusal, diceFor, validate, garagePurchases } from "../shared/creation.mjs";
import { fromFoundryActor } from "../shared/foundry.mjs";
import { newVehicle, newDesignedVehicle, applyVehicleOp, vehicleActor, vehiclePrice, vehicleBooks } from "../shared/vehicle.mjs";
import { derive } from "../shared/derive.mjs";
import { newNpc, applyNpcOp } from "../shared/npc.mjs";
import { sheetModel } from "./sheet/model.mjs";
import { getSaleMode } from "./rules-settings.mjs";
import { isStock, stockPortrait } from "./portrait/stock.mjs";

export const MAX_DOCUMENTS = 200, MAX_BYTES = 500 * 1024 * 1024, MAX_REVISIONS = 50, MAX_BODY_BYTES = 2 * 1024 * 1024;
export const PURGE_AFTER_MS = 30 * 86400e3, KEY_TTL_MS = 86400e3;
export const DRAFT_SCHEMA = { type: "object", additionalProperties: false, required: ["name"],
  properties: { name: { type: "string", minLength: 1, maxLength: 200 }, notes: { type: "string", maxLength: 100000 } } };

const draftBody = ({ name, notes = "" }) => ({ schema: "sr2e-chargen-draft", schemaVersion: 1, name, notes });
const encode = (body) => JSON.stringify(body);
/** The body column, decoded in ONE place: Postgres hands `jsonb` back parsed, SQLite and MySQL hand back text. */
export const decodeBody = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const meta = (d) => ({ id: d.id, kind: d.kind, name: d.name, revision: d.revision, bytes: d.bytes,
  createdAt: Number(d.created_at), updatedAt: Number(d.updated_at), deletedAt: d.deleted_at == null ? null : Number(d.deleted_at),
  archivedAt: d.archived_at == null ? null : Number(d.archived_at) });
const GONE = () => new Refused("No such document.", 404, "not-found");
const STALE = () => new Refused("Someone changed this — reload and try again.", 409, "stale");

/** THE authorization check: the caller's own document, or null — someone else's and a missing one look the same. */
export async function ownedDocument(db, userId, id) {
  return (await db.selectFrom("documents").selectAll().where("id", "=", id).where("owner_id", "=", userId).executeTakeFirst()) ?? null;
}

/**
 * Run a mutation once per `Idempotency-Key`: the key is claimed with a conflict-safe insert (a plain insert's unique
 * error would abort a Postgres transaction); a replay of the same request returns the stored answer; the same key
 * on a different request is refused. `fn(trx)` returns the JSON answer.
 */
export function idempotent(ctx, userId, key, fingerprint, fn) {
  return writeTx(ctx, async trx => {
    const row = { user_id: userId, key, fingerprint, created_at: ctx.now() };
    const ins = ctx.dialect === "mysql" ? trx.insertInto("idempotency").ignore().values(row)
      : trx.insertInto("idempotency").values(row).onConflict(oc => oc.columns(["user_id", "key"]).doNothing());
    const r = await ins.executeTakeFirst();
    if (Number(r?.numInsertedOrUpdatedRows ?? 0) !== 1) {
      let q = trx.selectFrom("idempotency").selectAll().where("user_id", "=", userId).where("key", "=", key);
      if (ctx.dialect !== "sqlite") q = q.forUpdate();   // a locking read: current data on every dialect
      const prior = await q.executeTakeFirst();
      if (!prior || prior.fingerprint !== fingerprint) throw new Refused("That key was used for another request.", 422, "key-reused");
      return JSON.parse(prior.response);
    }
    const answer = await fn(trx);
    await trx.updateTable("idempotency").set({ status: 200, response: JSON.stringify(answer) }).where("user_id", "=", userId).where("key", "=", key).execute();
    return answer;
  });
}
export const fingerprint = (method, path, body) => sha256(`${method}\n${path}\n${JSON.stringify(body ?? null)}`);

/** Move the user's counters, or refuse: the conditional UPDATE is the quota check, so concurrent writers can't both pass. */
async function charge(trx, userId, { docs = 0, bytes = 0 }) {
  if (!docs && !bytes) return;   // nothing moves (a revision exactly replacing a pruned one)
  let q = trx.updateTable("users").set(eb => ({ doc_count: eb("doc_count", "+", docs), bytes_used: eb("bytes_used", "+", bytes) })).where("id", "=", userId);
  if (docs > 0) q = q.where("doc_count", "<=", MAX_DOCUMENTS - docs);
  if (bytes > 0) q = q.where("bytes_used", "<=", MAX_BYTES - bytes);
  if (changed(await q.executeTakeFirst()) !== 1) throw new Refused(docs > 0 ? `Your library is full (${MAX_DOCUMENTS} documents). Delete something first.` : "You're out of storage. Delete something first.", 409, "quota");
}
/** Append a revision, prune beyond MAX_REVISIONS (the first is always kept), and charge the difference. */
async function appendRevision(trx, ctx, doc, revision, body, note = null) {
  const text = encode(body), bytes = Buffer.byteLength(text);
  if (bytes > MAX_BODY_BYTES) throw new Refused("That document is too big.", 413, "too-big");
  await trx.insertInto("revisions").values({ document_id: doc.id, revision, body: text, bytes, note, created_at: ctx.now() }).execute();
  const kept = await trx.selectFrom("revisions").select(["revision", "bytes"]).where("document_id", "=", doc.id).orderBy("revision", "desc").execute();
  const prune = kept.slice(MAX_REVISIONS - 1).filter(r => r.revision !== 1);   // newest 49 + the first
  let freed = 0;
  if (kept.length > MAX_REVISIONS && prune.length) {
    const drop = prune.slice(0, kept.length - MAX_REVISIONS);
    freed = drop.reduce((n, r) => n + r.bytes, 0);
    await trx.deleteFrom("revisions").where("document_id", "=", doc.id).where("revision", "in", drop.map(r => r.revision)).execute();
  }
  await charge(trx, doc.owner_id, { bytes: bytes - freed });
  return { text, bytes };
}
/** The conditional write: only if the document is still at the revision the client read. */
async function bump(trx, ctx, userId, id, revision, set, { deleted = false } = {}) {
  let q = trx.updateTable("documents").set({ ...set, revision: revision + 1, updated_at: ctx.now() })
    .where("id", "=", id).where("owner_id", "=", userId).where("revision", "=", revision);
  q = deleted ? q.where("deleted_at", "is not", null) : q.where("deleted_at", "is", null);
  if (changed(await q.executeTakeFirst()) === 1) return;
  throw (await ownedDocument(trx, userId, id)) ? STALE() : GONE();
}
/** Every step that advances the revision has its row in the history, a delete and a restore included (review 1 #7). */
async function appendSame(trx, ctx, userId, id, revision, note) {
  const doc = await ownedDocument(trx, userId, id);
  await appendRevision(trx, ctx, { id, owner_id: userId }, revision, decodeBody(doc.body), note);
}
const answer = async (trx, userId, id) => ({ document: meta(await ownedDocument(trx, userId, id)) });

export function createDraft(ctx, userId, input, key) {
  return idempotent(ctx, userId, key, fingerprint("POST", "/documents", input), async trx => {
    const id = randomUUID(), now = ctx.now(), body = draftBody(input);
    await charge(trx, userId, { docs: 1 });
    const doc = { id, owner_id: userId, kind: "draft", name: body.name, revision: 1, body: encode(body), bytes: Buffer.byteLength(encode(body)), created_at: now, updated_at: now, deleted_at: null };
    await trx.insertInto("documents").values(doc).execute();
    await appendRevision(trx, ctx, doc, 1, body, "created");
    return answer(trx, userId, id);
  });
}
/** A creation step refused (impossible, not merely against the rules) is the client's error, with its reason. */
const refusal = (e) => (e instanceof Refusal ? new Refused(e.message, 422, "refused") : e);
/** The live document at the revision the client read, of the kind the route is for. */
async function current(trx, userId, id, revision, kind) {
  const doc = await ownedDocument(trx, userId, id);
  if (!doc) throw GONE();
  if (doc.revision !== revision || doc.deleted_at != null) throw STALE();   // a deleted document isn't editable
  const kinds = Array.isArray(kind) ? kind : [kind];
  if (!kinds.includes(doc.kind)) throw new Refused(kind === "draft" ? "A character, vehicle or NPC changes only step by step." : kind === "npc" ? "That isn't an NPC." : "That isn't a character.", 409, "wrong-kind");
  return doc;
}

/**
 * Garage vehicles by id, as an operation or a read may use them (docs/PLAN-garage.md 7): only this user's LIVE vehicle
 * documents (not deleted, not archived). `{ id: { name, revision, source, price, unfinished, books } }`, priced with the
 * server's design tables in the caller's transaction (PLAN-workshop 3.2); anything else is simply absent.
 */
export async function garageOf(db, userId, ids, tables = null) {
  const want = [...new Set(ids)].filter(x => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x));
  if (!want.length) return {};
  const rows = await db.selectFrom("documents").select(["id", "revision", "body"]).where("owner_id", "=", userId).where("kind", "=", "vehicle")
    .where("deleted_at", "is", null).where("archived_at", "is", null).where("id", "in", want).execute();
  return Object.fromEntries(rows.map(r => { const b = decodeBody(r.body); const p = vehiclePrice(b, tables);
    return [r.id, { name: b.name, revision: r.revision, source: vehicleActor(b), price: p.total, unfinished: p.unfinished, books: vehicleBooks(b) }]; }));
}
/**
 * The character's linked garage vehicles not also bought (a bought one shows once, as the purchase; r2 #2). A link to a
 * vehicle that is gone (deleted, archived, never yours) is a placeholder with no contents (code review r1 #4).
 */
export async function linkedVehicles(db, userId, body) {
  const bought = garagePurchases(body);   // at creation or in play (PLAN-play-vehicles 2)
  const links = (Array.isArray(body.links) ? body.links : []).filter(x => typeof x === "string" && !bought.has(x));
  const g = await garageOf(db, userId, links);
  return links.map(id => ({ garageId: id, source: g[id]?.source ?? { name: "Vehicle unavailable (deleted or archived)", system: {}, items: [] } }));
}

export function createVehicle(ctx, userId, { catalogId, name, design }, key, lookup = () => null, tables = null) {
  return idempotent(ctx, userId, key, fingerprint("POST", "/documents/vehicles", { catalogId, name, design }), async trx => {
    let body;
    try { body = design ? newDesignedVehicle(tables, name) : newVehicle(lookup(catalogId), name); } catch (e) { throw refusal(e); }
    const id = randomUUID(), now = ctx.now(), text = encode(body);
    await charge(trx, userId, { docs: 1 });
    const doc = { id, owner_id: userId, kind: "vehicle", name: body.name, revision: 1, body: text, bytes: Buffer.byteLength(text), created_at: now, updated_at: now, deleted_at: null };
    await trx.insertInto("documents").values(doc).execute();
    await appendRevision(trx, ctx, doc, 1, body, "created");
    return { ...(await answer(trx, userId, id)), body };
  });
}

/** A new NPC (docs/PLAN-npc-builder.md 2): blank, or from a book NPC's complete source (`npcRecord(catalogId)`). */
export function createNpc(ctx, userId, { catalogId = null, name }, key, npcRecord = () => null) {
  return idempotent(ctx, userId, key, fingerprint("POST", "/documents/npcs", { catalogId, name }), async trx => {
    let body;
    try {
      const rec = catalogId ? npcRecord(catalogId) : null;
      if (catalogId && !rec) throw new Refusal("That book NPC isn't available on this server.");
      body = newNpc(rec, name, catalogId);
    } catch (e) { throw refusal(e); }
    const id = randomUUID(), now = ctx.now(), text = encode(body);
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new Refused("That NPC is too big to store.", 413, "too-big");
    await charge(trx, userId, { docs: 1 });
    const doc = { id, owner_id: userId, kind: "npc", name: body.name, revision: 1, body: text, bytes: Buffer.byteLength(text), created_at: now, updated_at: now, deleted_at: null };
    await trx.insertInto("documents").values(doc).execute();
    await appendRevision(trx, ctx, doc, 1, body, "created");
    return { ...(await answer(trx, userId, id)), body };
  });
}
/** Apply NPC operations, in order, as ONE new revision; any refusal refuses them all (their own route and schema). */
export function applyNpcOps(ctx, userId, id, { revision, ops }, key, lookup = () => null) {
  return idempotent(ctx, userId, key, fingerprint("POST", `/documents/${id}/npc-ops`, { revision, ops }), async trx => {
    const doc = await current(trx, userId, id, revision, "npc");
    let body = decodeBody(doc.body);
    try { for (const op of ops) body = applyNpcOp(body, op, lookup); } catch (e) { throw refusal(e); }
    const text = encode(body);
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new Refused("That NPC is too big to store.", 413, "too-big");
    await bump(trx, ctx, userId, id, revision, { name: body.name, body: text, bytes: Buffer.byteLength(text) });
    await appendRevision(trx, ctx, { id, owner_id: userId }, revision + 1, body, ops.map(o => o.op).join(", ").slice(0, 200));
    return { ...(await answer(trx, userId, id)), body };
  });
}

export function createCharacter(ctx, userId, { name }, key) {
  return idempotent(ctx, userId, key, fingerprint("POST", "/documents/characters", { name }), async trx => {
    let body;
    try { body = newCharacter(name); } catch (e) { throw refusal(e); }
    const id = randomUUID(), now = ctx.now(), text = encode(body);
    await charge(trx, userId, { docs: 1 });
    const doc = { id, owner_id: userId, kind: "character", name: body.name, revision: 1, body: text, bytes: Buffer.byteLength(text), created_at: now, updated_at: now, deleted_at: null };
    await trx.insertInto("documents").values(doc).execute();
    await appendRevision(trx, ctx, doc, 1, body, "created");
    return { ...(await answer(trx, userId, id)), body };
  });
}
/**
 * A finished character from a Foundry actor file (docs/PLAN-M7.md): checked, read once by derive and validate (a
 * throw refuses it: "can't be read"), then stored like a new character.
 */
export function importCharacter(ctx, userId, json, key, pinnedVersion) {
  return idempotent(ctx, userId, key, fingerprint("POST", "/documents/characters/import", { file: sha256(JSON.stringify(json)) }), async trx => {
    let body;
    try { body = fromFoundryActor(json, { pinnedVersion, now: ctx.now() }); } catch (e) { throw refusal(e); }
    let errors;   // derive, the rules check and the sheet all read it once; a throw refuses it (code review r1 #3)
    try { derive({ actor: body.actor }); sheetModel(body); errors = validate(body).problems.filter(p => p.severity === "error"); }
    catch { throw new Refused("This character can't be read by the app: export it again from Foundry, or build it here.", 422, "refused"); }
    if (errors.length) throw new Refused(`It breaks the rules: ${errors[0].text}`, 422, "refused");   // code review r1 #4
    const id = randomUUID(), now = ctx.now(), text = encode(body);
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new Refused("That character is too big to store.", 413, "too-big");
    await charge(trx, userId, { docs: 1 });
    const doc = { id, owner_id: userId, kind: "character", name: body.name, revision: 1, body: text, bytes: Buffer.byteLength(text), created_at: now, updated_at: now, deleted_at: null };
    await trx.insertInto("documents").values(doc).execute();
    await appendRevision(trx, ctx, doc, 1, body, "imported from Foundry");
    return { ...(await answer(trx, userId, id)), body };
  });
}
/** Apply creation operations, in order, as ONE new revision; any refusal refuses them all. */
export function applyOps(ctx, userId, id, { revision, ops }, key, lookup = () => null, by = "", catalogBooks = [], tables = null) {
  return idempotent(ctx, userId, key, fingerprint("POST", `/documents/${id}/ops`, { revision, ops }), async trx => {
    const doc = await current(trx, userId, id, revision, ["character", "vehicle"]);
    let body = decodeBody(doc.body);
    if (doc.kind === "vehicle") {
      try { for (const op of ops) body = applyVehicleOp(body, op, lookup, { tables }); } catch (e) { throw refusal(e); }
      const text = encode(body);
      await bump(trx, ctx, userId, id, revision, { name: body.name, body: text, bytes: Buffer.byteLength(text) });
      await appendRevision(trx, ctx, { id, owner_id: userId }, revision + 1, body, ops.map(o => o.op).join(", ").slice(0, 200));
      return { ...(await answer(trx, userId, id)), body, usedBy: await usersOfVehicle(trx, userId, id) };   // r1 #9
    }
    // Garage vehicles the ops name, read in THIS transaction (docs/PLAN-garage.md 7): a purchase snapshots them.
    const garageIds = ops.filter(o => o.op === "buyGarageVehicle" || o.op === "attachVehicle" || (o.op === "buyVehicle" && o.garageId)).map(o => o.garageId);
    const garage = await garageOf(trx, userId, garageIds, tables);
    // A gang's members and the finish roll (docs/PLAN-M2d.md Draft 2): rolled HERE, inside the idempotent write and
    // after its replay check, never taken from the request. ctx.randomInt lets tests fix the dice.
    const d6 = () => (ctx.randomInt ?? randomInt)(1, 7);
    const roll = (n) => Array.from({ length: n }, d6).reduce((t, x) => t + x, 0);
    // The GM's sale mode, read INSIDE this transaction (PLAN-M4b Draft 3, r2 #5): never a value the client sent.
    const saleMode = ops.some(o => o.op === "sellItem" || o.op === "sellVehicle") ? await getSaleMode(trx) : "refund";
    try { for (const op of ops) body = applyOp(body, op, lookup, { roll: diceFor(op) ? roll(diceFor(op)) : null, now: ctx.now(), saleMode, by, catalogBooks, garage: (gid) => garage[gid] ?? null }); } catch (e) { throw refusal(e); }
    const text = encode(body);
    await bump(trx, ctx, userId, id, revision, { name: body.name, body: text, bytes: Buffer.byteLength(text) });
    await appendRevision(trx, ctx, { id, owner_id: userId }, revision + 1, body, ops.map(o => o.op).join(", ").slice(0, 200));
    return { ...(await answer(trx, userId, id)), body };
  });
}

export function updateDraft(ctx, userId, id, { revision, ...input }, key) {
  return idempotent(ctx, userId, key, fingerprint("PUT", `/documents/${id}`, { revision, ...input }), async trx => {
    await current(trx, userId, id, revision, "draft");
    const body = draftBody(input), text = encode(body);
    await bump(trx, ctx, userId, id, revision, { name: body.name, body: text, bytes: Buffer.byteLength(text) });
    await appendRevision(trx, ctx, { id, owner_id: userId }, revision + 1, body);
    return answer(trx, userId, id);
  });
}
export function deleteDocument(ctx, userId, id, { revision }, key) {
  return idempotent(ctx, userId, key, fingerprint("DELETE", `/documents/${id}`, { revision }), async trx => {
    await bump(trx, ctx, userId, id, revision, { deleted_at: ctx.now() });
    await appendSame(trx, ctx, userId, id, revision + 1, "deleted");
    return answer(trx, userId, id);
  });
}
export function restoreDocument(ctx, userId, id, { revision }, key) {
  return idempotent(ctx, userId, key, fingerprint("POST", `/documents/${id}/restore`, { revision }), async trx => {
    await bump(trx, ctx, userId, id, revision, { deleted_at: null }, { deleted: true });
    await appendSame(trx, ctx, userId, id, revision + 1, "restored");
    return answer(trx, userId, id);
  });
}
/**
 * Archive or unarchive: a view setting, not an edit — no revision, no history row, so an open page never goes stale.
 * Setting the state it already has is a no-op. A deleted document can't be archived (restore it first).
 */
export function setArchived(ctx, userId, id, { archived }, key) {
  return idempotent(ctx, userId, key, fingerprint("POST", `/documents/${id}/archive`, { archived }), async trx => {
    await trx.updateTable("documents").set({ archived_at: archived ? ctx.now() : null })
      .where("id", "=", id).where("owner_id", "=", userId).where("deleted_at", "is", null)
      .where("archived_at", archived ? "is" : "is not", null).executeTakeFirst();
    const doc = await ownedDocument(trx, userId, id);
    if (!doc || doc.deleted_at != null) throw GONE();
    return { document: meta(doc) };
  });
}
/** Bring an old revision back as a NEW revision (history is never rewritten). */
export function restoreRevision(ctx, userId, id, from, { revision }, key) {
  return idempotent(ctx, userId, key, fingerprint("POST", `/documents/${id}/revisions/${from}/restore`, { revision }), async trx => {
    const doc = await ownedDocument(trx, userId, id);
    if (!doc) throw GONE();
    const old = await trx.selectFrom("revisions").select("body").where("document_id", "=", id).where("revision", "=", from).executeTakeFirst();
    if (!old) throw new Refused("No such revision.", 404, "not-found");
    const body = decodeBody(old.body), text = encode(body);
    // A restore never undoes a finish (docs/PLAN-M2.md §5b): changes after creation are milestone 4's.
    if (doc.kind === "character" && (decodeBody(doc.body).creation?.finished || body.creation?.finished))
      throw new Refused("A finished character can't go back to another revision.", 409, "finished");
    await bump(trx, ctx, userId, id, revision, { name: body.name, body: text, bytes: Buffer.byteLength(text) });
    await appendRevision(trx, ctx, { id, owner_id: userId }, revision + 1, body, `restored from revision ${from}`);
    return answer(trx, userId, id);
  });
}

export async function listDocuments(ctx, userId, { deleted = false, archived = false, limit = 50, offset = 0 } = {}) {
  let q = ctx.db.selectFrom("documents").select(["id", "kind", "name", "revision", "bytes", "created_at", "updated_at", "deleted_at", "archived_at"]).where("owner_id", "=", userId);
  q = deleted ? q.where("deleted_at", "is not", null) : q.where("deleted_at", "is", null);
  if (!deleted) q = archived ? q.where("archived_at", "is not", null) : q.where("archived_at", "is", null);   // the trash lists both
  return (await q.orderBy("updated_at", "desc").orderBy("id").limit(Math.min(100, limit)).offset(offset).execute()).map(meta);
}
export async function getDocument(ctx, userId, id) {
  const d = await ownedDocument(ctx.db, userId, id);
  if (!d) throw GONE();
  return { document: meta(d), body: decodeBody(d.body), ...(d.kind === "vehicle" ? { usedBy: await usersOfVehicle(ctx.db, userId, id) } : {}) };
}
/** The owner's live characters that bought or link a garage vehicle (the vehicle page shows them; PLAN-garage 9). */
async function usersOfVehicle(db, userId, vid) {
  const rows = await db.selectFrom("documents").select(["id", "name", "body"]).where("owner_id", "=", userId).where("kind", "=", "character").where("deleted_at", "is", null).execute();
  return rows.map(r => {
    const b = decodeBody(r.body), buy = [...Object.values(b.creation?.vehicles ?? {}), ...Object.values(b.vehicles ?? {})].find(v => v.garageId === vid);
    return (buy || (Array.isArray(b.links) && b.links.includes(vid))) ? { id: r.id, name: r.name, bought: buy?.garageRevision ?? null } : null;
  }).filter(Boolean);
}
export async function listRevisions(ctx, userId, id) {
  if (!(await ownedDocument(ctx.db, userId, id))) throw GONE();
  const rows = await ctx.db.selectFrom("revisions").select(["revision", "bytes", "note", "created_at"]).where("document_id", "=", id).orderBy("revision", "desc").execute();
  return rows.map(r => ({ revision: r.revision, bytes: r.bytes, note: r.note, createdAt: Number(r.created_at) }));
}
export async function getRevision(ctx, userId, id, revision) {
  if (!(await ownedDocument(ctx.db, userId, id))) throw GONE();
  const r = await ctx.db.selectFrom("revisions").selectAll().where("document_id", "=", id).where("revision", "=", revision).executeTakeFirst();
  if (!r) throw new Refused("No such revision.", 404, "not-found");
  return { revision: r.revision, note: r.note, createdAt: Number(r.created_at), body: decodeBody(r.body) };
}

/** The sweep (startup and daily): documents deleted 30 days ago go for good, with their bytes; old keys expire. */
export function purge(ctx) {
  return writeTx(ctx, async trx => {
    const cutoff = ctx.now() - PURGE_AFTER_MS;
    const dead = await trx.selectFrom("documents").select(["id", "owner_id"]).where("deleted_at", "<=", cutoff).execute();
    let purged = 0;
    for (const d of dead) {
      const sum = async (table) => Number((await trx.selectFrom(table).select(eb => eb.fn.coalesce(eb.fn.sum("bytes"), eb.val(0)).as("n")).where("document_id", "=", d.id).executeTakeFirst()).n);
      const bytes = (await sum("revisions")) + (await sum("assets"));
      // The document goes FIRST and only if it is still deleted and old: a restore landing in between keeps it whole
      // (docs/PLAN-portrait.md r1 #7, r2 #2). Its revisions and assets go by the foreign keys' cascade.
      if (changed(await trx.deleteFrom("documents").where("id", "=", d.id).where("deleted_at", "<=", cutoff).executeTakeFirst()) !== 1) continue;
      await trx.updateTable("users").set(eb => ({ doc_count: eb("doc_count", "-", 1), bytes_used: eb("bytes_used", "-", bytes) })).where("id", "=", d.owner_id).execute();
      purged++;
    }
    await trx.deleteFrom("idempotency").where("created_at", "<=", ctx.now() - KEY_TTL_MS).execute();
    return purged;
  });
}

/* ── Portraits (docs/PLAN-portrait.md) ─────────────────────────────────────────────────────────────────────────── */
export const MAX_PORTRAITS = 5;
/** A driver's binary value as a Buffer (Postgres and MySQL give Buffers, node:sqlite a Uint8Array). */
const asBuffer = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v));

/** A request already answered under this key: its stored answer (a replay), or null when the key is new. */
export async function replayOf(ctx, userId, key, fp) {
  const prior = await ctx.db.selectFrom("idempotency").selectAll().where("user_id", "=", userId).where("key", "=", key).executeTakeFirst();
  if (!prior || prior.response == null) return null;
  if (prior.fingerprint !== fp) throw new Refused("That key was used for another request.", 422, "key-reused");
  return JSON.parse(prior.response);
}
export const portraitFingerprint = (id, { revision, mime, uploadSha }) => fingerprint("PUT", `/documents/${id}/portrait`, { revision, mime, uploadSha });

/** A character's portrait is about to be processed: is it the caller's character, at that revision? (cheap, before the slow work) */
export async function portraitTarget(ctx, userId, id, revision) {
  const doc = await ownedDocument(ctx.db, userId, id);
  if (!doc || doc.deleted_at != null) throw GONE();
  if (doc.kind !== "character") throw new Refused("Only a character has a portrait.", 409, "wrong-kind");
  if (doc.revision !== revision) throw STALE();
}
/** Store a processed portrait and point the character at it, as ONE new revision; keep the newest MAX_PORTRAITS. */
export function setPortrait(ctx, userId, id, { revision, mime, uploadSha }, key, { webp, sha256 }) {
  return idempotent(ctx, userId, key, portraitFingerprint(id, { revision, mime, uploadSha }), async trx => {
    const doc = await current(trx, userId, id, revision, "character");
    // Keep the newest MAX_PORTRAITS INCLUDING this one: evict first and free what was actually deleted, so a full
    // account can still replace a portrait with one of the same size (r1 #3).
    const old = (await trx.selectFrom("assets").select(["id", "bytes"]).where("document_id", "=", id).orderBy("created_at", "desc").orderBy("id", "desc").execute()).slice(MAX_PORTRAITS - 1);
    let freed = 0;
    for (const a of old) if (changed(await trx.deleteFrom("assets").where("id", "=", a.id).where("document_id", "=", id).executeTakeFirst()) === 1) freed += Number(a.bytes);
    if (freed) await charge(trx, userId, { bytes: -freed });
    // Strictly after the document's last asset, so "newest five" never depends on two uploads in one millisecond.
    const last = await trx.selectFrom("assets").select(eb => eb.fn.max("created_at").as("t")).where("document_id", "=", id).executeTakeFirst();
    const assetId = randomUUID(), now = Math.max(ctx.now(), Number(last?.t ?? 0) + 1);
    await trx.insertInto("assets").values({ id: assetId, owner_id: userId, document_id: id, kind: "portrait", data: webp, bytes: webp.length, sha256, created_at: now }).execute();
    await charge(trx, userId, { bytes: webp.length });
    const body = decodeBody(doc.body);
    body.creation.portrait = { assetId };
    const text = encode(body);
    await bump(trx, ctx, userId, id, revision, { body: text, bytes: Buffer.byteLength(text) });
    await appendRevision(trx, ctx, { id, owner_id: userId }, revision + 1, body, "portrait");
    return { ...(await answer(trx, userId, id)), body };
  });
}
/** Point the character at a premade portrait (no upload, nothing stored, no quota): one new revision. */
export function setStockPortrait(ctx, userId, id, { revision, stock }, key) {
  return idempotent(ctx, userId, key, fingerprint("POST", `/documents/${id}/portrait/stock`, { revision, stock }), async trx => {
    if (!isStock(stock)) throw new Refused("No such premade portrait.", 422, "portrait-stock");
    const doc = await current(trx, userId, id, revision, "character");
    const body = decodeBody(doc.body);
    body.creation.portrait = { stock };
    const text = encode(body);
    await bump(trx, ctx, userId, id, revision, { body: text, bytes: Buffer.byteLength(text) });
    await appendRevision(trx, ctx, { id, owner_id: userId }, revision + 1, body, `portrait: ${stock}`);
    return { ...(await answer(trx, userId, id)), body };
  });
}
export function removePortrait(ctx, userId, id, { revision }, key) {
  return idempotent(ctx, userId, key, fingerprint("DELETE", `/documents/${id}/portrait`, { revision }), async trx => {
    const doc = await current(trx, userId, id, revision, "character");
    const body = decodeBody(doc.body);
    body.creation.portrait = null;
    const text = encode(body);
    await bump(trx, ctx, userId, id, revision, { body: text, bytes: Buffer.byteLength(text) });
    await appendRevision(trx, ctx, { id, owner_id: userId }, revision + 1, body, "portrait removed");
    return { ...(await answer(trx, userId, id)), body };
  });
}
/** The portrait's WebP for the current (or a given) revision: only an asset of THIS document and owner; else null. */
export async function getPortrait(ctx, userId, id, revision = null) {
  const doc = await ownedDocument(ctx.db, userId, id);
  if (!doc) throw GONE();
  let body = decodeBody(doc.body);
  if (revision != null) {
    const r = await ctx.db.selectFrom("revisions").select("body").where("document_id", "=", id).where("revision", "=", revision).executeTakeFirst();
    if (!r) throw new Refused("No such revision.", 404, "not-found");
    body = decodeBody(r.body);
  }
  return portraitOf(ctx, userId, id, body);
}
/** The portrait a body points at (premade, or an asset of THIS document and owner), or null. */
export async function portraitOf(ctx, userId, id, body) {
  const stock = body?.creation?.portrait?.stock;
  if (typeof stock === "string") return stockPortrait(stock);
  const assetId = body?.creation?.portrait?.assetId;
  if (typeof assetId !== "string") return null;
  const row = await ctx.db.selectFrom("assets").select("data").where("id", "=", assetId).where("document_id", "=", id).where("owner_id", "=", userId).executeTakeFirst();
  return row ? asBuffer(row.data) : null;
}
