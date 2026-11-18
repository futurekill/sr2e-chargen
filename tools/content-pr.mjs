#!/usr/bin/env node
/**
 * The daily sync's publish step (docs/PLAN-catalog.md, Amendment A6). It runs in its OWN job, the only one with the
 * write token (GH_TOKEN), after a read-only job made the new copy and ran the checks (handed over as an artifact).
 *   - The copy differs from main (a new release, or a repair) → one pull request on `content-sync`, opened or updated.
 *   - The branch is replaced only when its head is the sync's own last commit — proved by the commit status that only
 *     this workflow's token can write (`content-sync / catalog`, created by github-actions[bot]) — and has exactly
 *     one commit beyond main. The push is leased against the head that was checked, so a push in between is kept.
 *   - Every body row and status is computed here; upstream strings never pass through a shell; the body is a file.
 *   - The token reaches git through the environment, never the command line, and every error is redacted.
 * Inputs (environment): GH_TOKEN, GITHUB_REPOSITORY, GITHUB_SERVER_URL, GITHUB_RUN_ID, OUTCOMES = JSON
 * { sync, build, verify, test }. Files: sync-report.json and the copy, applied to this checkout by the workflow.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BRANCH = "content-sync", STATUS = "content-sync / catalog", BOT = "github-actions[bot]";

/** The pull request body: every book, its old and new version, and each check. Pure: tests call it. */
export function prBody({ pins, report, outcomes, runUrl }) {
  const ok = (k) => (outcomes[k] === "success" ? "passed" : outcomes[k] === "skipped" ? "skipped" : "**FAILED**");
  const moved = new Map((report?.changes ?? []).map(c => [c.dir, c]));
  const short = (v) => `${v.tag} (\`${v.commit.slice(0, 12)}\`)`;
  const rows = pins.map(p => { const c = moved.get(p.dir); return `| ${p.dir} | ${short(c ? c.from : p)} | ${c ? `**${short(c.to)}**` : `${short(p)} (unchanged)`} |`; });
  return [
    moved.size ? "New releases of the content this project keeps a copy of (docs/PLAN-catalog.md, Amendment A)."
      : "**Repair:** content/ on main differed from the pinned commits; this restores it (no release moved).", "",
    "| Repository | Was | Now |", "|---|---|---|", ...rows, "",
    "| Check (in the sync run) | Result |", "|---|---|",
    `| Sync | ${ok("sync")} |`, `| Catalog build | ${ok("build")} |`, `| Provenance (content/ = the pinned commits) | ${ok("verify")} |`, `| Unit tests | ${ok("test")} |`, "",
    ...(report?.codeChanged?.length ? ["**RULES CODE CHANGED — the app runs these modules. Review the diff as code, not data:**", ...report.codeChanged.map(p => `- \`${p}\``), ""] : []),
    Object.values(outcomes).every(v => v === "success") ? "All checks passed in the sync run." :
      "A check FAILED. A new text field in the content usually needs a line in `tools/string-paths.json`: fix it on this branch (the next daily sync then leaves the branch alone).",
    "", "This pull request was opened with the repository token, so GitHub holds its CI runs for approval: approve them on the pull request, or merge (CI then runs on `main`).",
    "", `Sync run: ${runUrl}`
  ].join("\n");
}

