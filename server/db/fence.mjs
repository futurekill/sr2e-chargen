/**
 * The write fence and the row locks (docs/PLAN-M3.md §4). EVERY write transaction starts with a locking read of the
 * `maintenance` row and refuses while it is set; setting it is an UPDATE of that row, so it waits writers out and
 * later writers wait for it. On SQLite the transaction is already `BEGIN IMMEDIATE` (one writer at a time).
 */
import { sql } from "kysely";

export class Maintenance extends Error {
  constructor() { super("Down for maintenance, chummer. Try again in a bit."); this.statusCode = 503; this.code = "maintenance"; }
}
/** A shared row lock: `FOR SHARE` (Postgres), `LOCK IN SHARE MODE` (MySQL and MariaDB), nothing on SQLite. */
export const shareLock = (ctx, q) => (ctx.dialect === "postgres" ? q.forShare() : ctx.dialect === "mysql" ? q.modifyEnd(sql`lock in share mode`) : q);
/** An exclusive row lock, the same way. */
export const updateLock = (ctx, q) => (ctx.dialect === "sqlite" ? q : q.forUpdate());

/** Run `fn(trx)` as a write transaction behind the fence. */
export function writeTx(ctx, fn) {
  return ctx.db.transaction().execute(async trx => {
    const row = await shareLock(ctx, trx.selectFrom("settings").select("value").where("key", "=", "maintenance")).executeTakeFirst();
    if (row?.value !== "off") throw new Maintenance();
    return fn(trx);
  });
}
/** The ONE write outside the fence (round 4 #1): the flag's own transition, under its row's exclusive lock. */
export async function setMaintenance(ctx, on) {
  await ctx.db.updateTable("settings").set({ value: on ? "on" : "off" }).where("key", "=", "maintenance").execute();
}
export const inMaintenance = async (ctx) =>
  (await ctx.db.selectFrom("settings").select("value").where("key", "=", "maintenance").executeTakeFirst())?.value !== "off";

/** Rows changed by an UPDATE/DELETE result, as a number on every dialect. */
export const changed = (r) => Number(r?.numUpdatedRows ?? r?.numDeletedRows ?? r?.[0]?.numUpdatedRows ?? r?.[0]?.numDeletedRows ?? 0);
