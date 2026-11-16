# Code Review Log: milestone 1 — the catalog
Codex gpt-6-sol; round 1 high effort, later rounds fix-only at medium; a fresh session per round.

## Round 1 (REVISE, 9 findings)
1. **Critical — pinned content executes code during the build.** [tools/build-catalog.mjs:100](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:100) rejects static imports but then imports `books.mjs` as a `data:` URL. A newly pinned version can use `await import("node:fs")` and run arbitrary code on the build host. **Fix:** Extract and validate the book table without evaluating the module.

2. **High — the U12 string audit has open-ended data paths.** [tools/string-paths.json:22](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/string-paths.json:22) classifies every `system.effects.*` string as data. Adding `system.effects.bookExcerpt` with book prose builds successfully and leaves that prose in `system`; I reproduced this with the fixture. **Fix:** Enumerate permitted keys and validate formula values instead of accepting arbitrary keys.

3. **High — book wording can reach search summaries.** [tools/build-catalog.mjs:79](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:79) copies `system.category` into `category`, which [server/catalog.mjs:11](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/catalog.mjs:11) returns in every summary. A prose paragraph placed in `system.category` passes classification as data and appears in results; I reproduced this with the fixture. **Fix:** Validate category against known category values, or source-tag free text before exposing it.

4. **High — uncited core entries are assigned to VR2 in the real catalog.** [tools/build-catalog.mjs:114](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:114) reverses `BOOKS.module` with last key winning; both `sr2` and `vr2` name package `sr2e`. The real build assigns all 18 uncited core contacts and archetypes `listBook: "vr2"`, so turning off VR2 hides them and tags their text as VR2. The two-book [test fixture](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/fixtures/make-catalog.mjs:10) misses this. **Fix:** Define the canonical package book explicitly, with `sr2e → sr2`, and test against the real duplicate mapping.

5. **Medium — retained flags and effect changes bypass the U12 audit.** [tools/build-catalog.mjs:86](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:86) copies all `flags.sr2e` and effect change values without string classification. Book prose in `flags.sr2e.note` or `effects[].changes[].value` survives untagged in a full entry. **Fix:** Audit retained string values in flags and effects while preserving validated rule data.

6. **Medium — the image gate accepts a false manifest.** [server/catalog.mjs:25](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/catalog.mjs:25) checks the catalog file’s hash but never compares the manifest’s books, types, counts or pins with that file. Changing only `manifest.json` can make `/api/catalog` advertise the wrong filters while [tools/check-catalog.mjs:13](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/check-catalog.mjs:13) still passes. **Fix:** Recompute and compare every manifest field from the verified catalog body.

7. **Medium — the no-book citation exception is unrestricted.** [tools/build-catalog.mjs:92](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:92) accepts `citation.book: "none"` on any top-level item. Changing a sourced weapon to `none` removes its badge and makes its wording inherit the package book; the plan reserves that exception for the known contacts. **Fix:** Allowlist the no-book contacts and require a valid page for other cited items.

8. **Low — the pin check does not compare repository directories.** [server/catalog.mjs:36](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/catalog.mjs:36) builds the “have” directory from the *current* pins, so changing a pin’s `dir` while retaining its tag and commit passes the claimed exact-pin check. **Fix:** Record `dir` in catalog pins and compare it with the expected value.

9. **Low — the default catalog path breaks in directories with spaces.** [server/config.mjs:21](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/config.mjs:21) uses a URL’s percent-encoded `.pathname`; under `/Users/A B/...`, startup looks for `A%20B` and rejects the catalog. **Fix:** Convert the file URL with `fileURLToPath()`.

The test run passed 11 of 13 tests. Two could not create temporary directories under this read-only sandbox (`EPERM`), so their assertions did not run.

VERDICT: REVISE

### Claude's response
All 9 fixed.
- #1 the book table is parsed line by line, never imported (a pinned commit is data).
- #2, #3, #5 no wildcards in tools/string-paths.json: every key is listed; data strings have a length limit and one line; a category must be a short key; `flags.sr2e` goes through the same classification (a drug's notes are text); effect names and changes are checked.
- #4 a package's book is the FIRST book that names it, and the core package must map to sr2 (18 real entries had been listed under VR2). The fixture now has the second core book.
- #6 the server recomputes the manifest from the checked catalog body. #7 only a contact may cite "none"; a citation needs a page. #8 the pin's directory is recorded and compared. #9 `fileURLToPath`.

