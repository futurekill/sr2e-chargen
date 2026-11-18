/**
 * Restoring a SQLite backup (docs/PLAN-release.md, draft 3): ONE offline command, the server stopped. The backup is
 * copied to a staging file beside the database, cleaned (no sessions, no unused one-time links), verified, the old
 * -wal/-shm removed, and the staging file renamed over the database. The live database is never opened first.
 */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, rmSync, renameSync, existsSync, openSync, fsyncSync, closeSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { SANITIZE } from "./checks.mjs";
import { backupJob, stagingOf, HEARTBEAT_STALE_MS } from "./index.mjs";

const syncPath = (p) => { const fd = openSync(p, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } };
/** Is any server running on this database? Each writes its own heartbeat every 30 s and removes it on stop (r1 #3, r2 #2). */
export function serverAlive(dbFile, now = Date.now()) {
  if (!existsSync(dbFile)) return false;
  const db = new DatabaseSync(dbFile, { readOnly: true, timeout: 5000 });
  try { return db.prepare("SELECT value FROM settings WHERE key LIKE 'server.alive.%'").all().some(r => now - (Number(r.value) || 0) < HEARTBEAT_STALE_MS); }
  catch { return false; }
  finally { db.close(); }
}
export async function restoreSqlite(backupFile, dbFile) {
  if (!existsSync(backupFile)) return { ok: false, problems: [`no such backup: ${backupFile}`] };
  if (serverAlive(dbFile)) return { ok: false, problems: ["the server is running on this database: stop it first (docker compose stop chargen)"] };
  const staging = stagingOf(dbFile);
  try {
    copyFileSync(backupFile, staging);   // inside the cleanup: a failed copy leaves no staging file (r1 #4)
    chmodSync(staging, 0o600);
    const db = new DatabaseSync(staging);
    try { for (const q of SANITIZE) db.exec(q); } finally { db.close(); }
  } catch (err) {
    rmSync(staging, { force: true });   // the live database was never touched
    return { ok: false, problems: [`not a usable backup: ${err.message}`] };
  }
  const check = await backupJob({ action: "verify", file: staging });
  if (!check.ok) { rmSync(staging, { force: true }); return { ok: false, problems: check.problems }; }
  syncPath(staging);
  for (const extra of ["-wal", "-shm"]) rmSync(dbFile + extra, { force: true });
  renameSync(staging, dbFile);
  syncPath(dirname(dbFile));
  return { ok: true, ...check };
}