/** Remove the token and anything derived from it from text that may be printed. */
export const redact = (text, token) => (token ? String(text).split(token).join("***").split(Buffer.from(`x-access-token:${token}`).toString("base64")).join("***") : String(text));

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.GH_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  const runUrl = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const outcomes = JSON.parse(process.env.OUTCOMES || "{}");   // empty when the sync job stopped before its result step
  // git authenticates through the environment (GIT_CONFIG_*), never an argument a failure would print.
  const gitEnv = { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}` };
  const run = (cmd, args, env = gitEnv) => execFileSync(cmd, args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
  const api = (args) => run("gh", ["api", ...args]);
  const setStatus = (sha, state, description) => api(["-X", "POST", `repos/${repo}/statuses/${sha}`, "-f", `state=${state}`, "-f", `context=${STATUS}`, "-f", `description=${description}`, "-f", `target_url=${runUrl}`]);
  const openPr = () => run("gh", ["pr", "list", "--repo", repo, "--head", BRANCH, "--state", "open", "--json", "number", "--jq", ".[0].number"]);
  try {
    if (!repo || !token) throw new Error("GITHUB_REPOSITORY and GH_TOKEN are required");
    // The branch as it is now: absent, or a head sha. `ls-remote` exits 0 with nothing when the branch is absent;
    // any other failure stops the run (never read as "absent").
    const remoteHead = run("git", ["ls-remote", "--heads", "origin", `refs/heads/${BRANCH}`]).split(/\s+/)[0] || "";
    if (outcomes.sync !== "success") {
      // The sync itself failed: nothing new to publish, but an open pull request must not keep showing an old success.
      const pr = openPr();
      if (pr && remoteHead) {
        setStatus(remoteHead, "failure", "The latest daily sync failed: see its run");
        run("gh", ["pr", "comment", pr, "--repo", repo, "--body", `The daily content sync failed before it could check new releases: ${runUrl}`]);
      }
      console.log("The sync itself failed: nothing to publish.");
      process.exit(0);
    }
    const pins = JSON.parse(readFileSync("content-pins.json", "utf8")).content;
    const report = JSON.parse(readFileSync("sync-report.json", "utf8"));
    if (!run("git", ["status", "--porcelain", "--", "content", "content-pins.json"])) { console.log("content/ and the pins match main: nothing to publish."); process.exit(0); }
    // Only the sync's OWN last commit may be replaced: one commit beyond main, carrying the status this token wrote.
    if (remoteHead) {
      run("git", ["fetch", "-q", "origin", `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`]);
      const beyond = run("git", ["rev-list", "--count", `origin/main..origin/${BRANCH}`]);
      const statuses = JSON.parse(api([`repos/${repo}/commits/${remoteHead}/statuses`, "--paginate"]) || "[]");
      const ours = statuses.some(s => s.context === STATUS && s.creator?.login === BOT);
      if (beyond !== "1" || !ours) throw new Error(`the branch ${BRANCH} has work the sync didn't make (${beyond} commits beyond main; head ${ours ? "is" : "is NOT"} the sync's): it was left alone. Merge or delete it, then run the sync again.`);
    }
    run("git", ["config", "user.name", BOT]);
    run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    run("git", ["checkout", "-q", "-B", BRANCH]);
    run("git", ["add", "--", "content", "content-pins.json"]);
    const code = report.codeChanged?.length ? "Content + RULES CODE" : "Content";   // code the app runs: review it as code
    const subject = (report.changes.length ? `${code}: ${report.changes.map(c => `${c.dir} ${c.to.tag}`).join(", ")}` : `${code}: repair content/ to the pinned commits`).slice(0, 200);
    run("git", ["commit", "-q", "-m", subject, "-m", "Content-Sync: bot"]);
    // Leased against the head checked above ("" = the branch must still be absent): a push in between is kept.
    run("git", ["push", "-q", `--force-with-lease=refs/heads/${BRANCH}:${remoteHead}`, "origin", `HEAD:refs/heads/${BRANCH}`]);
    const head = run("git", ["rev-parse", "HEAD"]);
    const allOk = ["sync", "build", "verify", "test"].every(k => outcomes[k] === "success");
    setStatus(head, allOk ? "success" : "failure", allOk ? "The new content builds, matches upstream, and the tests pass" : "A check failed in the sync run: see the pull request");
    const bodyDir = mkdtempSync(join(tmpdir(), "content-sync-")), bodyFile = join(bodyDir, "body.md");
    writeFileSync(bodyFile, prBody({ pins, report, outcomes, runUrl }), { mode: 0o600 });
    try {
      const pr = openPr();
      if (pr) run("gh", ["pr", "edit", pr, "--repo", repo, "--title", subject, "--body-file", bodyFile]);
      else run("gh", ["pr", "create", "--repo", repo, "--base", "main", "--head", BRANCH, "--title", subject, "--body-file", bodyFile]);
    } catch (err) {
      throw new Error(`the pull request could not be opened (${String(err.stderr ?? err.message).trim().slice(0, 300)}). If GitHub Actions may not create pull requests: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".`, { cause: err });
    } finally { rmSync(bodyDir, { recursive: true, force: true }); }
    console.log(`Published ${BRANCH} (${head.slice(0, 12)}).${existsSync("sync-report.json") ? "" : ""}`);
  } catch (err) {
    console.error(redact(`${err.message}${err.stderr ? `\n${err.stderr}` : ""}`, token));
    process.exit(1);
  }
}
