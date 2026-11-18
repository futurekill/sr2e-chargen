# Plan review log: vehicles bought at creation (S9)
Codex gpt-6-sol, read-only, high effort.

## Round 1 — Codex
The plan needs revision. I found no supported SR2 p.46 or p.264 reason to cap the number of vehicles or apply the gear Rating 6 limit to an unrated vehicle. The concrete flaws are in pricing and document handling:

1. **The GM relay described in the plan does not exist on `chargen/s-prereqs`.** `createActorViaGM` creates directly and requires the player to have `ACTOR_CREATE`; a player without it cannot buy a compendium vehicle through the proposed drop flow. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-S9-vehicles.md:12)  
   **Fix:** Specify the actual permission requirement and test a player without `ACTOR_CREATE`, or implement the relay first.

2. **`chargenItemCost` cannot price raw embedded items as proposed.** It reads flat fields such as `cost`, `rating`, `quantity`, and acquisition value; vehicle items supply those under `item.system`. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-S9-vehicles.md:24)  
   **Fix:** Project embedded items through the same pricing input mapping used by the character budget before calling `chargenItemCost`.

3. **Adding every embedded item can charge twice.** A mounted weapon may also remain in the character’s counted items, and the vehicle’s listed price may already cover standard equipment; the plan defines no distinction between included equipment and a separately bought addition. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-S9-vehicles.md:24)  
   **Fix:** Charge only explicit extra purchases and define how moving an already purchased item onto a vehicle affects the budget.

4. **A UUID alone is an unstable purchase record.** Deleting a bought vehicle makes its cost zero; later edits to its cost or equipment change the historical spend. Token actor UUIDs also expire with their token, while duplicated characters can point at the same purchased world vehicle. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-S9-vehicles.md:27)  
   **Fix:** Store a purchase receipt with its paid price and a remappable vehicle identity, and define copy and deletion behavior.

5. **`fromUuidSync` does not guarantee a priced vehicle document.** For a compendium UUID it can return only an index entry, which need not contain `system.cost` or embedded items. [Foundry v13 API](https://foundryvtt.com/api/v13/functions/foundry.utils.fromUuidSync.html)  
   **Fix:** Restrict purchases to resolved world vehicle actors or resolve and validate compendium documents asynchronously.

6. **The new nested array needs a portable-schema and migration plan.** The plan adds `chargen.vehicles` to an existing `SchemaField`, but does not say how older actor sources and bundles acquire it or how the existing portable reference adapter remaps its UUIDs on import. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-S9-vehicles.md:18)  
   **Fix:** Add the field and reference mapping to the portable schema, migrate older sources, and test old-source and new-ID round trips.

7. **The app’s stated budget change misses its validation path.** `validate()` currently calls `chargenSpend` directly; simply passing vehicles to `chargenBudget` elsewhere leaves over-budget checks and remaining Resources unchanged. [App validation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:415)  
   **Fix:** Make validation and finishing use the vehicle-inclusive budget result.

8. **The catalog snapshot is not a complete actor source.** Catalog shaping removes text from `system`, omits actor fields such as `prototypeToken`, and shapes embedded items as catalog entries. The proposed connector cannot create an equivalent vehicle actor from that snapshot alone. [Catalog shaping](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:114)  
   **Fix:** Define and test an explicit catalog-to-actor reconstruction, or retain a complete validated actor source for export.

9. **The drop flow has an orphan and lost-update race.** The existing flow imports a compendium actor before updating `linkedVehicles`; a cancelled purchase or failed update can leave an orphan, and concurrent drops or toggles can overwrite arrays read earlier. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-S9-vehicles.md:20)  
   **Fix:** Prompt before import, then serialize the character update, recheck creation state and links, and clean up a created actor if linking fails.

VERDICT: REVISE
### Response
All nine accepted (Draft 2): purchase receipts {name, source, cost} instead of UUIDs; vehicle list price only; prompt before import, one update, delete the import on failure; chargenBudget reads the receipts itself.

## Round 2 — Codex
Draft 2 fixes the nine stated round-1 issues, but introduces or leaves two failing cases:

1. **A restricted vehicle is free.** The core catalog gives the GMC Banshee and Federated-Boeing Eagle `system.cost: 0` because p.264 lists their cost as “Restricted.” Draft 2 lets the app buy catalog vehicles and records that zero as the price, so either vehicle adds **0¥** to Resources. **Fix:** Refuse “Buy at creation” when no positive numeric list price exists; keep “Link only” available.

2. **App purchases depend on the destination compendium.** Draft 2 discards the catalog vehicle snapshot and tells the connector to create an actor from the receipt’s source UUID. If a character is built against one pinned catalog and imported into a Foundry world with a changed or missing compendium entry, the paid vehicle cannot be recreated faithfully. **Fix:** Carry the complete purchased vehicle source in the app’s document bundle and create from that source, using the UUID only for provenance.

VERDICT: REVISE
### Response
Both accepted (Draft 3): no positive list price, no purchase; the app keeps the complete vehicle source.

## Round 3 — Codex
1. **Invalid receipts can still be silent.** Draft 3 puts a zero-cost GMC Banshee receipt in `resources.vehicleProblems`, but specifies no display or validation error for that field. A hand-edited receipt can therefore count 0¥ while creation remains finishable. **Fix:** Show `vehicleProblems` on the Foundry panel and turn each one into an app validation error. ([plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-S9-vehicles.md:86), [current validation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:415))

2. **The app cannot retain the promised source in production.** Buying a Dodge Scoot requires its complete `packs-src` actor source, but the final image copies only the shaped catalog; `packs-src` is absent at runtime. The connector cannot create the actor from a source the app never stored. **Fix:** Package the raw vehicle sources in a runtime lookup keyed by catalog ID, and store the selected source at purchase. ([plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-S9-vehicles.md:92), [Dockerfile](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docker/Dockerfile:25))

VERDICT: REVISE
### Response
Both accepted (Draft 4): bad receipts are shown and are app errors; vehicles.json ships with the catalog.

## Round 4 — Codex
Draft 4 still has three gaps:

1. **Foundry completion:** A character with a hand-edited zero-cost receipt shows a red problem, but the owner can untick “Creation in progress” and finish anyway. **Fix:** Block the Foundry `inProgress` true-to-false update while `resources.vehicleProblems` is nonempty. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-S9-vehicles.md:99) · [checkbox](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/templates/actor/parts/actor-bio.hbs:128)

2. **Source delivery:** `loadCatalog` holding `vehicles.json` on the server does not let the browser’s `addVehicle` operation store that source; the current detail route returns only the shaped catalog entry. **Fix:** Expose the checked vehicle source through the authenticated catalog detail API and supply it to the operation on both client and server. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-S9-vehicles.md:102) · [route](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/catalog.mjs:28)

3. **Manifest check:** Adding a vehicle checksum to the manifest makes the current exact manifest-to-catalog comparison reject every build, even when both files are valid. **Fix:** Verify the vehicle checksum separately, then exclude that checksum from the catalog metadata comparison. [loader](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/catalog.mjs:35)

VERDICT: REVISE
### Response
#2, #3 accepted (Draft 5). #1 declined: Foundry's panel is advisory everywhere (over budget never blocks); the app blocks.

Round 5 = checkpoint with the user (standing rule).
