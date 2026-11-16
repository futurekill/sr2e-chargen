/** The database (docs/PLAN-M3.md §3): one Kysely instance per `DATABASE_URL`. SQLite today; pg and mysql2 join it. */
import { Kysely, SqliteDialect } from "kysely";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openSqlite } from "./node-sqlite.mjs";
import * as initial from "./migrations/001-initial.mjs";

export const MIGRATIONS = { "001-initial": initial };

/** `sqlite:///abs/path.db`, `sqlite://:memory:` → { dialect: "sqlite", path }. Other schemes: not yet. */
export function parseDatabaseUrl(url) {
  const m = /^sqlite:\/\/(.+)$/.exec(String(url ?? ""));
  if (m) return { dialect: "sqlite", path: m[1] };
  throw new Error(`DATABASE_URL: unsupported database "${String(url).split(":")[0]}" (sqlite only in this build)`);
}

export function openDatabase(url) {
  const { dialect, path } = parseDatabaseUrl(url);
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Kysely({ dialect: new SqliteDialect({ database: openSqlite(path) }) });
  db.dialectName = dialect;
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
 * (Postgres takes an advisory lock and MySQL GET_LOCK here when those dialects land.)
 */
export function migrate(db) {
  return db.transaction().execute(async trx => {
    trx.dialectName = db.dialectName;
    await trx.schema.createTable(TABLE).ifNotExists().addColumn("name", "varchar(64)", c => c.primaryKey()).addColumn("at", "bigint", c => c.notNull()).execute();
    const before = await migrationStatus(trx);
    if (before.newer.length) throw new Error(`this database is newer than this build (unknown migrations: ${before.newer.join(", ")})`);
    for (const name of before.pending) {
      await MIGRATIONS[name].up(trx);
      await trx.insertInto(TABLE).values({ name, at: Date.now() }).execute();
    }
    return migrationStatus(trx);
  });
}

/** What every server function takes: the database, its dialect and the clock. Migrated and ready. */
export async function createContext(url, { now = () => Date.now() } = {}) {
  const db = openDatabase(url);
  await migrate(db);
  return { db, dialect: db.dialectName, now };
}
