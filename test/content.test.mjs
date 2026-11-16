/** The project's own copy of the content (docs/PLAN-catalog.md, Amendment A): sync, local check, provenance. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, symlinkSync, rmSync, existsSync, readdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { blobId, readVendored, gitFiles, checkPin, checkContentRoot, RECORD } from "../tools/content.mjs";
import { sync, recoverContent } from "../tools/sync-content.mjs";
import { compareWithTree } from "../tools/verify-content.mjs";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { prBody, redact } from "../tools/content-pr.mjs";

const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid", GIT_CONFIG_GLOBAL: "/dev/null" } }).trim();
/** A content repository made by the test: a manifest, two pack files, a README the copy must NOT take; tagged. */
function fixtureRepo(root, dir = "sr2e-test-book", tag = "v1.0.0", extra = {}) {
  const repo = join(root, dir);
  mkdirSync(join(repo, "packs-src/gear"), { recursive: true });
  git(root, "init", "-q", repo);
  writeFileSync(join(repo, "module.json"), JSON.stringify({ id: dir, version: tag.slice(1), packs: [{ name: "gear", label: "Gear", type: "Item" }] }));
  writeFileSync(join(repo, "packs-src/gear/a.json"), JSON.stringify({ _id: "aaaaaaaaaaaaaaaa", name: "A" }));
  writeFileSync(join(repo, "packs-src/gear/b.json"), JSON.stringify({ _id: "bbbbbbbbbbbbbbbb", name: "B", ...extra }));
  writeFileSync(join(repo, "README.md"), "not content");
  git(repo, "add", "-A"); git(repo, "commit", "-q", "--no-gpg-sign", "-m", "content"); git(repo, "tag", tag);
  return { dir, repo: `owner/${dir}`, tag, commit: git(repo, "rev-parse", "HEAD") };
}
const scratch = () => mkdtempSync(join(tmpdir(), "content-test-"));

test("blobId is git's own id", () => {
  const root = scratch(), file = join(root, "x"); writeFileSync(file, "hello\n");
  assert.equal(blobId(readFileSync(file)), execFileSync("git", ["hash-object", file], { encoding: "utf8" }).trim());
});

test("pins are checked before use: dir, repo, tag and commit shapes", () => {
  const good = { dir: "sr2e-x", repo: "owner/sr2e-x", tag: "v1.2.3", commit: "a".repeat(40) };
  assert.equal(checkPin(good), good);
  for (const bad of [{ dir: "../x" }, { dir: ".hidden" }, { repo: "owner/x; rm -rf /" }, { repo: "x" }, { tag: "v1.2.3; echo" }, { tag: "main" }, { tag: "--upload-pack=x" }, { commit: "HEAD" }])
    assert.throws(() => checkPin({ ...good, ...bad }), JSON.stringify(bad));
});

test("the sync copies exactly the wanted files at the pinned commit, with a record, and the copy builds a shape", async () => {
  const root = scratch(), pin = fixtureRepo(root), content = join(root, "content");
  // A later, untagged commit must not leak in: the copy is the PINNED commit's.
  writeFileSync(join(root, pin.dir, "packs-src/gear/c.json"), "{}"); git(join(root, pin.dir), "add", "-A"); git(join(root, pin.dir), "commit", "-q", "--no-gpg-sign", "-m", "later");
  const report = await sync({ pins: [pin], contentDir: content, repoDirOf: (p) => join(root, p.dir) });
  assert.deepEqual(report.changes, []);
  assert.deepEqual(readdirSync(join(content, pin.dir)).sort(), [RECORD, "module.json", "packs-src"]);   // no README
  assert.deepEqual(readdirSync(join(content, pin.dir, "packs-src/gear")).sort(), ["a.json", "b.json"]);
  const record = JSON.parse(readFileSync(join(content, pin.dir, RECORD), "utf8"));
  assert.deepEqual({ ...record, files: undefined }, { ...pin, files: undefined });
  assert.equal(record.files["packs-src/gear/a.json"], blobId(readFileSync(join(content, pin.dir, "packs-src/gear/a.json"))));
  assert.equal(readVendored(content, pin).size, 3);
  assert.equal(existsSync(`${content}.staging`) || existsSync(`${content}.old`), false);
});

