/**
 * `node:sqlite` as Kysely's SQLite database (docs/PLAN-M3.md §3, round 1 #14). Kysely's dialect wants
 * better-sqlite3's shape — `prepare(sql)` → `{ reader, all(params[]), run(params[]), iterate(params[]) }` — while
 * node:sqlite statements take variadic parameters and say what they return through `columns()`.
 * Every transaction Kysely opens becomes `BEGIN IMMEDIATE`: a deferred transaction that later upgrades to a write
 * can fail with SQLITE_BUSY against another process (the CLI) no matter the busy timeout.
 */
import { DatabaseSync } from "node:sqlite";

const num = (n) => (typeof n === "bigint" ? Number(n) : n);

export function openSqlite(path) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return {
    close: () => db.close(),
    prepare(sql) {
      const stmt = db.prepare(/^\s*begin\s*$/i.test(sql) ? "begin immediate" : sql);
      return {
        reader: stmt.columns().length > 0,
        all: (params = []) => stmt.all(...params),
        run: (params = []) => { const r = stmt.run(...params); return { changes: num(r.changes), lastInsertRowid: num(r.lastInsertRowid) }; },
        iterate: (params = []) => stmt.iterate(...params)
      };
    }
  };
}
