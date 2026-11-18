/**
 * Restoring a SQLite backup (docs/PLAN-release.md, draft 3): ONE offline command, the server stopped. The backup is
 * copied to a staging file beside the database, cleaned (no sessions, no unused one-time links), verified, the old
 * -wal/-shm removed, and the staging file renamed over the database. The live database is never opened first.
 */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, rmSync, renameSync, existsSync, openSync, fsyncSync, closeSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { SANITIZE } from "./checks.mjs";
import { backupJob, stagingOf } from "./index.mjs";

const syncPath = (p) => { const fd = openSync(p, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } };
export async function restoreSqlite(backupFile, dbFile) {
  if (!existsSync(backupFile)) return { ok: false, problems: [`no such backup: ${backupFile}`] };
  const staging = stagingOf(dbFile);
  copyFileSync(backupFile, staging);
  chmodSync(staging, 0o600);
  try {
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
