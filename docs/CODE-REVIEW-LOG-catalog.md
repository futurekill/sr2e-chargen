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
