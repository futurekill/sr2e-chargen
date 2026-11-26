# Plan review log: the Garage
Started 2026-11-26. Codex gpt-6-sol high, read-only; a fresh session each round.

## Round 1 — Codex
**Verdict: the plan needs revision.** The main breaks are in receipt ownership and cross-document export.

- **Receipt loss:** `rebuildItems` replaces `system.chargen.vehicles` from `vehicleBase` and `creation.vehicles`, so a garage purchase can disappear on the next creation operation. **Fix:** Store garage purchases in a keyed character record and rebuild all receipts from both purchase paths. [creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:847)
- **Wrong refund or double charge:** Receipts contain only `{name, source, cost}`; two identical vehicles cannot be distinguished, and attaching an already purchased catalog vehicle can charge it again. **Fix:** Give each garage purchase a stable purchase ID, reject a second purchase of the same link, and remove only that ID’s receipt on undo. [PLAN-garage.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-garage.md:34)
- **Budget mismatch:** The plan charges mounted weapons and cargo gear through a vehicle receipt, while S9 defines receipts as vehicle list price only; character-owned copies of that gear would also be charged by `chargenBudget`. **Fix:** Define one owner and one charge path for each item, and test the resulting receipt total against `chargenBudget`. [PLAN-S9-vehicles.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-S9-vehicles.md:57)
- **Reference authorization:** The proposed transaction check says “same owner” but does not specify live, unarchived status or a check when restoring a character revision; a restore can recreate a link after its target was deleted. **Fix:** Resolve references through `ownedDocument` in the write transaction, define archived and deleted behavior, and recheck links on revision restore. [library.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:213)
- **Race on purchase:** Checking a vehicle and writing the character in one transaction does not by itself stop a concurrent vehicle delete or archive between those steps. **Fix:** Lock or conditionally verify the target’s live state in the same transaction, with a consistent lock order. [PLAN-garage.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-garage.md:35)
- **Idempotency scope:** An idempotency key protects one request, but two different keys can buy the same garage vehicle twice; a batched operation can also attach and buy it twice. **Fix:** Enforce a unique garage link and purchase invariant in the reducer across the whole operation batch. [library.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:44)
- **Export shape:** The current character endpoint returns one Foundry actor JSON; it cannot carry separate vehicle actors or turn app document IDs into Foundry `linkedVehicles` UUIDs. **Fix:** Specify a bundle/import mapping or separate vehicle downloads with an explicit link step. [documents.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:159)
- **Embedded item IDs:** Mounting two copies of one catalog weapon or gear item would copy the same `_id` into one vehicle actor. **Fix:** Allocate a unique 16-character Foundry item ID per mounted or stored instance and preserve it across exports. [foundry.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/foundry.mjs:45)
- **Lost edits on export:** `vehicleToFoundry(source)` exports the catalog name and notes unless the new document’s edits are applied to the actor source. **Fix:** Build the export from the vehicle document’s current name, notes, mounts, and gear, then verify the actor JSON. [PLAN-garage.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-garage.md:43)
- **Mount eligibility:** `weaponType: "heavy"` includes missiles, rockets, and an under-barrel launcher, which are not interchangeable mounted guns; the named autocannon and water cannon are not present in the checked catalog. **Fix:** Use an explicit, tested catalog eligibility table for hardpoints and firmpoints instead of `weaponType` alone. [PLAN-garage.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-garage.md:26)
- **Unbounded collections:** “Same quotas” limits stored bytes, but the plan sets no garage gear or character-link count; existing `addVehicle` has a 20-vehicle cap, and sheets and exports must enumerate links. **Fix:** Set explicit per-vehicle item and per-character link caps, with request-size and sheet-fit cases. [creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:114)
- **Versioning:** Adding `garage` changes character document meaning while the current character schema remains version 1; older readers may silently ignore links and export an incomplete character. **Fix:** Bump the character schema version and define migration and newer-version read behavior. [PLAN-garage.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-garage.md:12)
- **Simpler path:** The new keyed `mounts` and `gear` maps duplicate data that Foundry already represents as vehicle embedded items. **Fix:** Keep one vehicle actor source as the document authority and apply validated mount and cargo operations directly to its `items` array. [PLAN.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN.md:184)

VERDICT: REVISE

### Claude's response
Accepted 12 of 13 (Approach rewritten): a garage purchase is a keyed snapshot in `creation.vehicles` with its frozen
price, rebuilt with the catalog ones (#1, #2, #6); one owner per item and the price rule in RULINGS (#3); links are
soft and resolved through `ownedDocument` on every read, so archive/delete/restore can't leak or break (#4, #5);
the document's own Foundry export built from the document, no invented linkedVehicles (#7, #9); per-item ids (#8);
explicit eligibility tables (#10); caps (#11); the vehicle actor source as the one authority (#13).
Rejected #12 (schema bump): `links` is optional and read as empty; server and client ship together.

## Round 2 — Codex
Round 1’s findings are addressed in the revised design, except the schema bump, which the plan explicitly rejects. I found these new gaps:

- [Price](</Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-garage.md:32>): `addGear` accepts a quantity, but `vehiclePrice` says only “gear at list price,” allowing a multi-unit purchase to be charged once. **Fix:** Multiply each gear item’s list price by its validated quantity.
- [Sheet limit](</Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-garage.md:49>): A character can have 20 purchases and 20 links, while the fit test covers only 20 vehicles. **Fix:** Test the maximum combined display count and deduplicate links to purchased garage vehicles.
- [In-play purchase](</Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-garage.md:89>): The plan calls for a ledger purchase, but its only garage purchase op is creation-only and the current play purchase path excludes vehicles. **Fix:** Define an in-play garage purchase op with its debit and undo behavior.
- [Export notes](</Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-garage.md:54>): The plan appends notes to a description, but pinned vehicle actors store text in `system.notes`. **Fix:** Append document notes to `actor.system.notes` in `vehicleActor`.

VERDICT: REVISE

### Claude's response
All four accepted: gear price × quantity; the fit test covers 20 purchases + 20 links and a bought-and-linked vehicle
shows once; in-play purchase moved out of scope (its own plan); notes go to `system.notes`.

## Round 3 — Codex
The four round 2 fixes confirmed; no new problem.

VERDICT: APPROVED