test("a stop between the two renames of the swap leaves a complete copy, which the next sync restores", async () => {
  const root = scratch(), pin = fixtureRepo(root), content = join(root, "content");
  await sync({ pins: [pin], contentDir: content, repoDirOf: (p) => join(root, p.dir) });
  let calls = 0;
  const failing = { rename: (a, b) => { if (++calls === 2) throw new Error("power cut"); renameSync(a, b); } };
  await assert.rejects(sync({ pins: [pin], contentDir: content, repoDirOf: (p) => join(root, p.dir), fs: failing }), /power cut/);
  assert.equal(existsSync(content), false);                                   // the worst moment: no content/…
  assert.equal(readVendored(`${content}.old`, pin).size, 3);                  // …but the old copy is complete
  assert.throws(() => checkContentRoot(content, [pin]), /content\.old/);      // the build says what happened
  recoverContent(content);
  assert.equal(readVendored(content, pin).size, 3);
  await sync({ pins: [pin], contentDir: content, repoDirOf: (p) => join(root, p.dir) });   // and a sync works again
  assert.equal(existsSync(`${content}.old`) || existsSync(`${content}.staging`), false);
});

test("content/ holds exactly the pinned directories", async () => {
  const root = scratch(), pin = fixtureRepo(root), content = join(root, "content");
  await sync({ pins: [pin], contentDir: content, repoDirOf: (p) => join(root, p.dir) });
  checkContentRoot(content, [pin]);
  writeFileSync(join(content, "extra.json"), "{}");
  assert.throws(() => checkContentRoot(content, [pin]), /holds extra\.json, which no pin names/);
  rmSync(join(content, "extra.json")); mkdirSync(join(content, "sr2e-unpinned"));
  assert.throws(() => checkContentRoot(content, [pin]), /sr2e-unpinned/);
  rmSync(join(content, "sr2e-unpinned"), { recursive: true });
  assert.throws(() => checkContentRoot(content, [pin, { ...pin, dir: "sr2e-other" }]), /no copy of sr2e-other/);
});

test("a moved tag stops the sync, and a failure leaves the old copy whole", async () => {
  const root = scratch(), pin = fixtureRepo(root), content = join(root, "content");
  await sync({ pins: [pin], contentDir: content, repoDirOf: (p) => join(root, p.dir) });
  const before = readFileSync(join(content, pin.dir, RECORD), "utf8");
  git(join(root, pin.dir), "tag", "-f", pin.tag, "HEAD~0");   // same commit: fine
  writeFileSync(join(root, pin.dir, "packs-src/gear/c.json"), "{}"); git(join(root, pin.dir), "add", "-A"); git(join(root, pin.dir), "commit", "-q", "--no-gpg-sign", "-m", "x");
  git(join(root, pin.dir), "tag", "-f", pin.tag);              // the tag MOVED to a new commit
  await assert.rejects(sync({ pins: [pin], contentDir: content, repoDirOf: (p) => join(root, p.dir) }), /points at .* but the pin says/);
  assert.equal(readFileSync(join(content, pin.dir, RECORD), "utf8"), before);
  assert.equal(readVendored(content, pin).size, 3);
});

