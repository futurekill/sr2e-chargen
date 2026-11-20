# Code review log: M5k, bioware with its own rules

## Round 1 — Codex (gpt-6-sol, high)
- **Printable Body Cost is wrong with cyberlimbs.** [server/sheet/model.mjs:101](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:101) still uses `effectiveBodyCost` directly. Muscle Augmentation beside full cyberlimbs therefore shows its undiscounted cost even though the sheet’s Body Index includes the discount. **Fix:** render each row with `bodyCostOf(i, items)`.

- **The Markdown sheet omits the new dice lines.** [server/sheet/model.mjs:76](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:76) adds Task Pool and active skill dice only to `stats`; [server/sheet/markdown.mjs:26](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/markdown.mjs:26) renders `pools` and never renders `stats`. **Fix:** include both lines in the Markdown model or render `stats` there.

- **The in-play Injury line ignores newly offered bioware.** [client/src/pages/Character.svelte:464](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:464) uses raw `totalWoundPenalty`, so an installed Damage Compensator still displays penalties that Foundry suppresses; an active Pain Editor has the same problem for Stun. **Fix:** calculate the line with Foundry’s compensated wound penalty rules using working installed bioware.

The 11 targeted tests pass, but they do not exercise these sheet and in-play consumers.

VERDICT: REVISE
### Response
- #1: the sheet's bioware rows use bodyCostOf (the muscle discount, then culturing).
- #2: the sheet model's pools (the Markdown's table) carry the Rigger 2 Task Pool and the active skill dice.
- #3: the in-play Injury line uses derive's injuryPenalty: Foundry's compensatedWoundPenalty with a working Damage Compensator and an active Pain Editor.

## Round 2 — Codex (gpt-6-sol, medium, fix-only)
The three fixes are correct: bioware sheet rows use `bodyCostOf`, the Markdown model carries Task Pool and active skill dice, and the in-play Injury line uses the compensated penalty for working bioware. All six targeted tests pass.

VERDICT: APPROVED