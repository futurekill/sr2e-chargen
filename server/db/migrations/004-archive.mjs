/**
 * Archiving (hide a document from the active list, never purge it): `documents.archived_at`, bigint, nullable. Added
 * only if missing, so an interrupted run can run again — the same check as 002.
 */
import { sql } from "kysely";

async function hasArchived(db) {
  if (db.dialectName === "postgres")
    return (await sql`select 1 from pg_attribute where attrelid = to_regclass('documents') and attname = 'archived_at' and not attisdropped`.execute(db)).rows.length > 0;
  if (db.dialectName === "mysql")
    return (await sql`select 1 from information_schema.columns where table_schema = database() and table_name = 'documents' and column_name = 'archived_at'`.execute(db)).rows.length > 0;
  return (await sql`select 1 from pragma_table_info('documents') where name = 'archived_at'`.execute(db)).rows.length > 0;
}
export async function up(db) {
  if (!(await hasArchived(db))) await db.schema.alterTable("documents").addColumn("archived_at", "bigint").execute();
}
export async function down(db) {
  if (await hasArchived(db)) await db.schema.alterTable("documents").dropColumn("archived_at").execute();
}
