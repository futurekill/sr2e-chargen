/**
 * Premade portraits (the system's pregen art, kept in the project's content copy by the sync): a player may pick one
 * instead of uploading. Read-only files, the same for everyone; listed once at start.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const STOCK_DIR = fileURLToPath(new URL("../../content/sr2e-foundryvtt/assets/pregen_portraits/", import.meta.url));
const ID = /^[a-z0-9-]{1,40}$/;
const title = (id) => id.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
let list = null;
/** The premade portraits: [{ id, name }], sorted by name. */
export function stockPortraits() {
  if (!list) list = existsSync(STOCK_DIR) ? readdirSync(STOCK_DIR).filter(f => f.endsWith(".webp")).map(f => f.slice(0, -5)).filter(id => ID.test(id)).sort().map(id => ({ id, name: title(id) })) : [];
  return list;
}
export const isStock = (id) => typeof id === "string" && stockPortraits().some(p => p.id === id);
/** One premade portrait's WebP, or null (only a listed id is ever read: never a path from a request). */
export function stockPortrait(id) {
  const p = stockPortraits().find(x => x.id === id);
  return p ? readFileSync(join(STOCK_DIR, `${p.id}.webp`)) : null;
}
