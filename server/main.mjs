#!/usr/bin/env node
/** The server process: migrate, sweep, listen. */
import { loadConfig } from "./config.mjs";
import { createContext } from "./db/index.mjs";
import { buildApp } from "./app.mjs";
import { purgeSessions } from "./auth/sessions.mjs";
import { purge } from "./library.mjs";
import { loadCatalog, CatalogError } from "./catalog.mjs";
import { existsSync } from "node:fs";
import { sqlitePath, stagingOf, nightly, backupDirProblem } from "./backup/index.mjs";

const config = loadConfig();
const dbFile = sqlitePath(config.databaseUrl);
if (dbFile && existsSync(stagingOf(dbFile))) { console.error(`sr2e-chargen: a restore is unfinished (${stagingOf(dbFile)}): run the restore again or delete that file`); process.exit(1); }
const ctx = await createContext(config.databaseUrl);
let catalog = null;
try { catalog = loadCatalog(config.catalogDir); }
catch (err) {
  // The image ships fully formed (docs/PLAN-catalog.md §8): no catalog, no production server. A development
  // server starts without one and says so.
  if (!(err instanceof CatalogError) || config.production) { console.error(`sr2e-chargen: ${err.message}`); process.exit(1); }
  console.warn(`sr2e-chargen: starting WITHOUT a catalog — ${err.message}`);
}
const app = await buildApp({ ctx, config, catalog });
// Nightly backups (docs/PLAN-release.md) when BACKUP_DIR is set and the database is SQLite; checked with the hourly sweep.
const backupDir = process.env.BACKUP_DIR;
const backups = backupDir && dbFile ? (backupDirProblem(backupDir, dbFile) ?? null) : "off";
if (backups && backups !== "off") app.log.warn(`backups OFF: ${backups}`);
const backupKeep = Math.max(1, Number(process.env.BACKUP_KEEP) || 7);
let backingUp = false;
const backup = async () => {
  if (backups !== null || backingUp) return;
  backingUp = true;
  try { const r = await nightly(ctx, { databaseUrl: config.databaseUrl, dir: backupDir, keep: backupKeep, log: (m) => app.log.error(m) }); if (r.ran) app.log.info({ backup: r }, "backup"); }
  catch (err) { app.log.error({ err }, "backup failed"); }
  finally { backingUp = false; }
};
const sweep = () => purgeSessions(ctx).then(() => purge(ctx)).then(backup).catch(err => app.log.warn({ err }, "sweep skipped"));
await sweep();
setInterval(sweep, 3600e3).unref();
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await app.close(); await ctx.db.destroy(); process.exit(0); });
await app.listen({ port: config.port, host: config.host });
