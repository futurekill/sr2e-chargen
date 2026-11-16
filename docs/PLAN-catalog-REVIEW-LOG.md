# Plan Review Log: milestone 1 — the catalog
Started 2026-11-16. Codex gpt-6-sol, high effort, a fresh session per round.

## Round 1 — Codex (REVISE, 11 findings)
1. **The image can ship without the catalog.** [The plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:55) defers CI content access and accepts an empty image, contrary to the fully formed image requirement. The current [Dockerfile](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docker/Dockerfile:8) cannot see sibling repositories, and [.dockerignore](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/.dockerignore:2) excludes a locally built `dist/catalog`. **Fix:** Build the pinned catalog during the image build and fail if it is absent.

2. **Tags alone are mutable pins.** [The pin design](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:20) records the resolved commit only *after* building, so a moved tag can silently change content without a commit to this repo. `builtAt` also makes otherwise identical output differ. **Fix:** Pin and verify commit hashes; make the build timestamp reproducible or keep it outside the catalog artifact.

3. **The archive selection can depend on the working tree.** A shell-expanded `packs-src/**` in [the proposed `git archive` command](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:22) selects paths from the checkout before Git reads the tag. **Fix:** Invoke Git without a shell, with literal `packs-src` and manifest path arguments.

4. **Tar extraction needs a containment rule.** The plan extracts tagged content into a temporary directory but does not reject archive symlinks or define cleanup and pipeline failure handling; a future symlinked pack file could make the builder read outside the extracted tree. **Fix:** Accept only regular files under the expected paths, check both process exit codes, and remove a securely created temp directory in `finally`.

5. **The U12 check is bypassed by real data.** [Rigger 2’s Ares Citymaster](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-rigger-2/packs-src/r2-vehicles/ares_citymaster_7136e6bcec17e64c.json) has book-derived `system.otherFeatures` prose under 200 characters; many vehicles do. [The plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:34) leaves it untagged, so a later reduced-content filter cannot remove it. **Fix:** Classify and source-tag text by field and recursively reject unclassified prose regardless of length.

6. **Package and cited book are different dimensions.** Core items cite Companion, Fields of Fire, SSC, and Shadowtech; Cyberpirates items cite Rigger 2 and SSC. A single ambiguous `book` field in [the entry shape](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:28) will misfilter some entries or misstate their source. **Fix:** Store `packageId` and `citation.book` separately, and define which one book toggles filter.

7. **Archetypes and embedded items do not have the promised citations.** All seven runner actors lack `system.citation`; 51 of their 96 embedded items also lack it, and none of those embedded items has a source UUID. [“Shaped the same way”](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:37) cannot supply a valid citation or compendium UUID for them. **Fix:** Define an explicit embedded-item provenance and citation fallback, and validate archetype badges separately.

8. **Folder paths cannot categorize most module entries.** Only the core system has folder documents; the other included repositories have none. [The proposed `category` derivation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:33) therefore yields empty categories for most results and weakens category search. **Fix:** Fall back to manifest pack labels and applicable `system.category` values.

9. **The shared book table is missing from the archive inputs.** The build needs abbreviations and titles from the system’s `module/rules/books.mjs`, but [the archive step](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:22) includes only packs and manifests. Reading the checkout’s table would mix versions. **Fix:** Archive the book table from the pinned system commit, or generate equivalent metadata from that same commit.

10. **Rich text rendering has no stated safety rule.** Compendium notes and biographies contain HTML, and [the client plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:52) calls for displaying them without specifying the required sanitization. **Fix:** Escape them as text or apply the server-side allow-list sanitizer required by `docs/PLAN.md` before HTML rendering.

11. **The inventory baseline is wrong.** [“System and 13 sourcebook modules” with 546 actors after excluding adventures](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:10) does not match the repositories: there are 12 sourcebook modules, and 488 actors after excluding adventures and Pink Fohawk. Paranormal Animals contributes no entries under the proposed selection rule. **Fix:** Correct the inventory and make the pin list match the modules that contribute catalog entries.

VERDICT: REVISE

