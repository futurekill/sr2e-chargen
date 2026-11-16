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
