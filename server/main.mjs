#!/usr/bin/env node
/** The server process: migrate, sweep, listen. */
import { loadConfig } from "./config.mjs";
import { createContext } from "./db/index.mjs";
import { buildApp } from "./app.mjs";
import { purgeSessions } from "./auth/sessions.mjs";
import { purge } from "./library.mjs";
import { loadCatalog, CatalogError } from "./catalog.mjs";

const config = loadConfig();
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
const sweep = () => purgeSessions(ctx).then(() => purge(ctx)).catch(err => app.log.warn({ err }, "sweep skipped"));
await sweep();
setInterval(sweep, 3600e3).unref();
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await app.close(); await ctx.db.destroy(); process.exit(0); });
await app.listen({ port: config.port, host: config.host });
