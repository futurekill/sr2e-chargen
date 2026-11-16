#!/usr/bin/env node
/**
 * The daily sync's publish step (docs/PLAN-catalog.md, Amendment A6). Runs in the GitHub Action after the sync, the
 * catalog build, the provenance check and the tests; it is the ONLY step that has the write token (GH_TOKEN).
 *   - nothing changed → nothing to publish;
 *   - the branch `content-sync` is replaced only when every commit on it beyond `main` is this sync's own
 *     (trailer `Content-Sync: bot`); a person's commit there stops the run;
 *   - one pull request, opened or updated, its body written to a FILE (upstream strings never pass through a shell);
 *   - a commit status `content-sync / catalog` on the branch head carries the checks' result.
 * Inputs (environment): GH_TOKEN, GITHUB_REPOSITORY, OUTCOMES = JSON { sync, build, verify, test } of step outcomes.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BRANCH = "content-sync", TRAILER = "Content-Sync: bot", STATUS = "content-sync / catalog";
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const tryRun = (cmd, args) => { try { return run(cmd, args); } catch { return null; } };

/** The pull request body, from the sync report and the outcomes. Pure: tests call it. */
export function prBody(report, outcomes) {
  const ok = (k) => (outcomes[k] === "success" ? "passed" : outcomes[k] === "skipped" ? "skipped" : "**FAILED**");
  const rows = (report?.changes ?? []).map(c => `| ${c.dir} | ${c.from.tag} (\`${c.from.commit.slice(0, 12)}\`) | ${c.to.tag} (\`${c.to.commit.slice(0, 12)}\`) |`);
  return [
    "New releases of the content this project keeps a copy of (docs/PLAN-catalog.md, Amendment A).", "",
    "| Repository | From | To |", "|---|---|---|", ...rows, "",
    "| Check | Result |", "|---|---|",
    `| Sync | ${ok("sync")} |`, `| Catalog build | ${ok("build")} |`, `| Provenance (content/ = the pinned commits) | ${ok("verify")} |`, `| Unit tests | ${ok("test")} |`, "",
    Object.values(outcomes).every(v => v === "success") ? "All checks passed in the sync run." :
      "A check FAILED. A new text field in the content usually needs a line in `tools/string-paths.json`: fix it on this branch.",
    "", "This pull request was opened with the repository token, so GitHub holds its CI runs for approval: approve them on the pull request, or merge (CI then runs on `main`).",
    "", "Opened by the daily content sync (`.github/workflows/content-sync.yml`)."
  ].join("\n");
}

/** True when every commit message on the branch beyond main carries the sync's trailer. */
export const onlyOurs = (messages) => messages.every(m => m.split("\n").some(l => l.trim() === TRAILER));

if (import.meta.url === `file://${process.argv[1]}`) {
  const outcomes = JSON.parse(process.env.OUTCOMES ?? "{}"), repo = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN;
  try {
    if (!repo || !token) throw new Error("GITHUB_REPOSITORY and GH_TOKEN are required");
    if (outcomes.sync !== "success") { console.log("The sync itself failed: nothing to publish (see its step)."); process.exit(0); }
    const report = JSON.parse(readFileSync("sync-report.json", "utf8"));
    const changed = run("git", ["status", "--porcelain", "--", "content", "content-pins.json"]);
    if (!report.changes.length || !changed) { console.log("No new releases: nothing to publish."); process.exit(0); }
    const auth = ["-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`];
    // A person's work on the branch is never overwritten.
    if (tryRun("git", [...auth, "fetch", "-q", "origin", `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`]) !== null) {
      const log = run("git", ["log", "--format=%B%x00", `origin/main..origin/${BRANCH}`]).split("\0").map(s => s.trim()).filter(Boolean);
      if (!onlyOurs(log)) throw new Error(`the branch ${BRANCH} has commits the sync didn't make: it was left alone. Merge or delete it, then run the sync again.`);
    }
    run("git", ["config", "user.name", "github-actions[bot]"]);
    run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    run("git", ["checkout", "-q", "-B", BRANCH]);
    run("git", ["add", "--", "content", "content-pins.json"]);
    const subject = `Content: ${report.changes.map(c => `${c.dir} ${c.to.tag}`).join(", ")}`.slice(0, 200);
    run("git", ["commit", "-q", "-m", subject, "-m", TRAILER]);
    run("git", [...auth, "push", "-q", "--force", "origin", `HEAD:refs/heads/${BRANCH}`]);
    const head = run("git", ["rev-parse", "HEAD"]);
    const bodyFile = join(tmpdir(), "content-sync-body.md");
    writeFileSync(bodyFile, prBody(report, outcomes));
    const env = { ...process.env, GH_TOKEN: token };
    const open = run("gh", ["pr", "list", "--repo", repo, "--head", BRANCH, "--state", "open", "--json", "number", "--jq", ".[0].number"], { env });
    try {
      if (open) run("gh", ["pr", "edit", open, "--repo", repo, "--title", subject, "--body-file", bodyFile], { env });
      else run("gh", ["pr", "create", "--repo", repo, "--base", "main", "--head", BRANCH, "--title", subject, "--body-file", bodyFile], { env });
    } catch (err) {
      throw new Error(`the pull request could not be opened (${String(err.stderr ?? err.message).trim().slice(0, 200)}). If it says GitHub Actions is not permitted to create pull requests: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".`, { cause: err });
    }
    const allOk = ["sync", "build", "verify", "test"].every(k => outcomes[k] === "success");
    run("gh", ["api", "-X", "POST", `repos/${repo}/statuses/${head}`, "-f", `state=${allOk ? "success" : "failure"}`, "-f", `context=${STATUS}`,
      "-f", `description=${allOk ? "The new content builds, matches upstream, and the tests pass" : "A check failed in the sync run: see the pull request"}`], { env });
    console.log(`Published ${BRANCH} (${head.slice(0, 12)})${existsSync(bodyFile) ? "" : ""}.`);
  } catch (err) { console.error(err.message); process.exit(1); }
}
