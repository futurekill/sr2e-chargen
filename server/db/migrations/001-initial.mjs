/**
 * The first schema (docs/PLAN-M3.md §3). Schema builder only; every step is conditional (`ifNotExists`) so a run
 * interrupted on MySQL — whose DDL commits as it goes — can simply run again (round 1 #16).
 * Ids are app-generated UUIDs; timestamps are 64-bit milliseconds UTC; booleans are 0/1.
 */
import { sql } from "kysely";

const jsonColumn = (db) => (db.dialectName === "postgres" ? "jsonb" : db.dialectName === "mysql" ? "longtext" : "text");
const ID = "varchar(36)";

/** MySQL has no `CREATE INDEX IF NOT EXISTS` (review 1 #5): look first there; the others take the clause. */
async function indexOnce(db, name, table, columns) {
  if (db.dialectName === "mysql") {
    const have = await sql`select 1 from information_schema.statistics where table_schema = database() and table_name = ${table} and index_name = ${name} limit 1`.execute(db);
    if (have.rows.length) return;
    return db.schema.createIndex(name).on(table).columns(columns).execute();
  }
  return db.schema.createIndex(name).ifNotExists().on(table).columns(columns).execute();
}

export async function up(db) {
  const t = (name) => db.schema.createTable(name).ifNotExists();
  await t("settings").addColumn("key", "varchar(64)", c => c.primaryKey()).addColumn("value", "varchar(255)", c => c.notNull()).execute();
  await t("users")
    .addColumn("id", ID, c => c.primaryKey())
    .addColumn("username", "varchar(64)", c => c.notNull())
    .addColumn("username_key", "varchar(64)", c => c.notNull().unique())   // normalised: unique case-insensitively
    .addColumn("password_hash", "varchar(255)", c => c.notNull())
    .addColumn("role", "varchar(16)", c => c.notNull())
    .addColumn("disabled_at", "bigint")
    .addColumn("failed_logins", "integer", c => c.notNull().defaultTo(0))
    .addColumn("locked_until", "bigint")
    .addColumn("doc_count", "integer", c => c.notNull().defaultTo(0))
    .addColumn("bytes_used", "bigint", c => c.notNull().defaultTo(0))
    .addColumn("created_at", "bigint", c => c.notNull())
    .execute();
  await t("sessions")
    .addColumn("id", ID, c => c.primaryKey())
    .addColumn("user_id", ID, c => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("token_hash", "varchar(64)", c => c.notNull().unique())
    .addColumn("csrf_hash", "varchar(64)", c => c.notNull())
    .addColumn("created_at", "bigint", c => c.notNull())
    .addColumn("last_seen_at", "bigint", c => c.notNull())
    .addColumn("expires_at", "bigint", c => c.notNull())
    .execute();
  await t("tokens")
    .addColumn("id", ID, c => c.primaryKey())
    .addColumn("kind", "varchar(16)", c => c.notNull())
    .addColumn("token_hash", "varchar(64)", c => c.notNull().unique())
    .addColumn("user_id", ID, c => c.references("users.id").onDelete("cascade"))
    .addColumn("role", "varchar(16)")
    .addColumn("generation", "integer")
    .addColumn("created_by", ID)
    .addColumn("created_at", "bigint", c => c.notNull())
    .addColumn("expires_at", "bigint", c => c.notNull())
    .addColumn("used_at", "bigint")
    .execute();
  await t("documents")
    .addColumn("id", ID, c => c.primaryKey())
    .addColumn("owner_id", ID, c => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("kind", "varchar(16)", c => c.notNull())
    .addColumn("name", "varchar(200)", c => c.notNull())
    .addColumn("revision", "integer", c => c.notNull())
    .addColumn("body", jsonColumn(db), c => c.notNull())
    .addColumn("bytes", "integer", c => c.notNull())
    .addColumn("created_at", "bigint", c => c.notNull())
    .addColumn("updated_at", "bigint", c => c.notNull())
    .addColumn("deleted_at", "bigint")
    .execute();
  await t("revisions")
    .addColumn("document_id", ID, c => c.notNull().references("documents.id").onDelete("cascade"))
    .addColumn("revision", "integer", c => c.notNull())
    .addColumn("body", jsonColumn(db), c => c.notNull())
    .addColumn("bytes", "integer", c => c.notNull())
    .addColumn("note", "varchar(200)")
    .addColumn("created_at", "bigint", c => c.notNull())
    .addPrimaryKeyConstraint("revisions_pk", ["document_id", "revision"])
    .execute();
  await t("idempotency")
    .addColumn("user_id", ID, c => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("key", "varchar(64)", c => c.notNull())
    .addColumn("fingerprint", "varchar(64)", c => c.notNull())
    .addColumn("status", "integer")
    .addColumn("response", "text")
    .addColumn("created_at", "bigint", c => c.notNull())
    .addPrimaryKeyConstraint("idempotency_pk", ["user_id", "key"])
    .execute();
  await t("audit")
    .addColumn("id", ID, c => c.primaryKey())
    .addColumn("at", "bigint", c => c.notNull())
    .addColumn("actor_id", ID)
    .addColumn("action", "varchar(64)", c => c.notNull())
    .addColumn("target", "varchar(255)")
    .addColumn("ip", "varchar(64)")
    .execute();
  await indexOnce(db, "documents_owner", "documents", ["owner_id", "updated_at"]);
  await indexOnce(db, "sessions_user", "sessions", ["user_id"]);
  // The two rows that are locks as much as values (PLAN-M3 §4): inserted once, conflict-safe.
  for (const [key, value] of [["admin_gen", "0"], ["maintenance", "off"]]) {
    const have = await db.selectFrom("settings").select("key").where("key", "=", key).executeTakeFirst();
    if (!have) await db.insertInto("settings").values({ key, value }).execute();
  }
}

export async function down(db) {
  for (const name of ["audit", "idempotency", "revisions", "documents", "tokens", "sessions", "users", "settings"]) await db.schema.dropTable(name).ifExists().execute();
}
