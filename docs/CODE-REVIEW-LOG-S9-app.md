# Code review log: vehicles at creation, app side (S9)
Codex gpt-6-sol, read-only. Local branch chargen/on-0.161.

## Round 1 — Codex (high)
1. **Existing receipts are lost** — `shared/creation.mjs:394`. A Foundry-made character with a 5,000¥ vehicle receipt buys a Dodge Scoot in the app; `rebuildItems` replaces the entire receipt array, so `chargenBudget` counts only the Scoot. Removing the Scoot then clears the array. **Fix:** Preserve receipts the app did not create and replace only receipts tied to `creation.vehicles`.

2. **A vehicle source can be assigned to the wrong catalog ID** — `server/catalog.mjs:53`. Put vehicle B’s source under vehicle A’s ID and generate a matching `vehiclesSha256`; loading succeeds because both have type `vehicle`. Selecting A then stores and charges for B. **Fix:** Verify each source’s `_id` and catalog metadata against the entry at that ID.

3. **Removing the vehicle checksum silently disables purchases** — `server/catalog.mjs:47`. If `vehicles.json` remains but `vehiclesSha256` is removed from the manifest, `loadCatalog` accepts the catalog and exposes no vehicle sources. **Fix:** Reject a present `vehicles.json` without its checksum; retain legacy support only when both are absent.

VERDICT: REVISE
### Response
All three fixed with tests: creation.vehicleBase keeps a Foundry-made character's own receipts; each vehicles.json source must be its entry's (type, _id, name); vehicles.json without its checksum is refused.

## Round 2 — Codex (medium, fix-only)
- [shared/creation.mjs:251](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:251): A character saved under HEAD~1 can already have `creation.vehicles` and a Foundry-made receipt, but no `vehicleBase`. The next rebuild at line 394 drops that receipt. **Fix:** Backfill or reconcile foreign receipts when `vehicleBase` is absent, including for existing vehicle records.
- [server/catalog.mjs:56](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/catalog.mjs:56): Put vehicle B’s source under vehicle A’s key, change only its `_id` and `name` to A’s, and update the manifest checksum. It loads with B’s system data and price. **Fix:** Validate the source’s substantive fields against A’s catalog entry before accepting it.

The missing-checksum fix rejects a present `vehicles.json` as intended. The vehicle test’s file-writing case could not run in this read-only sandbox (`EPERM`).

VERDICT: REVISE
### Response
#1 declined: HEAD~1 was never pushed or released; no character exists in that state outside the local dev database. #2: the catalog is trusted build output (checksums detect corruption, not a malicious builder, who could change catalog.json too); the source's price is now also compared with the entry's, so a swapped source can't charge another price. Stopped here.
