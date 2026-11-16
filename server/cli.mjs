#!/usr/bin/env node
/**
 * `chargen` — the admin CLI in the image (docs/PLAN-M3.md §4). Talks to the database directly; one-time links are
 * printed ONCE, here, and never stored.
 */
import { loadConfig } from "./config.mjs";
import { openDatabase, migrate, migrationStatus } from "./db/index.mjs";
import { setMaintenance, inMaintenance } from "./db/fence.mjs";
import * as A from "./auth/accounts.mjs";

const USAGE = `chargen admin bootstrap                 first admin's setup link (only while there is no admin)
chargen admin invite [--role admin]     a one-time invite link
chargen admin invites                   open invites
chargen admin revoke-invite <id>
chargen admin users
chargen admin disable|enable <user>
chargen admin reset-link <user>         a one-time password reset link
chargen db migrate | status
chargen maintenance on|off|status`;

export async function run(argv, { env = process.env, out = console.log } = {}) {
  const [group, cmd, ...rest] = argv;
  const config = loadConfig(env);
  const db = openDatabase(config.databaseUrl);
  const ctx = { db, dialect: db.dialectName, now: () => Date.now() };
  const when = (ms) => new Date(Number(ms)).toISOString();
  try {
    if (group === "db" && cmd === "status") return void out(JSON.stringify(await migrationStatus(db)));
    if (group === "db" && cmd === "migrate") return void out(JSON.stringify(await migrate(db)));
    await migrate(db);
    if (group === "maintenance") {
      if (cmd === "on" || cmd === "off") await setMaintenance(ctx, cmd === "on");
      else if (cmd !== "status") throw new A.Refused(USAGE);
      return void out(`maintenance: ${(await inMaintenance(ctx)) ? "on" : "off"}`);
    }
    if (group !== "admin") throw new A.Refused(USAGE);
    switch (cmd) {
      case "bootstrap": { const t = await A.bootstrap(ctx); return void out(`Setup link (works once, until ${when(t.expiresAt)}):\n${config.baseUrl}/redeem#k=${t.secret}`); }
      case "invite": { const t = await A.createInvite(ctx, { role: rest[0] === "--role" ? rest[1] : "user" }); return void out(`Invite link (works once, until ${when(t.expiresAt)}):\n${config.baseUrl}/redeem#k=${t.secret}`); }
      case "invites": for (const i of await A.listInvites(ctx)) out(`${i.id}  ${i.kind}  ${i.role}  expires ${when(i.expires_at)}`); return;
      case "revoke-invite": await A.revokeInvite(ctx, rest[0]); return void out("revoked");
      case "users": for (const u of await A.listUsers(ctx)) out(`${u.username}  ${u.role}${u.disabled_at != null ? "  DISABLED" : ""}`); return;
      case "disable": case "enable": await A.setDisabled(ctx, rest[0], cmd === "disable"); return void out(`${cmd}d ${rest[0]}`);
      case "reset-link": { const t = await A.resetLink(ctx, rest[0]); return void out(`Reset link for ${rest[0]} (works once, until ${when(t.expiresAt)}):\n${config.baseUrl}/reset#k=${t.secret}`); }
      default: throw new A.Refused(USAGE);
    }
  } finally { await db.destroy(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).catch(err => { console.error(err.statusCode ? err.message : err); process.exitCode = 1; });
}
