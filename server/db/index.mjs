/** The database (docs/PLAN-M3.md §3): one Kysely instance per `DATABASE_URL`. SQLite today; pg and mysql2 join it. */
import { Kysely, SqliteDialect } from "kysely";
import { Migrator } from "kysely/migration";
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

const migrator = (db) => new Migrator({ db, provider: { getMigrations: async () => MIGRATIONS } });

/** Applied and pending migration names; `newer` = the database has migrations this build doesn't know. */
export async function migrationStatus(db) {
  let rows = [];
  try { rows = await db.selectFrom("kysely_migration").select("name").execute(); } catch { /* a fresh database */ }
  const applied = rows.map(r => r.name), known = Object.keys(MIGRATIONS);
  return { applied, pending: known.filter(n => !applied.includes(n)), newer: applied.filter(n => !known.includes(n)) };
}

/** Run pending migrations. Refuses a database newer than this build (PLAN-M3 §3). */
export async function migrate(db) {
  const before = await migrationStatus(db);
  if (before.newer.length) throw new Error(`this database is newer than this build (unknown migrations: ${before.newer.join(", ")})`);
  const { error } = await migrator(db).migrateToLatest();
  if (error) throw error;
  return migrationStatus(db);
}
