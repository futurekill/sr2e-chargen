/**
 * What a backup must hold (docs/PLAN-release.md): checks over plain SQL rows, the same for a SQLite backup file and a
 * restored Postgres/MySQL database. `all(sql)` returns the rows of a read-only query.
 */
import { createHash } from "node:crypto";
import { MIGRATIONS } from "../db/index.mjs";

const n = (v) => Number(v ?? 0);
const asBuffer = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v));

export async function checkBackup(all, { sqlite = false } = {}) {
  const problems = [];
  if (sqlite) {
    const ic = (await all("PRAGMA integrity_check")).map(r => Object.values(r)[0]);
    if (ic.join() !== "ok") problems.push(`integrity check: ${ic.slice(0, 3).join("; ")}`);
    // integrity_check doesn't look at foreign keys (r1 #6).
    const fk = await all("PRAGMA foreign_key_check");
    if (fk.length) problems.push(`foreign keys: ${fk.length} row(s) point at nothing (e.g. ${fk[0].table})`);
  }
  const applied = (await all("SELECT name FROM migrations ORDER BY name")).map(r => r.name);
  const known = Object.keys(MIGRATIONS).sort();
  if (applied.join() !== known.join()) problems.push(`schema: the backup has migrations [${applied.join(", ")}], this build [${known.join(", ")}]`);
  // One portrait in memory at a time (r1 #7): list, then read each by its id (a checked UUID).
  for (const a of await all("SELECT id, sha256, bytes FROM assets ORDER BY id")) {
    if (!/^[0-9a-f-]{36}$/i.test(a.id)) { problems.push(`asset ${a.id}: not an id`); continue; }
    const row = (await all(`SELECT data FROM assets WHERE id = '${a.id}'`))[0];
    const b = asBuffer(row.data);
    if (createHash("sha256").update(b).digest("hex") !== a.sha256 || b.length !== n(a.bytes)) problems.push(`asset ${a.id}: its bytes don't match its checksum`);
  }
  // Counters recomputed from what the user owns (documents count while deleted until purged; bytes = revisions + assets).
  const users = await all("SELECT id, username, doc_count, bytes_used FROM users ORDER BY id");
  const docs = new Map((await all("SELECT owner_id, COUNT(*) AS c FROM documents GROUP BY owner_id")).map(r => [r.owner_id, n(r.c)]));
  const revs = new Map((await all("SELECT d.owner_id, SUM(r.bytes) AS s FROM revisions r JOIN documents d ON d.id = r.document_id GROUP BY d.owner_id")).map(r => [r.owner_id, n(r.s)]));
  const assets = new Map((await all("SELECT owner_id, SUM(bytes) AS s FROM assets GROUP BY owner_id")).map(r => [r.owner_id, n(r.s)]));
  for (const u of users) {
    if (n(u.doc_count) !== (docs.get(u.id) ?? 0)) problems.push(`user ${u.username}: ${n(u.doc_count)} documents counted, ${docs.get(u.id) ?? 0} held`);
    const bytes = (revs.get(u.id) ?? 0) + (assets.get(u.id) ?? 0);
    if (n(u.bytes_used) !== bytes) problems.push(`user ${u.username}: ${n(u.bytes_used)} bytes counted, ${bytes} held`);
  }
  const assetCount = n((await all("SELECT COUNT(*) AS c FROM assets"))[0]?.c);
  return { ok: problems.length === 0, problems, users: users.length, assets: assetCount };
}
/** After a restore: nobody stays signed in, and no unused one-time link from the copy works (they may have been spent since). */
export const SANITIZE = ["DELETE FROM sessions", "DELETE FROM tokens WHERE used_at IS NULL",
  // The copy's heartbeat and backup lease are from backup time: not this database's state.
  "DELETE FROM settings WHERE key LIKE 'server.alive.%'", "UPDATE settings SET value = '' WHERE key = 'backup.lease'"];
