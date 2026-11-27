import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { createContext, openDatabase } from "../server/db/index.mjs";
import { active } from "../server/auth/passwords.mjs";

/**
 * The database the suite runs on: SQLite by default; `TEST_DATABASE_URL` (an ADMIN connection to a Postgres, MySQL
 * or MariaDB server, e.g. postgres://postgres:test@127.0.0.1:55432/postgres) runs the SAME tests there.
 */
export const SERVER = process.env.TEST_DATABASE_URL || null;
export const sqliteOnly = SERVER ? "SQLite only" : false;

/**
 * Earlier runs' test databases (`t_` + 12 hex), dropped once per test file (each file is its own process) before it
 * makes its first: without it every local run left ~75 behind, and a long-lived Postgres container ran out of shared
 * memory (error 53100). Only databases nobody is connected to go — a Postgres DROP without FORCE refuses one in use, and
 * MySQL/MariaDB skip any named in the process list — so a run in progress elsewhere keeps its own. Never fails a suite.
 */
let swept = null;
async function sweep(admin) {
  const pg = SERVER.startsWith("postgres");
  const names = (await sql.raw(pg ? "select datname as n from pg_database" : "select schema_name as n from information_schema.schemata").execute(admin)).rows
    .map(r => r.n ?? r.N).filter(n => /^t_[0-9a-f]{12}$/.test(n));
  const busy = pg ? new Set() : new Set((await sql.raw("select db from information_schema.processlist").execute(admin)).rows.map(r => r.db ?? r.DB));
  for (const n of names) {
    if (busy.has(n)) continue;
    try { await sql.raw(`drop database if exists ${n}`).execute(admin); } catch { /* in use: a later file drops it */ }
  }
}

/** A URL for a brand-new, empty database. `file: true` gives SQLite a file (for tests that use several processes). */
export async function freshUrl({ file = false } = {}) {
  if (!SERVER) return file ? `sqlite://${join(mkdtempSync(join(tmpdir(), "chargen-")), "t.db")}` : "sqlite://:memory:";
  const name = `t_${randomBytes(6).toString("hex")}`;
  const admin = await openDatabase(SERVER);
  await (swept ??= sweep(admin).catch(() => {}));
  await sql.raw(`create database ${name}`).execute(admin);
  await admin.destroy();
  const u = new URL(SERVER); u.pathname = `/${name}`;
  return u.toString();
}

/** A fresh app context with a clock the test moves. Hashing is turned down so suites stay quick. */
export async function testContext() {
  active.memory = 8192; active.passes = 1;
  const clock = { t: 1_800_000_000_000 };
  const ctx = await createContext(await freshUrl(), { now: () => clock.t });
  return { ctx, clock, advance: (ms) => { clock.t += ms; } };
}
export const PW = "a perfectly fine password";
