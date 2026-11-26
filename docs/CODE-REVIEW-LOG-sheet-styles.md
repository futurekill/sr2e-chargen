# Code review log: more sheet styles (docs/PLAN-sheet-styles.md)
_2026-11-26. Codex gpt-6-sol: r1 high, r2 medium (fix-only)._

## Round 1 — Codex
The 212 sheet tests pass, but I found these issues against the approved plan:

- [render.mjs:156](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:156): Dossier draws rules at `ry - 1` and `ry + 1.5`, but records one shape ending at `ry + 0.25`. Text touching the lower rule would pass the intersection check. **Fix:** record each stroked line as its own 0.5 pt rule shape.
- [render.mjs:199](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:199): Table row separators are drawn without rule shapes, despite the plan requiring every rule to be recorded. A separator touching text is invisible to the rule test. **Fix:** record each row separator when it is stroked.
- [shared/sheet-styles.mjs:6](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/sheet-styles.mjs:6): The planned `ink` field is absent; querying it for `fohawk-ink` returns `undefined`, and [render.mjs:64](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:64) still identifies ink saving by key. **Fix:** add `ink` metadata and derive `inkSaver` from `look.ink`.
- [sheet.test.mjs:244](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/sheet.test.mjs:244): The new fitting-card matrix uses `ids = []`. Dropping a selected Firearms row from a fitting Printout card would pass its PDF text comparison. **Fix:** use selected card IDs and assert their text appears.
- [sheet.test.mjs:227](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/sheet.test.mjs:227): The motif test accepts one Printout fill anywhere and never checks a card. Shading only one row on the sheet and none on cards would pass. **Fix:** assert alternating fill positions on a three-row table in both outputs.
- [sheet.test.mjs:260](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/sheet.test.mjs:260): The “no hard-coded style list” regex accepts the former `["fohawk", "fohawk-ink", "classic"]` list. **Fix:** assert that each consumer derives its choices from the shared export; add the planned route checks for both new styles and an unknown style.

I found no remaining layout-name branch, mixed-face measurement, font-cache key collision, route/default mismatch, or client select wiring error in the current code.

VERDICT: REVISE

### Claude's response
All six fixed: Dossier's two lines recorded as two rules; row separators recorded as rules; `ink` flag in the shared
list (inkSaver = look.ink); the card matrix uses the selected rows and checks their text; the motif test covers sheet
and card and alternation; the list test checks each consumer imports the shared list, plus route tests for both new
styles and an unknown one.

## Round 2 — Codex
VERDICT: APPROVED
