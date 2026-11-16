/**
 * The library (docs/PLAN-M3.md §5): documents with revisions. Authorization lives in ONE place (`ownedDocument`);
 * every mutation is idempotent (a key + a fingerprint of the request) and conditional on the revision the client read;
 * quotas are counters changed in the mutation's own transaction.
 * M3a stores one kind, an explicit DRAFT — never something that only looks like a portable character.
 */
import { randomUUID } from "node:crypto";
import { writeTx, changed } from "./db/fence.mjs";
import { Refused } from "./auth/accounts.mjs";
import { sha256 } from "./auth/tokens.mjs";

export const MAX_DOCUMENTS = 200, MAX_BYTES = 500 * 1024 * 1024, MAX_REVISIONS = 50, MAX_BODY_BYTES = 2 * 1024 * 1024;
export const PURGE_AFTER_MS = 30 * 86400e3, KEY_TTL_MS = 86400e3;
export const DRAFT_SCHEMA = { type: "object", additionalProperties: false, required: ["name"],
  properties: { name: { type: "string", minLength: 1, maxLength: 200 }, notes: { type: "string", maxLength: 100000 } } };

const draftBody = ({ name, notes = "" }) => ({ schema: "sr2e-chargen-draft", schemaVersion: 1, name, notes });
const encode = (body) => JSON.stringify(body);
/** The body column, decoded in ONE place: Postgres hands `jsonb` back parsed, SQLite and MySQL hand back text. */
export const decodeBody = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const meta = (d) => ({ id: d.id, kind: d.kind, name: d.name, revision: d.revision, bytes: d.bytes,
  createdAt: Number(d.created_at), updatedAt: Number(d.updated_at), deletedAt: d.deleted_at == null ? null : Number(d.deleted_at) });
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
export function updateDraft(ctx, userId, id, { revision, ...input }, key) {
  return idempotent(ctx, userId, key, fingerprint("PUT", `/documents/${id}`, { revision, ...input }), async trx => {
    const body = draftBody(input), text = encode(body);
    await bump(trx, ctx, userId, id, revision, { name: body.name, body: text, bytes: Buffer.byteLength(text) });
    await appendRevision(trx, ctx, { id, owner_id: userId }, revision + 1, body);
    return answer(trx, userId, id);
  });
}
export function deleteDocument(ctx, userId, id, { revision }, key) {
  return idempotent(ctx, userId, key, fingerprint("DELETE", `/documents/${id}`, { revision }), async trx => {
    await bump(trx, ctx, userId, id, revision, { deleted_at: ctx.now() });
    return answer(trx, userId, id);
  });
}
export function restoreDocument(ctx, userId, id, { revision }, key) {
  return idempotent(ctx, userId, key, fingerprint("POST", `/documents/${id}/restore`, { revision }), async trx => {
    await bump(trx, ctx, userId, id, revision, { deleted_at: null }, { deleted: true });
    return answer(trx, userId, id);
  });
}
/** Bring an old revision back as a NEW revision (history is never rewritten). */
export function restoreRevision(ctx, userId, id, from, { revision }, key) {
  return idempotent(ctx, userId, key, fingerprint("POST", `/documents/${id}/revisions/${from}/restore`, { revision }), async trx => {
    if (!(await ownedDocument(trx, userId, id))) throw GONE();
    const old = await trx.selectFrom("revisions").select("body").where("document_id", "=", id).where("revision", "=", from).executeTakeFirst();
    if (!old) throw new Refused("No such revision.", 404, "not-found");
    const body = decodeBody(old.body), text = encode(body);
    await bump(trx, ctx, userId, id, revision, { name: body.name, body: text, bytes: Buffer.byteLength(text) });
    await appendRevision(trx, ctx, { id, owner_id: userId }, revision + 1, body, `restored from revision ${from}`);
    return answer(trx, userId, id);
  });
}

export async function listDocuments(ctx, userId, { deleted = false, limit = 50, offset = 0 } = {}) {
  let q = ctx.db.selectFrom("documents").select(["id", "kind", "name", "revision", "bytes", "created_at", "updated_at", "deleted_at"]).where("owner_id", "=", userId);
  q = deleted ? q.where("deleted_at", "is not", null) : q.where("deleted_at", "is", null);
  return (await q.orderBy("updated_at", "desc").orderBy("id").limit(Math.min(100, limit)).offset(offset).execute()).map(meta);
}
export async function getDocument(ctx, userId, id) {
  const d = await ownedDocument(ctx.db, userId, id);
  if (!d) throw GONE();
  return { document: meta(d), body: decodeBody(d.body) };
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
    const dead = await trx.selectFrom("documents").select(["id", "owner_id"]).where("deleted_at", "<=", ctx.now() - PURGE_AFTER_MS).execute();
    for (const d of dead) {
      const { n } = await trx.selectFrom("revisions").select(eb => eb.fn.coalesce(eb.fn.sum("bytes"), eb.val(0)).as("n")).where("document_id", "=", d.id).executeTakeFirst();
      await trx.deleteFrom("revisions").where("document_id", "=", d.id).execute();
      await trx.deleteFrom("documents").where("id", "=", d.id).execute();
      await trx.updateTable("users").set(eb => ({ doc_count: eb("doc_count", "-", 1), bytes_used: eb("bytes_used", "-", Number(n)) })).where("id", "=", d.owner_id).execute();
    }
    await trx.deleteFrom("idempotency").where("created_at", "<=", ctx.now() - KEY_TTL_MS).execute();
    return dead.length;
  });
}
