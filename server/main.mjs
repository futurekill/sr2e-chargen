#!/usr/bin/env node
/** The server process: migrate, sweep, listen. */
import { loadConfig } from "./config.mjs";
import { createContext } from "./db/index.mjs";
import { buildApp } from "./app.mjs";
import { purgeSessions } from "./auth/sessions.mjs";
import { purge } from "./library.mjs";

const config = loadConfig();
const ctx = await createContext(config.databaseUrl);
const app = await buildApp({ ctx, config });
const sweep = () => purgeSessions(ctx).then(() => purge(ctx)).catch(err => app.log.warn({ err }, "sweep skipped"));
await sweep();
setInterval(sweep, 3600e3).unref();
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await app.close(); await ctx.db.destroy(); process.exit(0); });
await app.listen({ port: config.port, host: config.host });
