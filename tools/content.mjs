/**
 * The content: the Foundry system and the sourcebook modules, as files (docs/PLAN-catalog.md, Amendment A).
 * Two sources, one shape:
 *   - `gitFiles` reads a repository's Git OBJECTS at a pinned commit (no shell, no checkout, regular files only) —
 *     what the sync copies from;
 *   - `readVendored` reads this project's own copy in `content/<dir>/` and checks it against its record and the pin.
 * `shapeRepo` turns either into what the catalog build reads.
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, sep } from "node:path";

export const TAG = /^v\d+\.\d+\.\d+$/;
export const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const COMMIT = /^[0-9a-f]{40}$/;
export const RECORD = "CONTENT.json";
/** What the catalog reads from each repository. The book table only matters in the system's (the first pin). */
export const WANTED = ["system.json", "module.json", "packs-src", "module/rules/books.mjs"];

const git = (dir, args, input) => execFileSync("git", ["-C", dir, ...args], { input, maxBuffer: 512 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
/** Git's own id of a file's contents: sha1("blob <size>\0" + bytes). */
export const blobId = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

/** The commit a tag points at in a local repository, or null. */
export function tagCommit(dir, tag) {
  try { return git(dir, ["rev-list", "-n", "1", `refs/tags/${tag}`]).toString().trim(); } catch { return null; }
}

/** Every regular file under `paths` at `commit`: `[{ path, sha }]`. Anything that is not a plain file fails. */
export function listFiles(dir, commit, paths) {
  const out = git(dir, ["ls-tree", "-r", "-z", commit, "--", ...paths]).toString();
  return out.split("\0").filter(Boolean).map(line => {
    const m = /^(\d{6}) (\w+) ([0-9a-f]{40})\t(.*)$/s.exec(line);
    if (!m) throw new Error(`${dir}: unreadable tree entry "${line}"`);
    if (m[1] !== "100644" || m[2] !== "blob") throw new Error(`${dir}: ${m[4]} is not a plain file (mode ${m[1]} ${m[2]}) — refused`);
    return { path: m[4], sha: m[3] };
  });
}

/** The contents of many blobs in one `git cat-file --batch`: a Map sha → Buffer. */
export function readBlobs(dir, shas) {
  const wanted = [...new Set(shas)], out = new Map();
  if (!wanted.length) return out;
  const buf = git(dir, ["cat-file", "--batch"], wanted.join("\n") + "\n");
  let at = 0;
  for (const sha of wanted) {
    const nl = buf.indexOf(10, at), head = buf.subarray(at, nl).toString();
    const m = /^([0-9a-f]+) blob (\d+)$/.exec(head);
    if (!m || m[1] !== sha) throw new Error(`${dir}: unexpected object header "${head}" (wanted ${sha})`);
    const size = Number(m[2]);
    out.set(sha, buf.subarray(nl + 1, nl + 1 + size));
    at = nl + 1 + size + 1;
  }
  return out;
}

/** Check a pin's shape before any of it is used in a command or a path. */
export function checkPin(pin) {
  if (!pin || typeof pin.dir !== "string" || !/^[A-Za-z0-9_.-]+$/.test(pin.dir) || pin.dir.startsWith(".")) throw new Error(`a pin has a bad dir: ${JSON.stringify(pin?.dir)}`);
  if (!REPO.test(String(pin.repo))) throw new Error(`${pin.dir}: bad repo ${JSON.stringify(pin.repo)}`);
  if (!TAG.test(String(pin.tag))) throw new Error(`${pin.dir}: bad tag ${JSON.stringify(pin.tag)}`);
  if (!COMMIT.test(String(pin.commit))) throw new Error(`${pin.dir}: bad commit ${JSON.stringify(pin.commit)}`);
  return pin;
}

/**
 * A pinned repository's files, from its Git objects: a Map path → Buffer, with each blob id. The tag must still
 * point at the pinned commit.
 */
export function gitFiles(repoDir, pin) {
  checkPin(pin);
  if (!existsSync(join(repoDir, ".git"))) throw new Error(`content repository not found: ${repoDir}`);
  const actual = tagCommit(repoDir, pin.tag);
  if (!actual) throw new Error(`${pin.dir}: no tag ${pin.tag}`);
  if (actual !== pin.commit) throw new Error(`${pin.dir}: tag ${pin.tag} points at ${actual.slice(0, 12)}, but the pin says ${pin.commit.slice(0, 12)}`);
  const list = listFiles(repoDir, pin.commit, WANTED);
  const blobs = readBlobs(repoDir, list.map(f => f.sha));
  return { files: new Map(list.map(f => [f.path, blobs.get(f.sha)])), ids: new Map(list.map(f => [f.path, f.sha])) };
}

/** Every file under `root`, as relative POSIX paths. A symlink, or anything but a file or a directory, fails. */
export function walkFiles(root) {
  const out = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name), st = lstatSync(p);
      if (st.isSymbolicLink()) throw new Error(`${relative(root, p)} is a symlink — refused`);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) out.push(relative(root, p).split(sep).join("/"));
      else throw new Error(`${relative(root, p)} is not a regular file — refused`);
    }
  })(root);
  return out.sort();
}

