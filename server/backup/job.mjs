/**
 * Backup work in its own process (node:sqlite is synchronous: never on the server's event loop). One job, one answer.
 *   create  { db, dir }   VACUUM INTO a partial file in dir, fsync, verify, rename into place, fsync the directory.
 *   verify  { file }      the checks on a SQLite backup, opened read-only.
 */
import { DatabaseSync } from "node:sqlite";
import { openSync, fsyncSync, closeSync, renameSync, rmSync, chmodSync } from "node:fs";
import { join, basename } from "node:path";
import { randomBytes } from "node:crypto";
import { checkBackup } from "./checks.mjs";

const reply = (m) => process.send(m, () => process.exit(0));
const syncFile = (p) => { const fd = openSync(p, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } };
export async function verifyFile(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return await checkBackup((q) => db.prepare(q).all(), { sqlite: true }); } finally { db.close(); }
}

process.once("message", async (msg) => {
  try {
    if (msg.action === "verify") return reply(await verifyFile(msg.file));
    if (msg.action !== "create") throw new Error("unknown backup action");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const name = `chargen-${stamp}-${randomBytes(3).toString("hex")}.db`, partial = join(msg.dir, `.${name}.partial`), final = join(msg.dir, name);
    let published = false;
    try {
      const src = new DatabaseSync(msg.db, { readOnly: true, timeout: 5000 });
      try { src.exec(`VACUUM INTO '${partial.replace(/'/g, "''")}'`); }   // SQLite's own consistent snapshot
      finally { src.close(); }
      chmodSync(partial, 0o600);
      syncFile(partial);
      const check = await verifyFile(partial);
      if (!check.ok) return reply({ ok: false, problems: check.problems });
      renameSync(partial, final);
      published = true;
      syncFile(msg.dir);
      reply({ ok: true, file: final, name: basename(final), ...check });
    } finally {
      if (!published) rmSync(partial, { force: true });   // any failure: no partial left behind (r1 #5)
    }
  } catch (err) {
    reply({ ok: false, problems: [String(err?.message ?? err)] });
  }
});
