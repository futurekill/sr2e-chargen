#!/usr/bin/env node
/**
 * Provenance (docs/PLAN-catalog.md, Amendment A3b): content/ is EXACTLY the pinned commits' files. Each pinned commit
 * is fetched from its public repository and its tree compared with the copy — paths and blob ids computed from the
 * bytes on disk, never from the copy's own record, which only an offline check uses. The tag must still point at
 * the commit. CI runs this on every push; the daily sync runs it too.
 *
 *   node tools/verify-content.mjs            fetch from GitHub (network)
 *   node tools/verify-content.mjs --local    use the repositories beside this one (CONTENT_ROOT), no network
 */
import { readFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles, walkFiles, blobId, checkPin, tagCommit, WANTED, RECORD } from "./content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Compare one pin's copy with the tree of the pinned commit in `repoDir`. Returns the differences, as text. */
export function compareWithTree(contentDir, pin, repoDir) {
  const tree = new Map(listFiles(repoDir, pin.commit, WANTED).map(f => [f.path, f.sha]));
  const root = join(contentDir, pin.dir), present = walkFiles(root).filter(p => p !== RECORD);
  const problems = [];
  for (const path of present) {
    if (!tree.has(path)) problems.push(`${pin.dir}: ${path} is not in ${pin.repo} at ${pin.tag}`);
    else if (blobId(readFileSync(join(root, path))) !== tree.get(path)) problems.push(`${pin.dir}: ${path} differs from ${pin.repo} at ${pin.tag}`);
  }
  for (const path of tree.keys()) if (!present.includes(path)) problems.push(`${pin.dir}: ${path} (in ${pin.repo} at ${pin.tag}) is missing from content/`);
  return problems;
}

/** The commit a remote tag points at (peeled), from `git ls-remote`; null when there is no such tag. */
function remoteTagCommit(repo, tag) {
  const out = execFileSync("git", ["ls-remote", "--tags", `https://github.com/${repo}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).toString();
  const lines = out.trim().split("\n").filter(Boolean).map(l => l.split("\t"));
  return (lines.find(([, ref]) => ref.endsWith("^{}")) ?? lines[0])?.[0] ?? null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const local = process.argv.includes("--local");
  const pins = JSON.parse(readFileSync(join(ROOT, "content-pins.json"), "utf8")).content;
  const scratch = local ? null : mkdtempSync(join(tmpdir(), "sr2e-verify-"));
  const problems = [];
  try {
    for (const pin of pins) {
      checkPin(pin);
      let repoDir;
      if (local) {
        repoDir = join(process.env.CONTENT_ROOT ? resolve(process.env.CONTENT_ROOT) : resolve(ROOT, ".."), pin.dir);
        if (tagCommit(repoDir, pin.tag) !== pin.commit) problems.push(`${pin.dir}: the local tag ${pin.tag} doesn't point at the pinned commit`);
      } else {
        const tagAt = remoteTagCommit(pin.repo, pin.tag);
        if (tagAt !== pin.commit) problems.push(`${pin.dir}: ${pin.repo} tag ${pin.tag} points at ${String(tagAt).slice(0, 12)}, not the pinned ${pin.commit.slice(0, 12)}`);
        repoDir = join(scratch, pin.dir);
        mkdirSync(repoDir, { recursive: true });
        execFileSync("git", ["-C", repoDir, "init", "-q"], { stdio: "ignore" });
        execFileSync("git", ["-C", repoDir, "fetch", "-q", "--depth", "1", "--no-tags", `https://github.com/${pin.repo}.git`, pin.commit], { stdio: ["ignore", "ignore", "pipe"] });
      }
      problems.push(...compareWithTree(join(ROOT, "content"), pin, repoDir));
    }
  } catch (err) { problems.push(err.message); }
  finally { if (scratch) rmSync(scratch, { recursive: true, force: true }); }
  if (problems.length) { console.error(`content/ is not the pinned content:\n  ${problems.slice(0, 40).join("\n  ")}`); process.exit(1); }
  console.log(`content/ matches ${pins.length} pinned commits${local ? " (local repositories)" : " on GitHub"}`);
}