### Claude's response (draft 2)
All 11 accepted: the image build fails without a checked catalog (CI has an explicit override); commits are the pins and the output has no timestamp; Git is run without a shell and the content is read from Git objects (nothing extracted); text is classified by field and unclassified prose fails the build; package and book are separate, toggles filter on the book; archetypes and embedded items may lack a citation and a uuid; category falls back to the pack label; the book table comes from the pinned commit; text is stored and rendered as plain text; the inventory is corrected.

## Round 2 — Codex (REVISE, 5 findings)
1. **The image can still ship empty or stale.** Draft 2 copies a host-built catalog and allows CI and the production server to bypass the missing-catalog check. The Docker build also has no stated check that the copied catalog’s pins match the current `content-pins.json`. That leaves the fully formed image requirement unenforced. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:74). **Fix:** Make release builds verify the artifact against the current pins and reject empty catalogs; keep any empty fixture confined to tests.

2. **The U12 check still permits short book text.** The four-word rule would accept strings such as Rigger Black Book’s `system.seating: "Twin bucket seats"` unless the unfinished `TEXT_FIELDS` list happens to include that path. It cannot establish the plan’s claim that all book prose can be removed. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:47). **Fix:** Audit every retained string path and require an explicit text or structured-data classification, regardless of word count.

3. **Folder JSON can pass the stated item selection.** Core pack folders are JSON records with `type: "Item"` and `_key: "!folders!…"`. “Items of every type” would admit 60 folder records, which then lack item citations, despite the stated folder exclusion. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:35), [example folder](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/packs-src/contacts/_folder_contact_0c495a9fa7ca2224.json). **Fix:** Select document records by their `_key` kind before applying item and actor type rules.

4. **The catalog drops rule inputs milestone 2 will need.** Keeping only `flags.sr2e.rule` removes data such as `pairedWeapon` and `vehicleId`; dropping `_stats` while leaving the compendium UUID only at the catalog wrapper also breaks pure rules that look for `_stats.compendiumSource`. The core Cyberarm has no rule flag and relies on source-UUID classification. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:54), [Cyberarm](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/packs-src/cyberware/Cyberarm_Full_896ab7272e2fd9b0.json), [resolver](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/limb-rules.mjs:48). **Fix:** Audit and retain rule-relevant flags, and specify the adapter that presents catalog provenance in the source shape those rules read.

5. **The no-book contacts are misclassified.** Eleven contacts have `citation.book: "none"`, not merely a missing page. Draft 2 assigns that value to `book`, but `BOOKS` has no `none` entry, so ordinary book toggles cannot account for those contacts. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:40), [example contact](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/packs-src/contacts/Arms_Dealer_af696156c9fc603c.json), [book table](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/books.mjs:25). **Fix:** Define a separate no-source-book case and its filtering behavior without attributing those contacts to a printed book.

VERDICT: REVISE

### Claude's response (draft 3)
All 5 accepted: the image build checks the catalog against the current pins and only a labelled test image may be empty; every string PATH is classified in an audited list (length no longer matters); records are selected by their `_key` kind; all of `flags.sr2e` and `_stats.compendiumSource` stay for the rules; a "none" citation means no book and no badge, listed with its package.

## Round 3 — Codex, delta (REVISE, 3 findings)
1. [The new provenance rule](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:59) sets embedded entries’ `uuid` to null, then specifies `_stats.compendiumSource` from that UUID. All 270 embedded Rigger 2 vehicle items already have a source UUID; replacing it would lose provenance. **Fix:** Preserve an embedded item’s existing `_stats.compendiumSource`; synthesize it from `uuid` only for top-level entries.

2. [The no-source fallback](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:41) conflicts with the stated filter on `book`: these entries have `book: null`, so a filtered request would omit them despite the promised package-book listing. **Fix:** Define a separate filter book derived from the package and use it for no-source entries while keeping their citation book null.

3. [The CI smoke image](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-catalog.md:82) is specified to have no catalog, while the production server must refuse to start without one; the smoke test therefore cannot start that image as described. **Fix:** Give the smoke image an explicit fixture catalog, or specify a test-only startup path for the catalog-free image.

VERDICT: REVISE

### Claude's response (draft 4)
All 3 accepted: an embedded item keeps its own source uuid; a `listBook` drives the toggles and the filter; the test image carries the fixture catalog. Findings went 11 → 5 → 3; the build starts from draft 4 and the Codex CODE review covers the rest.