## Round 2 — fix-only (REVISE, 4 findings)
- [tools/build-catalog.mjs:24](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:24) — **Finding 2 remains:** a sentence in `system.effects.acceleration` passes because formula validation checks only length and line breaks. Fix: validate permitted formula syntax.
- [tools/string-paths.json:18](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/string-paths.json:18) — **Finding 3 remains:** `system.category = "quick_brown_fox_jumps_over_lazy_dog"` passes and appears in search summaries, though it can be book wording. Fix: allow known category values.
- [tools/build-catalog.mjs:71](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:71) — **Finding 5 remains:** a short prose sentence in `effects[].changes[].value` passes and remains untagged; reproduced with “The printed rule says the bearer gains this power at dawn.” Fix: validate change values according to their rule type.
- [tools/build-catalog.mjs:120](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:120) — **Finding 7 remains:** changing a sourced contact such as Talismonger to `citation.book: "none"` passes, because every contact is exempt. A cited item also accepts `page: "banana"`. Fix: allowlist the eleven uncited contacts and validate cited pages against the system’s page format.

VERDICT: REVISE

### Claude's response
All 4 accepted: a data string may not read as a sentence (more than 4 words in a row), on top of its length limit; a category must be one of the listed values; an effect change must have the SHAPE of rule data (a system path, a number, a mode word); only the eleven listed contacts may cite "none", and a page must look like a page. The real catalog is byte-identical after these checks.

## Round 3 — fix-only (REVISE, 1 finding)
- [tools/build-catalog.mjs:25](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:25) — Round-2 finding 2 remains. Setting `system.effects.acceleration` to `"The vehicle gains speed. The rigger gains control."` builds successfully and leaves both prose sentences untagged; the word-run check resets at punctuation. **Fix:** Validate formula paths against permitted rule-expression syntax.

VERDICT: REVISE

### Claude's response
Accepted: a data string that contains a sentence word (the, is, are, gains, with …) is refused too, so short sentences split by punctuation don't pass. Checked against the pinned content: no data string uses one. The real catalog is unchanged.

The text rule's purpose is that book prose can't sit untagged in an entry. Three rounds have tightened it from "a length limit" to "listed keys, a length, one line, no sentence". Further rounds on this one rule are not planned: the content repositories are the owner's own, and every change to them is reviewed there.

## Amendment A code review, round 1 (REVISE, 12 findings)
## Findings, ordered by severity

1. **Write token can leak into logs — [tools/content-pr.mjs:48](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:48), [60](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:60), [77](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:77).** A failed `git push` makes Node include its arguments, including the base64 encoded authorization header, in the error message printed to the Actions log. **Fix:** Pass Git authentication through child-process environment configuration and redact errors before logging.

2. **A failed guard fetch can overwrite a person’s branch — [tools/content-pr.mjs:50](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:50).** A transient fetch or authentication error is treated exactly like an absent `content-sync` branch; a later successful `--force` push can replace human commits without checking them. **Fix:** Distinguish “branch absent” from every other fetch error and abort on the latter.

3. **The guard has a race — [tools/content-pr.mjs:50](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:50), [60](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:60).** Someone can push to `content-sync` after the guard fetch and before the unconditional force push; that commit is lost. Workflow concurrency does not serialize a person’s push. **Fix:** Push with `--force-with-lease` against the exact fetched branch head.

4. **The trailer does not establish who made a commit — [tools/content-pr.mjs:37](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:37).** A person’s commit containing `Content-Sync: bot` passes `onlyOurs` and is then overwritten. **Fix:** Guard against a recorded bot-produced commit SHA, and reject branch commits that cannot be authenticated as that run’s output.

