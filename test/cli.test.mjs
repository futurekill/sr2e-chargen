import { test } from "node:test";
import assert from "node:assert/strict";
import { freshUrl } from "./helpers.mjs";
import { run } from "../server/cli.mjs";
import { active } from "../server/auth/passwords.mjs";
import { createContext } from "../server/db/index.mjs";
import * as A from "../server/auth/accounts.mjs";

active.memory = 8192; active.passes = 1;
const env = async () => ({ BASE_URL: "http://localhost:3000", DATABASE_URL: await freshUrl({ file: true }) });
const cli = async (e, ...argv) => { const lines = []; await run(argv, { env: e, out: (l) => lines.push(l) }); return lines.join("\n"); };

test("bootstrap prints a setup link once; a second admin can't be bootstrapped", async () => {
  const e = await env();
  const out = await cli(e, "admin", "bootstrap");
  const secret = /\/redeem#k=([A-Za-z0-9_-]{43})$/.exec(out)?.[1];
  assert.ok(secret, out);
  const ctx = await createContext(e.DATABASE_URL);
  await A.redeem(ctx, { secret, username: "Boss", password: "a perfectly fine password" });
  await ctx.db.destroy();
  await assert.rejects(cli(e, "admin", "bootstrap"), /already an admin/);
  assert.match(await cli(e, "admin", "users"), /Boss {2}admin/);
});

test("invite, list, revoke; disable refuses the last admin; reset link; maintenance", async () => {
  const e = await env();
  const secret = /#k=(.+)$/.exec(await cli(e, "admin", "bootstrap"))[1];
  const ctx = await createContext(e.DATABASE_URL);
  await A.redeem(ctx, { secret, username: "Boss", password: "a perfectly fine password" });
  await ctx.db.destroy();
  assert.match(await cli(e, "admin", "invite", "--role", "admin"), /Invite link/);
  const id = (await cli(e, "admin", "invites")).split("  ")[0];
  assert.equal(await cli(e, "admin", "revoke-invite", id), "revoked");
  assert.equal(await cli(e, "admin", "invites"), "");
  await assert.rejects(cli(e, "admin", "disable", "Boss"), /last admin/);
  assert.match(await cli(e, "admin", "reset-link", "boss"), /\/reset#k=/);
  assert.equal(await cli(e, "maintenance", "on"), "maintenance: on");
  await assert.rejects(cli(e, "admin", "invite"), /maintenance/i);
  assert.equal(await cli(e, "maintenance", "off"), "maintenance: off");   // the one write allowed while it is on
  assert.match(await cli(e, "db", "status"), /"pending":\[\]/);
  await assert.rejects(cli(e, "nonsense"), /chargen admin bootstrap/);
});

test("three bootstrap PROCESSES at once: three links are printed, exactly one makes an admin", async () => {
  const { execFile } = await import("node:child_process"); const { promisify } = await import("node:util");
  const e = await env();
  await cli(e, "db", "migrate");
  const boot = () => promisify(execFile)(process.execPath, ["server/cli.mjs", "admin", "bootstrap"], { env: { ...process.env, ...e } });
  const secrets = (await Promise.all([boot(), boot(), boot()])).map(o => /#k=([A-Za-z0-9_-]{43})/.exec(o.stdout)[1]);
  assert.equal(new Set(secrets).size, 3);
  const ctx = await createContext(e.DATABASE_URL);
  const results = await Promise.allSettled(secrets.map((secret, i) => A.redeem(ctx, { secret, username: `Boss${i}`, password: "a perfectly fine password" })));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await A.listUsers(ctx)).length, 1);
  await ctx.db.destroy();
});
