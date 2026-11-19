# Plan review log: M4b (nuyen after creation)
Codex gpt-6-sol, read-only, high effort.

## Round 1 — Codex
The plan needs revision. These are implementation blockers found in the current code; this was a read-only review.

1. **The server does not enforce the GM’s price checks.** The document ops route is available to the character owner. A player could enter a 0¥ buy price, a 50% fence price, or a positive `nuyen` entry without GM involvement, despite [R6/R7](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/RULINGS.md:13) saying the GM checks the deal.  
   Fix: Require GM authorization for negotiated prices, fence percentages, and income entries before they affect the balance.

2. **The route will reject ordinary money amounts.** Its generic integer schema permits only −1,000 to 1,000, while M4b specifies buy prices up to 10,000,000¥ and run payouts can exceed 1,000¥ ([documents.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:20)).  
   Fix: Add operation-specific bounds for `price` and `nuyen.amount`, and enforce the same bounds in `applyOp`.

3. **“M2c buyable” includes things that are not gear.** `BUYABLE` includes spells, adept powers, contacts, and lifestyles ([purchase.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:9)). The proposed buy and sell ops would let money create or fence those records; selling a lifestyle also leaves `actor.system.lifestyle` inconsistent.  
   Fix: Define a separate after-creation gear allowlist and restrict sales to actual transferable property.

4. **The Foundry price field would miss purchase paths.** Fixed price drops skip `_promptPurchaseOptions` entirely, while installed cyberware uses `_surgeryPurchase` and weapon foci have a separate bond dialog ([actor-sheet.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/actor-sheet.mjs:782)). Adding a field to `purchasePromptFields` callers alone cannot ensure the agreed price is charged once.  
   Fix: Collect the agreed price for every chargeable in-play path and pass it to one queued charge and paid-flag write.

5. **Creation projection is not an in-play purchase rule.** Its choices retain the starting Rating 6 limit, weapon focus projection can leave a focus unbonded, and catalog cyberware can project as `installed: true` without surgery ([purchase.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:19), [Wired Reflexes source](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/packs-src/cyberware/Wired_Reflexes_Level_3_c2f3e4d5a6b70829.json)).  
   Fix: Give in-play purchases their own validation and projection; defer installed cyberware until the surgery flow exists or buy it as an uninstalled spare.

6. **The proposed fence value omits real item value.** `itemBaseCost × quantity` treats ammo rounds as packages, misses drug acquisition bases and cybereye accessory rows, and lacks the context required by some rated or derived items ([rules](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1727), [purchase price input](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:158)).  
   Fix: Quote from the configured item’s full list-value basis, including stock fractions and accessory rows, with the same pricing context used at purchase.

7. **The pure-quote refactor could change existing refunds.** Today `saleQuote` has distinct handling for untracked items, depleted ammo and drugs, failed second-hand ware, and paid accessory rows; it also supplies accounting values to ammo consolidation and accessory moves ([money.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/money.mjs:99)). A few fixtures do not establish refund parity.  
   Fix: Preserve refund mode’s current output across that full case matrix, and keep internal consolidation and accessory accounting explicitly on refund mode.

8. **Fence percentages are too permissive.** The plan accepts every integer from 10 to 50, although [R6](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/RULINGS.md:13) and core p.188 move the 30% base in five-point steps per extra success.  
   Fix: Accept only 10, 15, …, 50 percent and record the agreed percentage in the sale entry.

9. **Undo and setting changes lack a complete transition contract.** Existing undo sends every entry to `karmaTransition`, and its ledger records Karma-specific inverse data ([creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:369)). M4b does not define inverse records for buys, sales, and cash entries or what happens if `saleMode` changes while a Sell dialog is open. The proposed Admin setting route and page do not yet exist ([admin.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/admin.mjs:7)).  
   Fix: Specify typed inverse records and live preconditions, store the applied sale mode and quote, reject a stale dialog, and add an admin-only setting endpoint.

VERDICT: REVISE
### Response
#2–#9 accepted (Draft 2). #1 declined as a server check: no GM role over a player's character exists (owner-only documents), Foundry lets players edit their own nuyen too; the history is the audit (made visible in round 2).

## Round 2 — Codex
**Draft 2 still needs revision.** The main gaps are in the fence quote and the promised checks around it.

1. **The GM cannot inspect the proposed audit (#1).** A player can buy an item for 0¥, but [document reads are owner-only](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:29), and the [sheet model](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:29) has no ledger. **Fix:** Specify a GM-readable history or a shareable sheet/export that includes the money ledger.

2. **A spare implant still reduces the app’s validated Essence (#5).** Buying uninstalled cyberware leaves the [sheet’s derived Essence](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/derive.mjs:19) unchanged, while [in-play validation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:342) counts it; a spare 1-Essence implant therefore produces conflicting values. **Fix:** Count only installed cyberware in `validateInPlay`.

3. **The specified fence call fails for cyberware (#6).** `chargenItemCost(priceInput(item))` calls [priceInput](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:159) without its required item list; for cyberware it throws while building the ware context. The proposed plain-item shape also omits the compendium source used to identify some ware rules. **Fix:** Pass the actor’s items and source identity into the fence quote’s pricing input.

4. **A full drug pack gets an inflated fence quote (#6).** For a three-dose pack with a 150¥ acquisition list value, `priceInput` omits `flags.sr2e.drug`, so [`chargenItemCost`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1738) returns 450¥; a 30% fence then pays 135¥ instead of 45¥. **Fix:** Carry the drug flag into the pricing input so pack pricing applies.

5. **A setting change can evade the promised quote check (#9).** The plan has the app route read `saleMode` before the reducer’s write transaction; if the GM switches from refund to fence after that read, a refund quote can still be accepted. The Foundry queue likewise re-quotes with the captured mode. **Fix:** Read the live mode inside the app transaction or Foundry money queue and reject when it differs from the mode shown.

6. **The five-point fence rule is not enforced by the stated bounds (#8).** A submitted 12% is within the specified 10–50 range, although [Draft 2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4b.md:90) permits only 10, 15, …, 50. **Fix:** Specify that the API, reducer, and Foundry dialog accept only those nine values, with a 12% rejection test.

VERDICT: REVISE
### Response
All six accepted (Draft 3).

## Round 3 — Codex
- [Five-point fence steps](</Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4b.md:109>): The schema, reducer, and Foundry dialog reject 12%, but the shared `saleQuoteOf` still reaches `fenceValue`, which only clamps to 10–50. A direct quote for a 1,000¥ item at 12% therefore returns 120¥, and the app could preview a sale the server refuses. **Fix:** Validate the nine allowed percentages in the shared quote function and use that validation for previews.

VERDICT: REVISE
### Response
Accepted and folded into Draft 3 (fenceValue returns null off the nine steps). Plan complete.
