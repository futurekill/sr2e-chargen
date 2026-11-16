import { test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "kysely";
import { openDatabase, migrate, migrationStatus, parseDatabaseUrl } from "../server/db/index.mjs";
import { openSqlite } from "../server/db/node-sqlite.mjs";

const fresh = () => openDatabase("sqlite://:memory:");

test("node:sqlite adapter: reader detection, parameter binding, numbers not BigInts, iterate", () => {
  const db = openSqlite(":memory:");
  assert.equal(db.prepare("create table t (a integer, b text)").reader, false);
  db.prepare("create table t (a integer, b text)").run([]);
  const r = db.prepare("insert into t (a, b) values (?, ?)").run([1, "x"]);
  assert.deepEqual(r, { changes: 1, lastInsertRowid: 1 });
  db.prepare("insert into t (a, b) values (?, ?)").run([2, "y"]);
  const sel = db.prepare("select a, b from t where a >= ? order by a");
  assert.equal(sel.reader, true);
  assert.deepEqual(sel.all([1]).map(row => ({ ...row })), [{ a: 1, b: "x" }, { a: 2, b: "y" }]);
  assert.equal([...sel.iterate([2])].length, 1);
  assert.equal(db.prepare("insert into t (a) values (3) returning a").reader, true);
  db.close();
});

test("transactions commit, roll back, and survive a statement error", async () => {
  const db = fresh();
  await sql`create table t (a integer primary key)`.execute(db);
  await db.transaction().execute(trx => sql`insert into t values (1)`.execute(trx));
  await assert.rejects(db.transaction().execute(async trx => {
    await sql`insert into t values (2)`.execute(trx);
    await sql`insert into t values (1)`.execute(trx);   // unique violation
  }));
  const rows = (await sql`select a from t order by a`.execute(db)).rows;
  assert.deepEqual(rows.map(r => r.a), [1]);
  await db.transaction().execute(trx => sql`insert into t values (3)`.execute(trx));   // the connection is still usable
  assert.equal((await sql`select count(*) as n from t`.execute(db)).rows[0].n, 2);
  await db.destroy();
});

test("migrations: up on an empty database, idempotent, the two lock rows present", async () => {
  const db = fresh();
  assert.deepEqual((await migrationStatus(db)).pending, ["001-initial"]);
  const after = await migrate(db);
  assert.deepEqual(after, { applied: ["001-initial"], pending: [], newer: [] });
  await migrate(db);
  const settings = await db.selectFrom("settings").selectAll().orderBy("key").execute();
  assert.deepEqual(settings.map(s => ({ ...s })), [{ key: "admin_gen", value: "0" }, { key: "maintenance", value: "off" }]);
  await db.destroy();
});

test("the initial migration can run again after an interruption (every step conditional)", async () => {
  const db = fresh();
  const { up } = await import("../server/db/migrations/001-initial.mjs");
  await up(db); await up(db);
  assert.equal((await db.selectFrom("settings").selectAll().execute()).length, 2);
  await db.destroy();
});

test("a database newer than this build is refused", async () => {
  const db = fresh();
  await migrate(db);
  await db.insertInto("kysely_migration").values({ name: "999-from-the-future", timestamp: new Date().toISOString() }).execute();
  await assert.rejects(migrate(db), /newer than this build/);
  await db.destroy();
});

test("foreign keys are enforced and usernames are unique by their key", async () => {
  const db = fresh();
  await migrate(db);
  const user = { id: "u1", username: "Razor", username_key: "razor", password_hash: "x", role: "user", created_at: 1 };
  await db.insertInto("users").values(user).execute();
  await assert.rejects(db.insertInto("users").values({ ...user, id: "u2", username: "RAZOR" }).execute());
  await assert.rejects(db.insertInto("sessions").values({ id: "s", user_id: "nobody", token_hash: "h", csrf_hash: "c", created_at: 1, last_seen_at: 1, expires_at: 2 }).execute());
  await db.destroy();
});

test("DATABASE_URL parsing", () => {
  assert.deepEqual(parseDatabaseUrl("sqlite:///data/chargen.db"), { dialect: "sqlite", path: "/data/chargen.db" });
  assert.deepEqual(parseDatabaseUrl("sqlite://:memory:"), { dialect: "sqlite", path: ":memory:" });
  assert.throws(() => parseDatabaseUrl("oracle://x"), /unsupported/);
});