5. **The write token is scoped to the whole job — [.github/workflows/content-sync.yml:17](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/.github/workflows/content-sync.yml:17).** Amendment A says only publish receives it, but earlier actions run in a job with write permissions; [GitHub documents](https://docs.github.com/en/actions/concepts/security/github_token) that actions can access `github.token` even when it is not explicitly passed. **Fix:** Put sync and checks in a read-only job, then give a separate publish job write permissions.

6. **The replacement is not atomic — [tools/sync-content.mjs:76](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/sync-content.mjs:76).** If the process stops or the second rename fails after `content/` becomes `content.old`, there is no `content/`; this contradicts A2’s “never half a copy.” **Fix:** Use an atomic directory exchange or an atomic pointer to a complete version, with recovery for interrupted replacement.

7. **Changes at the root of `content/` evade both checks — [tools/content.mjs:101](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content.mjs:101), [tools/verify-content.mjs:46](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/verify-content.mjs:46).** Add `content/extra.json` or an unpinned directory: the build and provenance check inspect only pinned subdirectories, so CI passes despite A3’s “no unlisted file”; Docker also sends it in the build context. **Fix:** Enumerate the `content/` root and require exactly the pinned directory names.

8. **CI does not run on every push — [.github/workflows/ci.yml:4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/.github/workflows/ci.yml:4).** A push changing `content/` on a branch without a PR receives no catalog build or provenance check, contrary to A5. **Fix:** Remove the `main` restriction from the `push` trigger.

9. **A failed second sync leaves a prior PR showing stale success — [tools/content-pr.mjs:44](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:44).** If an open sync PR has a successful status and the next daily sync fails during fetch, publish exits without updating that PR or its status; only the workflow run shows failure. **Fix:** On sync failure, mark the existing branch head failed and update the open PR’s check summary without changing its branch.

10. **A repair with unchanged pins is discarded — [tools/content-pr.mjs:47](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:47).** If a committed content file and its record drift from the pinned upstream commit, sync restores them, but `report.changes` is empty and publish opens no repair PR. **Fix:** Publish whenever the staged `content/` or pins differ from `main`, even when no release moved.

11. **The atomicity test fails before replacement begins — [test/content.test.mjs:58](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/content.test.mjs:58).** Its moved-tag case is rejected during the initial pin loop, so it cannot detect the missing-`content/` failure between the two renames. **Fix:** Inject a failure at the replacement boundary and assert that a complete old or new copy remains available.

12. **The PR body omits unchanged books — [tools/content-pr.mjs:24](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:24).** When one book updates, the body lists only that book, while A6 calls for each book’s old and new version. **Fix:** Generate rows from every pin, using the change record only to supply prior values.

I ran the permitted content test. Three tests passed; six could not run because this read-only environment rejects temporary-directory creation (`EPERM`). That result does not validate the failing paths above.

VERDICT: REVISE

### Claude's response
All 12 fixed.
- #1 git authenticates through the environment (GIT_CONFIG_*), never an argument; every printed error is redacted.
- #2 the branch is looked up with `ls-remote`: "absent" and "failed" are different; a failure stops the run.
- #3 the push is leased against the head that was checked (`--force-with-lease`).
- #4 the guard no longer trusts a trailer: the head must carry the commit status that only this workflow's token writes (creator github-actions[bot]) and be the one commit beyond main.
- #5 two jobs: `sync` (read-only token) and `publish` (write), with the copy handed over as an artifact.
- #6 #11 `recoverContent` restores content.old after a stop between the two renames; a test injects the stop.
- #7 content/ must hold exactly the pinned directories (build and provenance).
- #8 CI runs on every branch. #9 a failed sync marks the open pull request failed and comments. #10 a drifted content/ with unchanged pins opens a repair pull request. #12 the body lists every book.
- Also found while fixing: the artifact must include hidden files (.gitkeep in the content), or the pull request would delete them.

## Amendment A code review, round 2 — fix-only (REVISE, 2 findings)
- [tools/sync-content.mjs:88](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/sync-content.mjs:88) — **Round-1 finding 6 remains.** If the process stops between the two renames, `content/` is absent until another sync runs; a build in that interval fails. The new test explicitly accepts that state. **Fix:** Make the complete copy available through an atomic exchange or version pointer.

- [tools/content-pr.mjs:26](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:26) — **Round-1 finding 12 remains.** When one book moves, every unchanged book’s “Now” cell says `unchanged` instead of giving its new version, so the PR does not list each book’s old and new version. **Fix:** Render the current tag and commit in every “Now” cell.

VERDICT: REVISE

### Claude's response
- #12: accepted — every row shows the old and the new version.
- #6: **rejected, with the reason.** The copy that matters is the committed one in Git: a sync that stops between its two renames on a working tree leaves `content.old/` complete, the build names the situation, and the next sync (or `git checkout content`) restores it. The daily sync runs on a throw-away runner. Node has no atomic directory exchange, and a version pointer (a symlink) would undo the no-symlink rule the build relies on. A gap of "no copy until the next sync" on one working tree, after a crash, is accepted.
