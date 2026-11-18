/**
 * Per-user preferences (docs/PLAN-sheet.md slice 2): `users.prefs`, JSON text, nullable. Added only if missing, so an
 * interrupted run (MySQL commits DDL as it goes) can run again.
 */
export async function up(db) {
  const users = (await db.introspection.getTables()).find(t => t.name === "users");
  if (!users?.columns.some(c => c.name === "prefs")) await db.schema.alterTable("users").addColumn("prefs", "text").execute();
}
export async function down(db) {
  const users = (await db.introspection.getTables()).find(t => t.name === "users");
  if (users?.columns.some(c => c.name === "prefs")) await db.schema.alterTable("users").dropColumn("prefs").execute();
}
