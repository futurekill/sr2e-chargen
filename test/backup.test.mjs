/** Backups (docs/PLAN-release.md, draft 3): SQLite's own VACUUM INTO in a child, verify, restore, the nightly lease. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, statSync, existsSync, chmodSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { createContext } from "../server/db/index.mjs";
import { active } from "../server/auth/passwords.mjs";
import * as A from "../server/auth/accounts.mjs";
import * as L from "../server/library.mjs";
import { createSession } from "../server/auth/sessions.mjs";
import { writeTx } from "../server/db/fence.mjs";
import { createBackup, backupJob, nightly, prune, backupDirProblem } from "../server/backup/index.mjs";
import { restoreSqlite } from "../server/backup/restore.mjs";

/** A SQLite file with a user, a character with revisions, a portrait, a session and an unused invite. */
async function seeded() {
  active.memory = 8192; active.passes = 1;
  const root = mkdtempSync(join(tmpdir(), "backup-")), data = join(root, "data"), backups = join(root, "backups");
  const { mkdirSync } = await import("node:fs"); mkdirSync(data);
  const url = `sqlite://${join(data, "chargen.db")}`;
  const ctx = await createContext(url);
  const { secret } = await A.bootstrap(ctx);
  const user = await A.redeem(ctx, { secret, username: "Boss", password: "a perfectly fine password" }).catch(async () => null);
  const userId = user?.user?.id ?? (await ctx.db.selectFrom("users").select("id").executeTakeFirst()).id;
  await writeTx(ctx, trx => createSession(trx, ctx, userId));
  await A.createInvite(ctx);
  const doc = await L.createCharacter(ctx, userId, { name: "Razor" }, randomUUID());
  const webp = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#c8006a" } }).webp().toBuffer();
  const { createHash } = await import("node:crypto");
  await L.setPortrait(ctx, userId, doc.document.id, { revision: 1, mime: "image/webp", uploadSha: "x" }, randomUUID(), { webp, sha256: createHash("sha256").update(webp).digest("hex") });
  return { ctx, url, data, backups, file: join(data, "chargen.db"), userId };
}

test("a backup: VACUUM INTO in a child, verified, mode 0600, named, beside nothing partial", async () => {
  const s = await seeded();
  const r = await createBackup({ databaseUrl: s.url, dir: s.backups });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.assets, 1);
  assert.equal(statSync(r.file).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(s.backups).filter(f => f.endsWith(".partial")), []);
  // Writers are not blocked while a backup runs: make the database big enough that the copy takes a while, start it,
  // write while it runs, and check the write finished well before the backup (r1 #13); the copy verifies (one state).
  const raw = new DatabaseSync(s.file);
  raw.exec("BEGIN");
  const ins = raw.prepare("INSERT INTO audit (id, at, action) VALUES (?, ?, ?)");
  for (let i = 0; i < 150000; i++) ins.run(randomUUID(), i, "x".repeat(40));
  raw.exec("COMMIT"); raw.close();
  let backupDone = 0;
  const running = createBackup({ databaseUrl: s.url, dir: s.backups }).then(r => { backupDone = Date.now(); return r; });
  await new Promise(r => setTimeout(r, 150));
  const t0 = Date.now();
  await L.createCharacter(s.ctx, s.userId, { name: "Concurrent" }, randomUUID());
  const wrote = Date.now();
  const b2 = await running;
  assert.equal(b2.ok, true, JSON.stringify(b2));
  assert.ok(wrote - t0 < 1000, `the write took ${wrote - t0} ms`);
  assert.ok(wrote <= backupDone, "the write finished while the backup was still running");
  assert.equal(backupDirProblem(join(s.data, "b"), s.file) !== null, true, "a backup inside the data directory is refused");
  assert.equal((await createBackup({ databaseUrl: s.url, dir: join(s.data, "b") })).ok, false);
});

test("verify catches a changed asset byte, a wrong counter and a schema mismatch", async () => {
  const s = await seeded();
  const { file } = await createBackup({ databaseUrl: s.url, dir: s.backups });
  const bad = (sqlText) => { const db = new DatabaseSync(file); db.exec(sqlText); db.close(); };
  bad("UPDATE assets SET data = X'00' || data");
  assert.match((await backupJob({ action: "verify", file })).problems.join(), /checksum/);
  const { file: f3 } = await createBackup({ databaseUrl: s.url, dir: s.backups });
  const db3 = new DatabaseSync(f3); db3.exec("PRAGMA foreign_keys = OFF; DELETE FROM users;"); db3.close();
  assert.match((await backupJob({ action: "verify", file: f3 })).problems.join(), /foreign keys/, "orphans are caught (r1 #6)");
  const { file: f2 } = await createBackup({ databaseUrl: s.url, dir: s.backups });
  const db2 = new DatabaseSync(f2); db2.exec("UPDATE users SET bytes_used = bytes_used + 1; DELETE FROM migrations WHERE name = '003-assets'"); db2.close();
  const p = (await backupJob({ action: "verify", file: f2 })).problems.join("\n");
  assert.match(p, /bytes counted/); assert.match(p, /schema/);
});

