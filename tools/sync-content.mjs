#!/usr/bin/env node
/**
 * Make this project's own copy of the content (docs/PLAN-catalog.md, Amendment A2): every pinned repository's files,
 * read from its Git objects at the pinned commit, written to a staging directory, checked, then swapped in for
 * content/ as a whole — never half a copy. Only content/ and content-pins.json are written.
 *
 *   node tools/sync-content.mjs                    copy the current pins from the repositories beside this one
 *   node tools/sync-content.mjs --latest           first move every pin to its repository's newest GitHub release
 *   node tools/sync-content.mjs --fetch            fetch each pinned tag from GitHub into a fresh directory instead
 *   node tools/sync-content.mjs --report <file>    write what changed, as JSON (the daily sync's pull request body)
 * CONTENT_ROOT overrides the directory that holds the repositories (default: the parent of this one).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gitFiles, readVendored, tagCommit, checkPin, blobId, RECORD, TAG } from "./content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The newest release of a public repository (GitHub's API; no token, a generic client name). */
export async function latestRelease(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { "user-agent": "sr2e-chargen-content-sync", accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`${repo}: no latest release (${res.status})`);
  const tag = (await res.json())?.tag_name;
  if (!TAG.test(String(tag))) throw new Error(`${repo}: its latest release has a tag this sync won't use: ${JSON.stringify(String(tag).slice(0, 40))}`);
  return tag;
}

/** Fetch one tag of a public repository into `dir` (a fresh repository), shallow. No shell: arguments are checked. */
export function fetchTag(dir, repo, tag) {
  checkPin({ dir: "x", repo, tag, commit: "0".repeat(40) });
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["-C", dir, "init", "-q"], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "fetch", "-q", "--depth", "1", "--no-tags", `https://github.com/${repo}.git`, `+refs/tags/${tag}:refs/tags/${tag}`], { stdio: ["ignore", "ignore", "pipe"] });
}

/** Write one repository's files and its record into `dir`. */
function writeCopy(dir, pin, files, ids) {
  mkdirSync(dir, { recursive: true });
  const record = { dir: pin.dir, repo: pin.repo, tag: pin.tag, commit: pin.commit, files: {} };
  for (const path of [...files.keys()].sort()) {
    const out = join(dir, ...path.split("/"));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, files.get(path));
    record.files[path] = ids.get(path) ?? blobId(files.get(path));
  }
  writeFileSync(join(dir, RECORD), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * Finish an interrupted swap: `content/` missing while `content.old/` is there means the process stopped between the
 * two renames — the old copy is complete, so it goes back. Called first by every sync.
 */
export function recoverContent(contentDir, fs = { rename: renameSync }) {
  if (!existsSync(contentDir) && existsSync(`${contentDir}.old`)) fs.rename(`${contentDir}.old`, contentDir);
  rmSync(`${contentDir}.staging`, { recursive: true, force: true });
}

/**
 * The whole sync. `pins` is changed in place when `latest` moves one. Returns `{ changes: [{ dir, repo, from, to }] }`.
 * `repoDirOf(pin)` gives the local repository to read (after any fetch).
 */
export async function sync({ pins, contentDir, repoDirOf, latest = false, fetchInto = null, fs = { rename: renameSync } }) {
  recoverContent(contentDir, fs);
  const changes = [];
  for (const pin of pins) {
    checkPin(pin);
    const from = { tag: pin.tag, commit: pin.commit };
    const tag = latest ? await latestRelease(pin.repo) : pin.tag;
    if (fetchInto) fetchTag(join(fetchInto, pin.dir), pin.repo, tag);
    const commit = tagCommit(repoDirOf(pin), tag);
    if (!commit) throw new Error(`${pin.dir}: no tag ${tag} in ${repoDirOf(pin)}`);
    if (latest) { pin.tag = tag; pin.commit = commit; }
    if (from.tag !== pin.tag || from.commit !== pin.commit) changes.push({ dir: pin.dir, repo: pin.repo, from, to: { tag: pin.tag, commit: pin.commit } });
  }
  // Stage the complete copy, check it, then swap it in whole.
  const staging = `${contentDir}.staging`, old = `${contentDir}.old`;
  rmSync(staging, { recursive: true, force: true });
  const codeChanged = [];
  for (const pin of pins) {
    const { files, ids } = gitFiles(repoDirOf(pin), pin);
    writeCopy(join(staging, pin.dir), pin, files, ids);
    // Code the app RUNS changed: the pull request says so, module by module (docs/PLAN-M2.md §1).
    let before = {};
    try { before = JSON.parse(readFileSync(join(contentDir, pin.dir, RECORD), "utf8")).files ?? {}; } catch { /* a first copy */ }
    for (const [path, id] of ids) if (path.endsWith(".mjs") && path !== "module/rules/books.mjs" && before[path] !== id) codeChanged.push(`${pin.dir}/${path}`);
    for (const path of Object.keys(before)) if (path.endsWith(".mjs") && !ids.has(path)) codeChanged.push(`${pin.dir}/${path} (removed)`);
  }
  for (const pin of pins) readVendored(staging, pin);
  // The swap: two renames. A stop between them leaves only content.old — complete — which recoverContent restores.
  rmSync(old, { recursive: true, force: true });
  if (existsSync(contentDir)) fs.rename(contentDir, old);
  fs.rename(staging, contentDir);
  rmSync(old, { recursive: true, force: true });
  return { changes, codeChanged };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), at = args.indexOf("--report");
  const pinsPath = join(ROOT, "content-pins.json"), file = JSON.parse(readFileSync(pinsPath, "utf8"));
  const fetchInto = args.includes("--fetch") ? mkdtempSync(join(tmpdir(), "sr2e-content-")) : null;
  const root = fetchInto ?? (process.env.CONTENT_ROOT ? resolve(process.env.CONTENT_ROOT) : resolve(ROOT, ".."));
  try {
    const report = await sync({ pins: file.content, contentDir: join(ROOT, "content"), repoDirOf: (pin) => join(root, pin.dir), latest: args.includes("--latest"), fetchInto });
    writeFileSync(pinsPath, `${JSON.stringify(file, null, 2)}\n`);
    if (at >= 0) writeFileSync(resolve(args[at + 1]), `${JSON.stringify(report, null, 2)}\n`);
    console.log(report.changes.length ? report.changes.map(c => `${c.dir}: ${c.from.tag} → ${c.to.tag}`).join("\n") : "content: no new releases; the copy matches the pins");
  } catch (err) { console.error(err.message); process.exitCode = 1; }
  finally { if (fetchInto) rmSync(fetchInto, { recursive: true, force: true }); }
}
