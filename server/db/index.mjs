/**
 * The database (docs/PLAN-M3.md §3): one Kysely instance per `DATABASE_URL` — SQLite (`node:sqlite`), Postgres (`pg`),
 * MySQL or MariaDB (`mysql2`). `db.dialectName` is "sqlite" | "postgres" | "mysql" (MariaDB is the mysql family).
 */
import { Kysely, SqliteDialect, PostgresDialect, MysqlDialect, sql } from "kysely";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openSqlite } from "./node-sqlite.mjs";
import * as initial from "./migrations/001-initial.mjs";

export const MIGRATIONS = { "001-initial": initial };

/** `sqlite:///abs/path.db` | `sqlite://:memory:` | `postgres://…` | `mysql://…` | `mariadb://…` → { dialect, path | url }. */
export function parseDatabaseUrl(url) {
  const m = /^sqlite:\/\/(.+)$/.exec(String(url ?? ""));
  if (m) return { dialect: "sqlite", path: m[1] };
  if (/^postgres(ql)?:\/\//.test(url)) return { dialect: "postgres", url: String(url) };
  if (/^(mysql|mariadb):\/\//.test(url)) return { dialect: "mysql", url: String(url).replace(/^mariadb:/, "mysql:") };
  throw new Error(`DATABASE_URL: unsupported database "${String(url).split(":")[0]}" (sqlite, postgres, mysql or mariadb)`);
}

export async function openDatabase(url) {
  const target = parseDatabaseUrl(url);
  let dialect;
  if (target.dialect === "sqlite") {
    if (target.path !== ":memory:") mkdirSync(dirname(target.path), { recursive: true });
    dialect = new SqliteDialect({ database: openSqlite(target.path) });
  } else if (target.dialect === "postgres") {
    const pg = (await import("pg")).default;
    pg.types.setTypeParser(20, Number);   // int8 (our millisecond timestamps, counts): numbers, far inside the safe range
    dialect = new PostgresDialect({ pool: new pg.Pool({ connectionString: target.url, max: 10 }) });
  } else {
    const mysql = await import("mysql2");
    // Timestamps and counts come back as numbers; DECIMAL (SUM) as numbers too. Dates are never used.
    dialect = new MysqlDialect({ pool: mysql.createPool({ uri: target.url, connectionLimit: 10, decimalNumbers: true, supportBigNumbers: false }) });
  }
  const db = new Kysely({ dialect });
  db.dialectName = target.dialect;
  return db;
}

const TABLE = "migrations";

/** Applied and pending migration names; `newer` = the database has migrations this build doesn't know. */
export async function migrationStatus(db) {
  let rows = [];
  try { rows = await db.selectFrom(TABLE).select("name").execute(); } catch { /* a fresh database */ }
  const applied = rows.map(r => r.name), known = Object.keys(MIGRATIONS);
  return { applied, pending: known.filter(n => !applied.includes(n)), newer: applied.filter(n => !known.includes(n)) };
}

/**
 * Run pending migrations; refuses a database newer than this build (PLAN-M3 §3). Our own small runner, not Kysely's
 * Migrator: that one takes no lock on SQLite and refuses to run inside a transaction there. ONE owner at a time
 * across processes (the server starting and the CLI; code review 1 #4): the whole run sits in one write transaction
 * — on SQLite `BEGIN IMMEDIATE`, where DDL is transactional — and the applied list is read under it. Each migration
 * is restartable (every step conditional), for MySQL, whose DDL commits as it goes.
 * Postgres adds an advisory lock in that transaction (two fresh databases would otherwise race on CREATE TABLE);
 * MySQL/MariaDB hold a named lock instead.
 */
export async function migrate(db) {
  const run = async (conn) => {
    conn.dialectName = db.dialectName;
    await conn.schema.createTable(TABLE).ifNotExists().addColumn("name", "varchar(64)", c => c.primaryKey()).addColumn("at", "bigint", c => c.notNull()).execute();
    const before = await migrationStatus(conn);
    if (before.newer.length) throw new Error(`this database is newer than this build (unknown migrations: ${before.newer.join(", ")})`);
    for (const name of before.pending) {
      await MIGRATIONS[name].up(conn);
      await conn.insertInto(TABLE).values({ name, at: Date.now() }).execute();
    }
    return migrationStatus(conn);
  };
  // MySQL/MariaDB: DDL commits as it goes, so a transaction can't hold the run; a named lock on one connection does.
  if (db.dialectName === "mysql") return db.connection().execute(async conn => {
    const got = await sql`select get_lock('chargen-migrate', 60) as ok`.execute(conn);
    if (Number(got.rows[0]?.ok) !== 1) throw new Error("another process is migrating this database");
    try { return await run(conn); } finally { await sql`select release_lock('chargen-migrate')`.execute(conn); }
  });
  return db.transaction().execute(async trx => {
    if (db.dialectName === "postgres") await sql`select pg_advisory_xact_lock(7701602)`.execute(trx);
    return run(trx);
  });
}

/** What every server function takes: the database, its dialect and the clock. Migrated and ready. */
export async function createContext(url, { now = () => Date.now() } = {}) {
  const db = await openDatabase(url);
  await migrate(db);
  return { db, dialect: db.dialectName, now };
}
