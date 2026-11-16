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
  // The busy timeout FIRST: switching a fresh file to WAL takes a lock, and two processes starting together would
  // otherwise fail with "database is locked" before any timeout applied.
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  // Switching to WAL needs the file to itself, and SQLite answers "locked" at once (no busy wait) when another
  // process is starting too: retry briefly. Once a file is WAL it stays WAL, so this only matters on first start.
  for (let tries = 0; ; tries++) {
    try { db.exec("PRAGMA journal_mode = WAL;"); break; }
    catch (err) {
      if (err?.errcode !== 5 || tries >= 100) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
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
