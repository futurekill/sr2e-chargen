# Code review log: M5l, implant weapons

## Round 1 — Codex (gpt-6-sol, high)
1. **Imported Foundry pairs can lose their link.** [fromFoundryActor](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/foundry.mjs:101) preserves flags but never creates `pairedItem`. A character assembled in Foundry has only the catalog’s `pairedWeapon` and `pairedWare` flags, so its weapon can be sold separately; I also reproduced its attack appearing while the implant is an uninstalled spare. The import test covers only an app export that already has `pairedItem`. **Fix:** link uniquely matching pairs during import and refuse ambiguous matches.

2. **Selling an implant can leave a linked weapon behind.** [sellItem](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:566) takes only the first weapon whose `pairedItem` names the implant. The importer accepts two such weapons; I reproduced a sale that removed one and left the other orphaned. **Fix:** enforce exactly one linked weapon before a paired sale, and validate that invariant on import.

3. **Catalog loading does not enforce pair integrity.** [loadCatalog](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/catalog.mjs:32) accepts a checksum-valid catalog with missing or wrong `pairedWeaponId` fields; [pairedEntry](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:753) then treats a missing field as an unpaired implant. The builder also omits the plan’s reciprocal `pairedWareId`. A pre-change catalog from the same pins can therefore silently restore the original missing-weapon behavior. **Fix:** emit both IDs and validate every reciprocal pair when loading the catalog.

The five new focused tests pass; none exercises these cases. No files were modified.

VERDICT: REVISE
### Response
- #1: fromFoundryActor links a pair assembled in Foundry (the compendium's pairedWare/pairedWeapon flags), in item order.
- #2: the import refuses a link to a non-cyberware item and two weapons on one implant, so a sale always finds the one weapon.
- #3: the catalog carries pairedWareId too; loadCatalog refuses a catalog whose pairing is missing or not reciprocal (a real test on a copy of the built catalog).

## Round 2 — Codex (gpt-6-sol, medium, fix-only)
**Finding:** [fromFoundryActor](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/foundry.mjs:108) still accepts an ambiguous Foundry-assembled pair. With one implant and two unlinked weapons carrying the matching `pairedWare` flag, it links the first weapon and silently leaves the second sellable on its own. Round 1 called for refusing ambiguous matches; the added test covers only a duplicate that already has `pairedItem`. Reject the ambiguous import and test that case.

VERDICT: REVISE
### Response
- The ambiguous case (two unlinked weapons for one implant) is refused: 'remove the extra weapon in Foundry'.

## Round 3 — Codex (gpt-6-sol, medium, fix-only)
VERDICT: APPROVED