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

export class SessionGone extends Error {
  constructor(admin) { super(admin ? "Admins only." : "Sign in first, chummer."); this.statusCode = admin ? 403 : 401; this.code = admin ? "not-admin" : "no-session"; }
}
/**
 * Run `fn(trx)` as a write transaction behind the fence. A request's context carries `ctx.session = { id, role? }`:
 * the session (and the role the route needs) is checked AGAIN here, under a row lock, so a request that passed
 * authentication before its session was revoked or its admin disabled can't still write (code review 1 #3).
 */
export async function writeTx(ctx, fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ctx.db.transaction().execute(async trx => {
        const row = await shareLock(ctx, trx.selectFrom("settings").select("value").where("key", "=", "maintenance")).executeTakeFirst();
        if (row?.value !== "off") throw new Maintenance();
        if (ctx.session) {
          const s = await shareLock(ctx, trx.selectFrom("sessions").innerJoin("users", "users.id", "sessions.user_id")
            .select(["users.role", "users.disabled_at"]).where("sessions.id", "=", ctx.session.id)).executeTakeFirst();
          if (!s || s.disabled_at != null) throw new SessionGone(false);
          if (ctx.session.role && s.role !== ctx.session.role) throw new SessionGone(true);
        }
        return fn(trx);
      });
    } catch (err) {
      // The database chose this transaction as a deadlock victim (or couldn't serialise it) and rolled it back
      // whole: running it again is what the database asks for. Everything in `fn` is database work, so it can.
      if (!retryable(err) || attempt >= 4) throw err;
      await new Promise(r => setTimeout(r, 15 * attempt + Math.random() * 25));
    }
  }
}
/** MySQL/MariaDB deadlock (1213) and lock wait timeout (1205); Postgres deadlock (40P01) and serialization failure (40001). */
const retryable = (err) => err?.errno === 1213 || err?.errno === 1205 || err?.code === "40P01" || err?.code === "40001";

/** The ONE write outside the fence (round 4 #1): the flag's own transition, under its row's exclusive lock. */
export async function setMaintenance(ctx, on) {
  await ctx.db.updateTable("settings").set({ value: on ? "on" : "off" }).where("key", "=", "maintenance").execute();
}
export const inMaintenance = async (ctx) =>
  (await ctx.db.selectFrom("settings").select("value").where("key", "=", "maintenance").executeTakeFirst())?.value !== "off";

/** Rows changed by an UPDATE/DELETE result, as a number on every dialect. */
export const changed = (r) => Number(r?.numUpdatedRows ?? r?.numDeletedRows ?? r?.[0]?.numUpdatedRows ?? r?.[0]?.numDeletedRows ?? 0);