/**
 * This project's copy of one pinned repository, CHECKED (Amendment A3): its record names the same dir, tag and
 * commit as the pin; every recorded file is there with its recorded blob id; nothing else is there.
 */
export function readVendored(contentDir, pin) {
  checkPin(pin);
  const root = join(contentDir, pin.dir);
  if (!existsSync(join(root, RECORD))) throw new Error(`${pin.dir}: no copy in content/ (run: npm run content:sync)`);
  const record = JSON.parse(readFileSync(join(root, RECORD), "utf8"));
  for (const k of ["dir", "repo", "tag", "commit"]) if (record[k] !== pin[k]) throw new Error(`${pin.dir}: the copy is of ${k} ${record[k]}, the pin says ${pin[k]} (run: npm run content:sync)`);
  // (.DS_Store: the Mac's Finder writes one into any folder it opens; it is never content.)
  const listed = Object.keys(record.files ?? {}).sort(), present = walkFiles(root).filter(p => p !== RECORD && !p.endsWith(".DS_Store"));
  const extra = present.filter(p => !(p in record.files)), missing = listed.filter(p => !present.includes(p));
  if (extra.length) throw new Error(`${pin.dir}: files in content/ that the sync didn't write: ${extra.slice(0, 5).join(", ")}`);
  if (missing.length) throw new Error(`${pin.dir}: files missing from content/: ${missing.slice(0, 5).join(", ")}`);
  const files = new Map();
  for (const path of listed) {
    const bytes = readFileSync(join(root, path));
    if (blobId(bytes) !== record.files[path]) throw new Error(`${pin.dir}: ${path} was changed after the sync (content/ changes only through npm run content:sync)`);
    files.set(path, bytes);
  }
  return files;
}

/** content/ holds exactly one directory per pin and nothing else (Finder's .DS_Store aside). */
export function checkContentRoot(contentDir, pins) {
  if (!existsSync(contentDir)) throw new Error(`no content/ — run: npm run content:sync${existsSync(`${contentDir}.old`) ? " (an interrupted sync left content.old: the sync restores it)" : ""}`);
  const want = new Set(pins.map(p => p.dir)), have = readdirSync(contentDir).filter(n => n !== ".DS_Store");
  const extra = have.filter(n => !want.has(n)), missing = [...want].filter(n => !have.includes(n));
  if (extra.length) throw new Error(`content/ holds ${extra.join(", ")}, which no pin names`);
  if (missing.length) throw new Error(`content/ has no copy of ${missing.join(", ")} (run: npm run content:sync)`);
  for (const n of have) if (!lstatSync(join(contentDir, n)).isDirectory()) throw new Error(`content/${n} is not a directory`);
}

/** Files → what the catalog build reads: `{ id, dir, version, tag, commit, manifest, packs, docs, files }`. */
export function shapeRepo(pin, files) {
  const manifestBytes = files.get("system.json") ?? files.get("module.json");
  if (!manifestBytes) throw new Error(`${pin.dir}: no system.json or module.json`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const docs = [];
  for (const [path, bytes] of files) {
    if (!path.startsWith("packs-src/") || !path.endsWith(".json")) continue;
    const parts = path.split("/");
    if (parts.length !== 3) throw new Error(`${pin.dir}: unexpected path ${path}`);
    let doc;
    try { doc = JSON.parse(bytes.toString("utf8")); } catch (err) { throw new Error(`${pin.dir}: ${path} is not valid JSON (${err.message})`, { cause: err }); }
    docs.push({ pack: parts[1], path, doc });
  }
  docs.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { id: manifest.id, dir: pin.dir, version: manifest.version, tag: pin.tag, commit: pin.commit, manifest, files,
    packs: (manifest.packs ?? []).map(p => ({ name: p.name, label: p.label, type: p.type, path: p.path })), docs };
}
