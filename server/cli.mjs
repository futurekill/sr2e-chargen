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
chargen admin role <user> user|admin    change a role (the last admin keeps theirs)
chargen admin reset-link <user>         a one-time password reset link
chargen db migrate | status
chargen maintenance on|off|status
chargen backup create                   a SQLite backup into BACKUP_DIR (verified)
chargen backup verify <file>            check a SQLite backup
chargen backup verify --database-url <url>   check a restored Postgres/MySQL database
chargen backup sanitize --database-url <url> after restoring one: no sessions, no unused one-time links
chargen backup restore <file>           SERVER STOPPED: replace the SQLite database with a verified backup`;

export async function run(argv, { env = process.env, out = console.log } = {}) {
  const [group, cmd, ...rest] = argv;
  const config = loadConfig(env);
  if (group === "backup") return backupCommand(cmd, rest, { config, env, out });   // never opens or migrates the live database first
  const db = await openDatabase(config.databaseUrl);
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
      case "role": await A.setRole(ctx, rest[0], rest[1]); return void out(`${rest[0]} is now ${rest[1]}`);
      case "reset-link": { const t = await A.resetLink(ctx, rest[0]); return void out(`Reset link for ${rest[0]} (works once, until ${when(t.expiresAt)}):\n${config.baseUrl}/reset#k=${t.secret}`); }
      default: throw new A.Refused(USAGE);
    }
  } finally { await db.destroy(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).catch(err => { console.error(err.statusCode ? err.message : err); process.exitCode = 1; });
}

async function backupCommand(cmd, rest, { config, env, out }) {
  const B = await import("./backup/index.mjs");
  const { checkBackup, SANITIZE } = await import("./backup/checks.mjs");
  const urlArg = rest[0] === "--database-url" ? rest[1] : null;
  const report = (r) => { out(JSON.stringify(r)); if (!r.ok) throw new A.Refused(`backup ${cmd}: ${r.problems.join("; ")}`); };
  if (cmd === "create") return report(await B.createBackup({ databaseUrl: config.databaseUrl, dir: env.BACKUP_DIR }));
  if (cmd === "verify" && urlArg) {
    const { sql } = await import("kysely");
    const db = await openDatabase(urlArg);
    try { return report(await checkBackup(async (q) => (await sql.raw(q).execute(db)).rows)); } finally { await db.destroy(); }
  }
  if (cmd === "verify" && rest[0]) return report(await B.backupJob({ action: "verify", file: rest[0] }));
  if (cmd === "sanitize" && urlArg) {
    const { sql } = await import("kysely");
    const db = await openDatabase(urlArg);
    try { for (const q of SANITIZE) await sql.raw(q).execute(db); return void out(JSON.stringify({ ok: true, sanitized: SANITIZE.length })); } finally { await db.destroy(); }
  }
  if (cmd === "restore" && rest[0]) {
    const file = B.sqlitePath(config.databaseUrl);
    if (!file) throw new A.Refused("restore works on a SQLite database; for Postgres/MySQL use the database's own restore, then backup sanitize and verify");
    const { restoreSqlite } = await import("./backup/restore.mjs");
    return report(await restoreSqlite(rest[0], file));
  }
  throw new A.Refused(USAGE);
}
