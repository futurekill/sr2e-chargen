/**
 * Read content straight from Git objects at a pinned commit (docs/PLAN-catalog.md §2). No shell, no archive, no
 * temporary files: `git ls-tree` lists the tree, `git cat-file --batch` hands over the blobs. Only regular files
 * are read, so a symlink committed into a pack is refused rather than followed.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const git = (dir, args, input) => execFileSync("git", ["-C", dir, ...args], { input, maxBuffer: 512 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });

/** The commit a tag points at, or null. */
export function tagCommit(dir, tag) {
  try { return git(dir, ["rev-list", "-n", "1", `refs/tags/${tag}`]).toString().trim(); } catch { return null; }
}

/** Every regular file under `path` at `commit`: `[{ path, sha }]`. Anything that is not a plain file fails. */
export function listFiles(dir, commit, path) {
  const out = git(dir, ["ls-tree", "-r", "-z", commit, "--", path]).toString();
  return out.split("\0").filter(Boolean).map(line => {
    const m = /^(\d{6}) (\w+) ([0-9a-f]{40,64})\t(.*)$/s.exec(line);
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

/** One file at a commit, or null when the commit has no such file. */
export function readFile(dir, commit, path) {
  const [f] = listFiles(dir, commit, path).filter(x => x.path === path);
  return f ? readBlobs(dir, [f.sha]).get(f.sha) : null;
}

/**
 * One pinned repository: its manifest and every `packs-src` document, verified against the pin.
 * @returns {{ id, version, tag, commit, manifest, packs: [{ name, label, type }], docs: [{ pack, path, doc }] }}
 */
export function readPinned(contentRoot, { dir, tag, commit }) {
  const repo = join(contentRoot, dir);
  if (!existsSync(join(repo, ".git"))) throw new Error(`content repository not found: ${repo} (set CONTENT_ROOT)`);
  if (!/^[0-9a-f]{40,64}$/.test(String(commit))) throw new Error(`${dir}: the pin has no commit`);
  const actual = tagCommit(repo, tag);
  if (!actual) throw new Error(`${dir}: no tag ${tag}`);
  if (actual !== commit) throw new Error(`${dir}: tag ${tag} points at ${actual.slice(0, 12)}, but the pin says ${commit.slice(0, 12)} — the tag moved (run npm run pins:update if that is intended)`);
  const manifestFile = ["system.json", "module.json"].map(f => [f, readFile(repo, commit, f)]).find(([, b]) => b);
  if (!manifestFile) throw new Error(`${dir}: no system.json or module.json at ${tag}`);
  const manifest = JSON.parse(manifestFile[1].toString("utf8"));
  const files = listFiles(repo, commit, "packs-src").filter(f => f.path.endsWith(".json"));
  const blobs = readBlobs(repo, files.map(f => f.sha));
  const docs = files.map(f => {
    const parts = f.path.split("/");   // packs-src/<pack>/<file>.json
    if (parts.length !== 3) throw new Error(`${dir}: unexpected path ${f.path}`);
    let doc;
    try { doc = JSON.parse(blobs.get(f.sha).toString("utf8")); } catch (err) { throw new Error(`${dir}: ${f.path} is not valid JSON (${err.message})`, { cause: err }); }
    return { pack: parts[1], path: f.path, doc };
  });
  return { id: manifest.id, dir, version: manifest.version, tag, commit, manifest, repo,
    packs: (manifest.packs ?? []).map(p => ({ name: p.name, label: p.label, type: p.type, path: p.path })), docs };
}