test("the local check refuses a changed byte, a missing file, an extra file, a symlink, and a record of other pins", async () => {
  const fresh = async () => { const root = scratch(), pin = fixtureRepo(root), content = join(root, "content"); await sync({ pins: [pin], contentDir: content, repoDirOf: (p) => join(root, p.dir) }); return { pin, content, dir: join(content, pin.dir) }; };
  let c = await fresh();
  writeFileSync(join(c.dir, "packs-src/gear/a.json"), JSON.stringify({ _id: "aaaaaaaaaaaaaaaa", name: "Edited" }));
  assert.throws(() => readVendored(c.content, c.pin), /a\.json was changed after the sync/);
  c = await fresh(); rmSync(join(c.dir, "packs-src/gear/b.json"));
  assert.throws(() => readVendored(c.content, c.pin), /missing from content/);
  c = await fresh(); writeFileSync(join(c.dir, "packs-src/gear/new.json"), "{}");
  assert.throws(() => readVendored(c.content, c.pin), /didn't write: packs-src\/gear\/new\.json/);
  c = await fresh(); symlinkSync("/etc/passwd", join(c.dir, "packs-src/gear/link.json"));
  assert.throws(() => readVendored(c.content, c.pin), /symlink/);
  c = await fresh();
  assert.throws(() => readVendored(c.content, { ...c.pin, tag: "v1.0.1" }), /the copy is of tag v1\.0\.0/);
  assert.throws(() => readVendored(c.content, { ...c.pin, commit: "f".repeat(40) }), /the copy is of commit/);
  c = await fresh(); writeFileSync(join(c.dir, ".DS_Store"), "finder");      // the Finder's file is not content
  assert.equal(readVendored(c.content, c.pin).size, 3);
});

test("provenance: a file edited WITH its record updated still differs from the upstream tree", async () => {
  const root = scratch(), pin = fixtureRepo(root), content = join(root, "content");
  await sync({ pins: [pin], contentDir: content, repoDirOf: (p) => join(root, p.dir) });
  assert.deepEqual(compareWithTree(content, pin, join(root, pin.dir)), []);
  const file = join(content, pin.dir, "packs-src/gear/a.json"), edited = Buffer.from(JSON.stringify({ _id: "aaaaaaaaaaaaaaaa", name: "Forged" }));
  writeFileSync(file, edited);
  const recordFile = join(content, pin.dir, RECORD), record = JSON.parse(readFileSync(recordFile, "utf8"));
  record.files["packs-src/gear/a.json"] = blobId(edited); writeFileSync(recordFile, JSON.stringify(record));
  assert.equal(readVendored(content, pin).size, 3);                                         // the local check is fooled…
  assert.deepEqual(compareWithTree(content, pin, join(root, pin.dir)), [`${pin.dir}: packs-src/gear/a.json differs from ${pin.repo} at ${pin.tag}`]);   // …provenance is not
  rmSync(join(content, pin.dir, "packs-src/gear/b.json"));
  writeFileSync(join(content, pin.dir, "packs-src/gear/extra.json"), "{}");
  const problems = compareWithTree(content, pin, join(root, pin.dir));
  assert.ok(problems.some(p => /extra\.json is not in/.test(p)) && problems.some(p => /b\.json .* is missing/.test(p)), problems.join("\n"));
});

test("gitFiles refuses a symlink committed into a pack", () => {
  const root = scratch(), pin = fixtureRepo(root), repo = join(root, pin.dir);
  symlinkSync("../../module.json", join(repo, "packs-src/gear/link.json"));
  git(repo, "add", "-A"); git(repo, "commit", "-q", "--no-gpg-sign", "-m", "link"); git(repo, "tag", "-f", pin.tag);
  assert.throws(() => gitFiles(repo, { ...pin, commit: git(repo, "rev-parse", "HEAD") }), /is not a plain file/);
});

test("the pull request body lists every book; a repair says so; the token never reaches printed text", () => {
  const pins = [{ dir: "sr2e-x", tag: "v1.1.0", commit: "b".repeat(40) }, { dir: "sr2e-y", tag: "v2.0.0", commit: "c".repeat(40) }];
  const changes = [{ dir: "sr2e-x", from: { tag: "v1.0.0", commit: "a".repeat(40) }, to: { tag: "v1.1.0", commit: "b".repeat(40) } }];
  const body = prBody({ pins, report: { changes }, outcomes: { sync: "success", build: "failure", verify: "success", test: "skipped" }, runUrl: "https://x/run/1" });
  assert.match(body, /\| sr2e-x \| v1\.0\.0 \(`aaaaaaaaaaaa`\) \| \*\*v1\.1\.0 \(`bbbbbbbbbbbb`\)\*\* \|/);
  assert.match(body, /\| sr2e-y \| v2\.0\.0 \(`cccccccccccc`\) \| unchanged \|/);   // an unchanged book is listed too
  assert.match(body, /\| Catalog build \| \*\*FAILED\*\* \|/);
  assert.match(body, /tools\/string-paths\.json/);
  assert.match(prBody({ pins, report: { changes: [] }, outcomes: {}, runUrl: "u" }), /^\*\*Repair:\*\*/);
  const token = "ghs_SECRETsecret123", b64 = Buffer.from(`x-access-token:${token}`).toString("base64");
  const leaked = `fatal: push failed: git -c http.extraheader=AUTHORIZATION: basic ${b64} push … token ${token}`;
  assert.equal(redact(leaked, token).includes(token) || redact(leaked, token).includes(b64), false);
});

test("the project's real copy builds and matches content-pins.json", { skip: !existsSync(new URL("../content/", import.meta.url)) && "no content/" }, () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const pins = JSON.parse(readFileSync(join(root, "content-pins.json"), "utf8")).content;
  const catalog = buildCatalog({ pins, contentDir: join(root, "content") });
  assert.ok(catalog.entries.length > 1000);
  assert.deepEqual(catalog.pins.map(p => [p.dir, p.tag, p.commit]), pins.map(p => [p.dir, p.tag, p.commit]));
});
