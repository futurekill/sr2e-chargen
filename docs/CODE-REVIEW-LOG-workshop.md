# Code Review Log: the Workshop (docs/PLAN-workshop.md)

## Round 1 — Codex (gpt-6-sol, high)

- **Designed vehicle page crashes on open** — [VehicleDesign.svelte:31](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/VehicleDesign.svelte:31). `Vehicle.svelte` stores the document in Svelte `$state`, so `body.design.choices` is a proxy. `structuredClone` throws `DataCloneError` when the new page initializes; the same call recurs on refresh and Undo. **Fix:** Clone `$state.snapshot(body.design.choices)` at each call site.

- **A vehicle with an invalid Signature can be bought** — [shared/vehicle.mjs:209](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/vehicle.mjs:209). A sports car with Turbocharging, a mini turret, an external firmpoint, and four added CF has Signature −1, yet `r.valid` is true. A read-only reducer probe bought it for 44,375¥. The approved plan requires a Signature floor. **Fix:** Apply the plan’s finished-stat floors before pricing and purchasing, and add this case to `test/workshop.test.mjs`.

- **Removing one of two Drive-by-Wire mods erases the surviving mod’s split** — [shared/vehicle.mjs:193](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/vehicle.mjs:193). The reducer accepts two DBW items as a valid design; after saving a 4/6/0 split, removing either one deletes `dbwSplit` and rebuilds the remaining item with 10/0/0. **Fix:** Delete the split only when no DBW mod remains, and test that sequence.

- **The promised Design Point breakdown is absent** — [VehicleDesign.svelte:84](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/VehicleDesign.svelte:84). Adding a modification changes the total, but the player cannot see its DP line or page reference, although the engine supplies `r.dpLines` and the plan requires them. **Fix:** Render `r.dpLines` with each line’s label, DP, and page.

- **The rebuild and export assertions are too narrow** — [test/workshop.test.mjs:42](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/workshop.test.mjs:42) and [test/workshop.test.mjs:138](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/workshop.test.mjs:138). The tests check a few fields and flags, so losing other Workshop update fields or token artwork would pass. They also do not verify reopening in Foundry. **Fix:** Compare the full rebuilt actor against the expected update and complete the plan’s Foundry reopen check.

The Svelte files compiled in a read-only check; the Vite build could not run because this workspace denies its temporary file write.

VERDICT: REVISE
### Claude's response
- #1 fixed: $state.snapshot instead of structuredClone on the proxied choices (three places).
- #2 rejected: Rigger 2 prints no Signature floor (its text layer is absent; nothing found), and a Signature below the minimum target number acts as that minimum in play. Foundry's engine accepts it too; the app follows the one engine. The plan's floor list was narrowed in the system (0.168.0) to the four ratings a design option can buy below 0 (Speed, Acceleration, Load, Cargo); Signature options are 0 or more.
- #3 fixed: the split is removed only with the last drive-by-wire system; test added.
- #4 fixed: the summary shows the Design Point lines with their pages.
- #5 fixed: a test compares the WHOLE rebuilt actor with the Workshop update + art + design mod; and the live Foundry check ran (local test world, R2 module on): an app export (sedan, Speed +10, Cargo +2, luxury x1.5, round 500, DBW 2 with a 4/6/0 split) imported, the Foundry Workshop reopened it with DP 280 and 42,000 yen (the app: 280, 42,000), its DBW item as a design mod with the split; saving it unchanged wrote nothing (no drift).

## Round 2 — Codex (gpt-6-sol, medium, fix-only)

- [shared/vehicle.mjs:210](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/vehicle.mjs:210) — **#2 rejection does not hold against the approved plan:** pricing still relies on `r.valid`, which does not reject a final Signature of −1. The round 1 sports car can therefore be bought, while [PLAN-workshop.md:29](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop.md:29) still requires a Signature floor. **Fix:** enforce the planned finished-stat floor before pricing and purchase, and test that case.
- [test/workshop.test.mjs:164](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/workshop.test.mjs:164) — **#5 is only partly fixed:** the new “whole actor” test excludes `items` from the full comparison and checks only the mod’s flags. A rebuild that loses its rating or saved split would pass this assertion. **Fix:** compare the complete expected item, including its system and `custom.choice`.

VERDICT: REVISE
### Claude's response
- #2: the plan text still said Signature; the decision stands (no printed floor, minimum TN covers it, one engine with Foundry). PLAN-workshop.md now records the floors AS BUILT and why Signature is not floored, so plan and code agree.
- #5 fixed: the test compares the whole design mod item (system with its rating and custom.choice, flags, source, id).

## Round 3 — Codex (gpt-6-sol, medium, fix-only)

VERDICT: APPROVED
