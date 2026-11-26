# Plan Review Log: weapons on a design's Rigger 2 mounts
Started 2026-11-26. MAX_ROUNDS=5. Codex gpt-6-sol.

## Round 1 — Codex

**The kit DP calculation works, but the parity and validation paths are incomplete.** Each conversion kit is `designable: true`, has flat `designPoints` and `stack: ""`, and has no restrictions. Two rifle kits therefore contribute **4 DP**, plus **1 kg of Load reduction** (0.5 kg each), in both engines. Their `system.cost` is not an additional design price because `designNuyen` is false. [Kit data](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-rigger-2/packs-src/r2-vehicle-mods/Firearm_Conversion_Kit_Rifle_Shotgun_LMG_678b4d77eb54b3d7.json), [DP and capacity rules](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-design.mjs:330).

- **Foundry will still show a different price.** The plan adds weapon list prices to the app total, while the Workshop’s `result()` and save use only `designVehicle().price`. **Fix:** define the price being compared and add the same weapon purchase line to Foundry’s displayed and saved total if all-in parity is required. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:68), [Workshop](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/vehicle-workshop.mjs:427).

- **`weaponLoad` is feasible with a default of zero, but the proposed call path is incomplete.** Foundry’s actor data separately calls `vehicleCapacity`; changing only `designVehicle` would make the Workshop budget disagree with the vehicle sheet. **Fix:** pass the same validated fixed-mount weight through `designVehicle` *and* the actor’s capacity calculation, defaulting to zero for existing designs. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:50), [actor data](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:2301). Also reject missing or implausible weights: the core catalog records zero for the Colt Manhunter and Ingram Smartgun.

- **Folder-based classification does not survive the proposed weapon snapshot.** Catalog entries have a derived `category` path, but `snapshot()` copies the weapon’s `system`, not that path; the exported item has no folder. Explicit vehicle-weapon IDs also need precedence over folder rules: the core Autocannon sits in *Assault Cannons*. **Fix:** generate and pin a complete document-ID-to-class table from the catalog at build time, and use that table for both catalog entries and exported items. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:37), [catalog shaping](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:132), [snapshot](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/vehicle.mjs:129). The plan also says **21** mount mods; its own breakdown and the pack contain **19**. Correct the count and assert the exact ID set.

- **“Flagged, unfinished” has no purchase gate yet.** `vehiclePrice()` currently treats the engine’s `valid` result as sufficient; `designVehicle` knows nothing about mount occupancy, weapon class, turret WV, orphaned kits, or missing mounts. **Fix:** combine mount and kit problems with engine problems in one server-side design result used by preview, price, purchase, and Foundry save. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:63), [current price gate](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/vehicle.mjs:207).

- **The kit link is enforceable only in the app as written.** Foundry’s Workshop loads every flagged design mod and lets its Remove action delete a kit independently of its weapon; it does not check `kitFor`. **Fix:** make the shared mount validation catch missing, extra, or wrong-class kits when Foundry reopens and saves the design. [Workshop load and removal](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/vehicle-workshop.mjs:105), [plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:59).

- **Mount removal silently destroys purchased items.** The generic design-mod Remove action has no per-weapon confirmation; the proposed cascade deletes weapons and kits in that same operation. **Fix:** refuse removal of an occupied mount until its weapons are explicitly unmounted, or require a confirmation naming every item that will be deleted. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:63), [current removal](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/vehicle.mjs:189).

**Rulings:** Allowing a small arm on a fixed hardpoint is a reasonable reading. Excluding pistols and shotguns from turrets follows the missing WV entries, but assigning ordinary turret values to remote mini/small/medium turrets is an unprinted extrapolation; label and test it as a house ruling. The claim that R2 conversion kits replace core price doubling also needs an explicit rule basis before treating it as book parity. Finally, the R2 *Man-Portable Missile Launcher* is described as shoulder-fired/hardpoint equipment; its pack location alone does not establish the proposed no-kit exception. [Proposed rulings](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:91), [launcher data](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-rigger-2/packs-src/r2-vehicle-weapons/Man_Portable_Missile_Launcher_31ae1ee0bbeff7ee.json).

VERDICT: REVISE
### Claude's response
Accepted all: the compared price is the design price (weapons, like cargo, are separate purchases); weaponLoad through designVehicle AND VehicleData via one helper; a literal document-id class table pinned against the folders (vehicle ids win), classed by flags.sr2e.catalogId; 19 mounts with an exact-set test; one mountProblems check merged into the app's design result and the Foundry Workshop's; occupied mounts can't be removed; remote turret values labelled a house ruling; no-doubling stated as a ruling with its basis; the Man-Portable Missile Launcher takes the Heavy kit. Added: the R2 pack's kit costs fix.

## Round 2 — Codex

