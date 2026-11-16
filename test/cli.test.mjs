import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../server/cli.mjs";
import { active } from "../server/auth/passwords.mjs";
import { createContext } from "../server/db/index.mjs";
import * as A from "../server/auth/accounts.mjs";

active.memory = 8192; active.passes = 1;
const env = () => ({ BASE_URL: "http://localhost:3000", DATABASE_URL: `sqlite://${join(mkdtempSync(join(tmpdir(), "chargen-")), "t.db")}` });
const cli = async (e, ...argv) => { const lines = []; await run(argv, { env: e, out: (l) => lines.push(l) }); return lines.join("\n"); };

test("bootstrap prints a setup link once; a second admin can't be bootstrapped", async () => {
  const e = env();
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
  const e = env();
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
