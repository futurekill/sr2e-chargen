/**
 * Per-user preferences (docs/PLAN-sheet.md slice 2): `users.prefs`, JSON text, nullable. Added only if missing, so an
 * interrupted run (MySQL commits DDL as it goes) can run again. The check looks at THE app's `users` table: the
 * current schema on Postgres, the current database on MySQL/MariaDB (code review r1 #2).
 */
import { sql } from "kysely";

async function hasPrefs(db) {
  if (db.dialectName === "postgres")
    return (await sql`select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'users' and column_name = 'prefs'`.execute(db)).rows.length > 0;
  if (db.dialectName === "mysql")
    return (await sql`select 1 from information_schema.columns where table_schema = database() and table_name = 'users' and column_name = 'prefs'`.execute(db)).rows.length > 0;
  return (await sql`select 1 from pragma_table_info('users') where name = 'prefs'`.execute(db)).rows.length > 0;
}
export async function up(db) {
  if (!(await hasPrefs(db))) await db.schema.alterTable("users").addColumn("prefs", "text").execute();
}
export async function down(db) {
  if (await hasPrefs(db)) await db.schema.alterTable("users").dropColumn("prefs").execute();
}