The revision addresses the main round 1 points on paper. The four kits are `designable`, have flat DP, no restrictions, and no level stacking: two Rifle/Shotgun/LMG kits contribute **4 DP and 1 kg of Load use** in the engine and Foundry Workshop. The plan also corrects the mount count to 19, distinguishes design price from separately purchased weapons, and calls for the sheet to use the same weapon load.

**The remaining issues need changes before implementation:**

- **Foundry can still save a removed kit or occupied mount.** The plan says `mountProblems(items)` runs in Workshop `result()`, but Workshop removal changes its staged `this.mods` while the actor still contains the item until `#reconcileMods()` *after* validation. Checking actor items would see the kit or mount and approve a save that deletes it. [Workshop removal and save](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/vehicle-workshop.mjs:413), [plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:46). **Fix:** validate a projected post-save item set built from staged mods and current weapons; refuse removal of an occupied mount in Foundry too.

- **Foundry’s mod round trip loses the IDs the new rules require.** `#modFromItem` drops item flags, and newly added mods are saved with only `designMod` and `wsUid`; they receive no `catalogId`. A mount added in Foundry cannot be identified by the proposed ID table after save. [Workshop mod loading and creation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/vehicle-workshop.mjs:118), [plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:34). **Fix:** retain and write each mod’s catalog identity, and validate against the staged identity before save.

- **The existing catalog-ID helper rejects Rigger 2 IDs.** `docIdOf()` accepts only IDs starting `sr2e.`, while R2 catalog IDs start `sr2e-rigger-2.`; using it for the new mount or weapon table yields an empty ID. [Helper](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/vehicle.mjs:40), [catalog format](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:128). **Fix:** parse and validate the package, pack, and document ID for both sources.

- **“Every core-book firearm and heavy weapon” is too broad for folder generation.** The Heavy Weapons folders also contain six rockets/missiles that are ammunition and an under-barrel launcher treated as an accessory by the existing mount rules. A folder-derived table could make them mountable. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:38), [existing exclusions](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-mounts.mjs:38). **Fix:** pin an explicit exclusion set alongside the weapon-ID table, and fail the test when either set changes.

- **Fixed-mount weight remains unresolved.** The plan explicitly accepts zero weight for the Colt Manhunter and Ingram Smartgun pending an audit, so those weapons evade the printed “plus weapon’s weight” Load cost. `weaponLoad` itself is feasible with a zero default, provided it is transient capacity use rather than a change to stored gross Load. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:111), [capacity rule](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-design.mjs:345). **Fix:** resolve those weights before enabling the weapons on fixed mounts; reject missing, negative, or nonfinite load inputs.

- **The removal test contradicts the revised rule.** The plan now refuses removal of an occupied mount, but its app proof still says “mount removal cascades.” [Rule and test](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:70). **Fix:** test that removal is refused and the mount, weapon, and kit remain intact.

The three mount rulings are stated clearly enough: small arms on fixed hardpoints and exclusion of pistols and shotguns from turrets are defensible readings; remote turret values are appropriately labelled a house ruling. The separate no-doubling price choice is also labelled a ruling, so its interpretation is visible.

VERDICT: REVISE
### Claude's response
Accepted all six: the Foundry Workshop validates the projected item set and refuses removing an occupied mount or a linked kit; it keeps and writes mod identity (catalogId / compendiumSource) and sourceDocId parses both for any package; an explicit exclusion set (6 munitions + the under-barrel launcher) pinned with the class table; the two zero weights fixed from the rendered page (2.5, 3) and a bad weight on a fixed mount is a problem, never 0; the proof now tests refusal, not cascade.

## Round 3 — Codex

The revision addresses the round 2 Workshop save, mod identity, exclusion set, weight data, and removal test issues. The kit fields still support parity: two Rifle/Shotgun/LMG kits contribute 4 DP and 1 kg of Load use. The three mount rulings remain clearly stated. Two gaps remain:

- [The plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:43) accepts a source ID from *any* package, then classifies by document ID alone. A different pack containing the same ID would be treated as an official mount or weapon. **Fix:** key classification by the full package, pack, and document ID.
- [The plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:58) rejects bad *weapon weights*, but does not require `designVehicle` to reject a negative or nonfinite `weaponLoad` argument. [The capacity rule](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-design.mjs:345) accepts negative use and coerces nonfinite values to zero. **Fix:** validate `weaponLoad` at the engine boundary while retaining the zero default.

VERDICT: REVISE
### Claude's response
Accepted both: tables keyed by the full package.pack.docId (sourceKey); the engine refuses a weaponLoad that is not a finite number >= 0.

## Round 4 — Codex (delta)

Both round 3 points are fixed in the plan. The [classification tables](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:43) use the full package, pack, and document ID, preventing a matching ID in another pack from being treated as an official item. The [engine rule](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-workshop-mounts.md:64) keeps the zero default and makes a negative or nonfinite `weaponLoad` invalidate the design. I found no new problem in either revision.

VERDICT: APPROVED
Converged: APPROVED in 4 rounds.
