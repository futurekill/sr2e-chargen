/**
 * Backups (docs/PLAN-release.md, draft 3): SQLite backs itself up with VACUUM INTO in a child process; the nightly run
 * is claimed with a lease so exactly one server process runs it; old backups are removed only after a new one verified.
 */
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readdirSync, rmSync, mkdirSync, statSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { parseDatabaseUrl } from "../db/index.mjs";

const JOB = fileURLToPath(new URL("./job.mjs", import.meta.url));
export const LEASE_MS = 2 * 3600e3, DAY_MS = 24 * 3600e3, JOB_TIMEOUT_MS = 30 * 60e3;

/** Run one backup job in a child; resolves with its answer (or a failure), after the child is gone. */
export function backupJob(message, timeoutMs = JOB_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const child = fork(JOB, [], { serialization: "advanced", stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let answer = null;
    const timer = setTimeout(() => { answer = { ok: false, problems: ["the backup took too long"] }; child.kill("SIGKILL"); }, timeoutMs);
    child.stderr.resume();
    child.once("message", (m) => { answer ??= m; });
    child.once("close", () => { clearTimeout(timer); resolve(answer ?? { ok: false, problems: ["the backup process failed"] }); });
    child.send(message);
  });
}
/** The SQLite file behind a DATABASE_URL, or null for another database (its own tools back it up). */
export function sqlitePath(url) {
  const t = parseDatabaseUrl(url);
  return t.dialect === "sqlite" && t.path !== ":memory:" ? resolve(t.path) : null;
}
/** BACKUP_DIR must not be inside the data directory (a backup on the same volume isn't one). */
export function backupDirProblem(dir, dbFile) {
  if (!dir) return "BACKUP_DIR is not set";
  const data = resolve(dbFile, "..");
  const rel = relative(data, resolve(dir));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)) ? `BACKUP_DIR (${dir}) is inside the data directory (${data}): use its own volume` : null;
}
export async function createBackup({ databaseUrl, dir }) {
  const db = sqlitePath(databaseUrl);
  if (!db) return { ok: false, problems: ["only a SQLite database is backed up by the app; use the database's own dump tool (docs/OPERATIONS.md)"] };
  const problem = backupDirProblem(dir, db);
  if (problem) return { ok: false, problems: [problem] };
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return backupJob({ action: "create", db, dir: resolve(dir) });
}
/** Keep the newest `keep` complete backups; partial files older than a day are cleaned too. */
export function prune(dir, keep, now = Date.now()) {
  const all = readdirSync(dir);
  const done = all.filter(f => /^chargen-\d{8}T\d{6}Z-[0-9a-f]{6}\.db$/.test(f)).sort();
  for (const f of done.slice(0, Math.max(0, done.length - keep))) rmSync(join(dir, f), { force: true });
  // Partials of a killed job: removed once a day old (a running job's partial is always newer, r1 #5).
  for (const f of all.filter(f => /^\.chargen-.*\.partial$/.test(f))) {
    try { if (now - statSync(join(dir, f)).mtimeMs > DAY_MS) rmSync(join(dir, f), { force: true }); } catch { /* gone meanwhile */ }
  }
  return done.length > keep ? done.length - keep : 0;
}

/** The nightly run: take the lease (empty or expired), back up, record last_ok only after success, then prune. */
export async function nightly(ctx, { databaseUrl, dir, keep = 7, log = () => {} }) {
  const now = ctx.now(), owner = randomUUID();
  const get = async (key) => (await ctx.db.selectFrom("settings").select("value").where("key", "=", key).executeTakeFirst())?.value ?? null;
  for (const key of ["backup.lease", "backup.last_ok"]) {
    if ((await get(key)) == null) await ctx.db.insertInto("settings").values({ key, value: "" }).execute().catch(() => {});   // first run; a racing insert is fine
  }
  const lastOk = Number(await get("backup.last_ok")) || 0;
  if (now - lastOk < DAY_MS) return { ran: false, reason: "not due" };
  const lease = (await get("backup.lease")) ?? "";
  const until = Number(lease.split(":")[1]) || 0;
  if (until > now) return { ran: false, reason: "another process holds the lease" };
  // Conditional: only if the lease is still what we read (so of several processes exactly one wins).
  const r = await ctx.db.updateTable("settings").set({ value: `${owner}:${now + LEASE_MS}` }).where("key", "=", "backup.lease").where("value", "=", lease).executeTakeFirst();
  if (Number(r.numUpdatedRows ?? 0) !== 1) return { ran: false, reason: "another process took the lease" };
  try {
    // Another process may have finished a backup between our first read and the lease (r1 #8).
    if (now - (Number(await get("backup.last_ok")) || 0) < DAY_MS) return { ran: false, reason: "not due" };
    const out = await createBackup({ databaseUrl, dir });
    if (!out.ok) { log(`backup failed: ${out.problems.join("; ")}`); return { ran: true, ok: false, problems: out.problems }; }
    await ctx.db.updateTable("settings").set({ value: String(now) }).where("key", "=", "backup.last_ok").execute();
    const removed = prune(dir, keep);
    return { ran: true, ok: true, file: out.file, removed };
  } finally {
    await ctx.db.updateTable("settings").set({ value: "" }).where("key", "=", "backup.lease").where("value", "like", `${owner}:%`).execute();
  }
}

/** The staging file a SQLite restore writes beside the database; while it exists the server refuses to start. */
export const stagingOf = (dbFile) => `${dbFile}.restore-staging`;

/** A running server's heartbeat (settings `server.alive` = ms), so an offline-only command can refuse (r1 #3). */
export const HEARTBEAT_MS = 30e3, HEARTBEAT_STALE_MS = 90e3;
