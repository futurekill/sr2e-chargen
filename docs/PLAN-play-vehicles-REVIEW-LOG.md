# Plan Review Log: buying and selling vehicles in play
Started 2026-11-26. MAX_ROUNDS=5. Codex gpt-6-sol.

## Round 1 — Codex

The plan needs revision on these paths:

1. **Fence sales use the wrong basis.** [R6](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/RULINGS.md:13) pays a percentage of *list value*; the plan applies it to `paid`, so a negotiated purchase changes the fence payout. `saleQuoteOf` also derives value from an item’s `system.cost`, which omits a garage vehicle’s weapons and cargo. **Fix:** store the frozen whole list value at purchase and apply the allowed fence percentage to that value; use `paid` only for refunds.

2. **“Its own undo” overpromises.** [undoable](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:501) permits only the latest original ledger entry. Buy undo refunds money after checking the object is unchanged; it does not require the purchase money to “still be there.” Sell undo requires enough nuyen and must restore the snapshot. **Fix:** specify latest-entry-only undo and implement both vehicle kinds in `playOp`’s dispatch and inverse checks, including the book checks needed to restore a sold vehicle.

3. **Garage purchases will be refused by the current server path.** [applyOps](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:210) fetches garage documents only for `buyGarageVehicle` and `attachVehicle`, and reads the sale mode only for `sellItem`. **Fix:** include garage `buyVehicle` operations in the transaction’s garage lookup and `sellVehicle` in its sale-mode read.

4. **Duplicate and link checks must cover both stores.** The existing [creation purchase check](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:377), [linkedVehicles](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:144), and [usersOfVehicle](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:292) inspect `creation.vehicles` only. A play purchase would otherwise leave a duplicate link and incomplete “used by” result. **Fix:** use one combined lookup for active garage purchases in both stores, and define whether a sold play vehicle may be bought again.

5. **Snapshot and refusal rules need to be explicit.** [garageOf](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:132) returns only live, unarchived documents; [buyGarageVehicle](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:366) separately rejects an unfinished design, a restricted base vehicle, and missing books. Later edits or archival must not alter a completed purchase or block its sale undo. **Fix:** reuse all purchase refusals, freeze source, revision, whole list value, and books in the transaction, and restore from the ledger snapshot without querying the garage.

6. **The catalog picker will be empty.** [offeredBy](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/catalog.mjs:108) excludes every vehicle from `offerable=play`. **Fix:** enable priced core vehicles there and update the play search to request them.

7. **Export needs collision handling.** The [route](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:188) accepts only `v…` keys and names downloads solely from the vehicle name; two purchases with the same name produce the same filename. **Fix:** resolve `v…` and `w…` keys from their respective stores and include the purchase key in the download filename.

8. **The new rule is not yet wired into this app.** [shared/rules.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/rules.mjs:8) imports the pinned copy under `content/`, while the plan changes the sibling system checkout; R21 is cited in the plan but absent from [RULINGS.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/RULINGS.md). **Fix:** add the ruling, sync and pin the system release, export the helpers through `shared/rules.mjs`, and test the app against that pinned copy.

The proof list should also cover the cross-store duplicate, sale after garage revision or archive, mode or quote changing before submission, list-value fence payout, and two same-name exports.

VERDICT: REVISE
### Claude's response
Accepted all eight: fence on the frozen whole list value, refund on paid; latest-only undo with explicit inverse checks (sale undo restores from the snapshot without the garage); applyOps reads garage ids for buyVehicle and the sale mode for sellVehicle; one combined garagePurchases(b) for duplicates, links and usedBy (a sold play copy may be bought again); every existing refusal reused and source/revision/listValue/books frozen; offerable=play offers priced core vehicles; the route takes v/w keys and names files with the key; R21 added, the system helpers pinned and re-exported.

## Round 2 — Codex

The revised plan addresses all eight round 1 findings. Three implementation gaps remain:

1. **The buy request schema needs an exactly-one-ID rule.** The route builds required fields from `OPS`, so declaring both `catalogId` and `garageId` would require both unless `OPTIONAL` is updated; a reducer check alone cannot accept a valid one-ID request. **Fix:** make both fields optional in the route schema, then require exactly one in the reducer. [Route schema](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:63), [plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-play-vehicles.md:33).

2. **The garage Buy UI has no usable purchase preview path.** The character page’s garage list contains metadata only, and its optimistic `change()` call supplies no garage lookup; a garage `buyVehicle` would be refused locally before reaching the server. **Fix:** fetch the garage document and design tables to show its whole-price street quote, then submit that purchase through the server-first `send()` path. [Character page](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:95), [change()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:219), [plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-play-vehicles.md:64).

3. **The proposed export filename can still collide across characters.** Purchase keys are local to each character: two characters can each have a same-name `w00001` vehicle. **Fix:** include the character document ID as well as the vehicle key in the filename. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-play-vehicles.md:55).

VERDICT: REVISE
### Claude's response
Accepted all three: both ids OPTIONAL in the route, exactly one in the reducer; the garage quote fetched from the document (+ tables) and the purchase sent server-first; the file name has the character id and the key. Also: availability dropped from step 0 (unused; R7).

## Round 3 — Codex (delta)

All three round-2 points are addressed in the plan: the route schema permits either ID while the reducer requires exactly one; the garage preview fetches the vehicle document and design tables and submits through `send()`; and export filenames include both the character ID and vehicle key. I found no new problem introduced by those changes.

VERDICT: APPROVED
Converged: APPROVED in 3 rounds.
