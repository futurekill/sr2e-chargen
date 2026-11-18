/**
 * Uploaded images (docs/PLAN-portrait.md): in the database, so one backup set holds everything. The bytes column is
 * BLOB / bytea / LONGBLOB per dialect. Conditional steps: an interrupted MySQL run can run again.
 */
import { sql } from "kysely";

const binary = (db) => (db.dialectName === "postgres" ? "bytea" : db.dialectName === "mysql" ? sql`longblob` : "blob");
const ID = "varchar(36)";

export async function up(db) {
  await db.schema.createTable("assets").ifNotExists()
    .addColumn("id", ID, c => c.primaryKey())
    .addColumn("owner_id", ID, c => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("document_id", ID, c => c.notNull().references("documents.id").onDelete("cascade"))
    .addColumn("kind", "varchar(16)", c => c.notNull())
    .addColumn("data", binary(db), c => c.notNull())
    .addColumn("bytes", "integer", c => c.notNull())
    .addColumn("sha256", "varchar(64)", c => c.notNull())
    .addColumn("created_at", "bigint", c => c.notNull())
    .execute();
  if (db.dialectName === "mysql") {
    const have = await sql`select 1 from information_schema.statistics where table_schema = database() and table_name = 'assets' and index_name = 'assets_document' limit 1`.execute(db);
    if (!have.rows.length) await db.schema.createIndex("assets_document").on("assets").columns(["document_id", "created_at"]).execute();
  } else {
    await db.schema.createIndex("assets_document").ifNotExists().on("assets").columns(["document_id", "created_at"]).execute();
  }
}
export async function down(db) {
  await db.schema.dropTable("assets").ifExists().execute();
}
