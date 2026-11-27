/** The footer's data (docs/PLAN-help-footer.md 2): the version to anyone, the content only signed in; the links. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testContext, PW } from "./helpers.mjs";
import { buildApp } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import * as A from "../server/auth/accounts.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("What's new: the CHANGELOG's releases, newest first, items joined, Unreleased and code marks left out", async () => {
  const { releases } = await import("../shared/changelog.mjs");
  const md = "# Changelog\n\nIntro.\n\n## Unreleased\n- Not yet.\n\n## 1.1.0 — 2026-11-27\nA note.\n- Added: **Help**\n  in the app.\n- Fixed: `x` works.\n\n## 1.0.0 — 2026-11-26 (not published)\n- One.\n";
  assert.deepEqual(releases(md), [
    { version: "1.1.0", date: "2026-11-27", note: "", paragraphs: ["A note."], items: ["Added: **Help** in the app.", "Fixed: x works."] },
    { version: "1.0.0", date: "2026-11-26", note: "not published", paragraphs: [], items: ["One."] }]);
  const real = releases(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"), 3);
  assert.equal(real[0].version, pkg.version, "the newest release is this version");
  assert.ok(real.every(r => r.items.length || r.paragraphs.length));
});


test("GET /api/about: the app version to anyone, nothing else; /api/about/content only with a session", async () => {
  const t = await testContext(), ORIGIN = "https://hoi.example";
  const catalog = { byId: new Map(), vehicles: new Map(), index: [], manifest: { books: [], pins: [{ id: "sr2e", dir: "sr2e-foundryvtt", version: "0.171.0", tag: "v0.171.0", commit: "x" }] } };
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog });
  const open = await app.inject({ url: "/api/about" });
  assert.equal(open.statusCode, 200);
  assert.deepEqual(open.json(), { app: pkg.version });
  assert.equal((await app.inject({ url: "/api/about/content" })).statusCode, 401, "the content list needs a session");
  const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret: (await A.bootstrap(t.ctx)).secret, username: "Boss", password: PW } });
  const cookie = res.headers["set-cookie"].split(";")[0];
  assert.deepEqual((await app.inject({ url: "/api/about/content", headers: { cookie } })).json(), { content: [{ id: "sr2e", name: "sr2e-foundryvtt", version: "0.171.0" }] }, "no commit, nothing else");
  await app.close();
});
