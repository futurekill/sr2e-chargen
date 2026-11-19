/** The GM's rules settings (docs/PLAN-M4b.md): how selling pays (RULINGS R6). Stored in the `settings` table. */
import { writeTx } from "./db/fence.mjs";
import { audit } from "./auth/accounts.mjs";

export const SALE_MODES = ["refund", "fence"];
const KEY = "rules.saleMode";

/** The sale mode — read with the caller's connection or transaction, so a write sees the live value. */
export async function getSaleMode(db) {
  const row = await db.selectFrom("settings").select("value").where("key", "=", KEY).executeTakeFirst();
  return SALE_MODES.includes(row?.value) ? row.value : "refund";
}
/** Set it (an admin), audited. */
export function setSaleMode(ctx, mode, actor) {
  if (!SALE_MODES.includes(mode)) throw new Error("unknown sale mode");
  return writeTx(ctx, async trx => {
    const r = await trx.updateTable("settings").set({ value: mode }).where("key", "=", KEY).executeTakeFirst();
    if (!Number(r?.numUpdatedRows)) await trx.insertInto("settings").values({ key: KEY, value: mode }).execute();
    await audit(trx, ctx, `rules.saleMode=${mode}`, { actor });
  });
}