test("restore: offline, sanitized (no sessions, no unused links), verified, swapped in; a bad backup changes nothing", async () => {
  const s = await seeded();
  const { file } = await createBackup({ databaseUrl: s.url, dir: s.backups });
  await L.createCharacter(s.ctx, s.userId, { name: "After the backup" }, randomUUID());
  // A running server (a fresh heartbeat) refuses the restore (r1 #3).
  await s.ctx.db.insertInto("settings").values({ key: "server.alive", value: String(Date.now()) }).execute();
  assert.match((await restoreSqlite(file, s.file)).problems.join(), /server is running/);
  await s.ctx.db.updateTable("settings").set({ value: "" }).where("key", "=", "server.alive").execute();
  await s.ctx.db.destroy();
  const r = await restoreSqlite(file, s.file);
  assert.equal(r.ok, true, JSON.stringify(r));
  const db = new DatabaseSync(s.file, { readOnly: true });
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM sessions").get().c, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM tokens WHERE used_at IS NULL").get().c, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM documents WHERE name = 'After the backup'").get().c, 0, "the database is the backup's");
  db.close();
  assert.equal(existsSync(`${s.file}.restore-staging`), false);
  const junk = join(s.backups, "junk.db"); writeFileSync(junk, "not a database");
  assert.equal((await restoreSqlite(junk, s.file)).ok, false);
  assert.equal(existsSync(`${s.file}.restore-staging`), false, "no staging file left (r1 #4)");
  const after = new DatabaseSync(s.file, { readOnly: true });
  assert.equal(after.prepare("SELECT COUNT(*) AS c FROM documents").get().c, 1, "a failed restore left the database as it was");
  after.close();
});

test("the nightly lease: of two processes exactly one runs; due again only after 24 h; a failure records nothing; retention", async () => {
  const s = await seeded();
  const other = await createContext(s.url);
  const [a, b] = await Promise.all([nightly(s.ctx, { databaseUrl: s.url, dir: s.backups }), nightly(other, { databaseUrl: s.url, dir: s.backups })]);
  assert.equal([a, b].filter(r => r.ran).length, 1, JSON.stringify([a, b]));
  assert.equal((await nightly(s.ctx, { databaseUrl: s.url, dir: s.backups })).reason, "not due");
  const later = { ...s.ctx, now: () => Date.now() + 25 * 3600e3 };
  const fail = await nightly(later, { databaseUrl: s.url, dir: join(s.data, "inside") });
  assert.equal(fail.ok, false);
  assert.equal((await nightly(later, { databaseUrl: s.url, dir: s.backups })).ok, true, "a failed run is retried");
  for (let i = 0; i < 4; i++) await createBackup({ databaseUrl: s.url, dir: s.backups });
  prune(s.backups, 3);
  assert.equal(readdirSync(s.backups).filter(f => f.endsWith(".db")).length, 3);
  await other.db.destroy();
});

test("a failing write (no permission) leaves older backups intact and no partial file", async () => {
  const s = await seeded();
  const first = await createBackup({ databaseUrl: s.url, dir: s.backups });
  chmodSync(s.backups, 0o500);
  try {
    const r = await createBackup({ databaseUrl: s.url, dir: s.backups });
    assert.equal(r.ok, false);
  } finally { chmodSync(s.backups, 0o700); }
  assert.ok(existsSync(first.file));
  assert.deepEqual(readdirSync(s.backups).filter(f => f.endsWith(".partial")), []);
});

import { SERVER, freshUrl } from "./helpers.mjs";
import { run } from "../server/cli.mjs";
test("backup verify and sanitize --database-url on a server database (Postgres/MySQL/MariaDB in CI)", { skip: !SERVER && "needs TEST_DATABASE_URL" }, async () => {
  active.memory = 8192; active.passes = 1;
  const url = await freshUrl();
  const ctx = await createContext(url);
  const { secret } = await A.bootstrap(ctx);
  await A.redeem(ctx, { secret, username: "Boss", password: "a perfectly fine password" });
  const userId = (await ctx.db.selectFrom("users").select("id").executeTakeFirst()).id;
  const doc = await L.createCharacter(ctx, userId, { name: "Razor" }, randomUUID());
  const webp = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#000" } }).webp().toBuffer();
  const { createHash } = await import("node:crypto");
  await L.setPortrait(ctx, userId, doc.document.id, { revision: 1, mime: "image/webp", uploadSha: "y" }, randomUUID(), { webp, sha256: createHash("sha256").update(webp).digest("hex") });
  const lines = [];
  await run(["backup", "verify", "--database-url", url], { env: { ...process.env, BASE_URL: "http://localhost:3000" }, out: (l) => lines.push(l) });
  assert.equal(JSON.parse(lines[0]).ok, true, lines[0]);
  await run(["backup", "sanitize", "--database-url", url], { env: { ...process.env, BASE_URL: "http://localhost:3000" }, out: (l) => lines.push(l) });
  assert.equal(Number((await ctx.db.selectFrom("sessions").select(eb => eb.fn.countAll().as("n")).executeTakeFirst()).n), 0);
  await ctx.db.updateTable("users").set({ bytes_used: 1 }).execute();
  await assert.rejects(run(["backup", "verify", "--database-url", url], { env: { ...process.env, BASE_URL: "http://localhost:3000" }, out: () => {} }), /bytes counted/);
  await ctx.db.destroy();
});
