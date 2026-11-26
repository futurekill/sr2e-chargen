# Code Review Log: weapons on Rigger 2 mounts (docs/PLAN-workshop-mounts.md)

## System step 0, round 1 — Codex (gpt-6-sol, high)

- [test/vehicle-mounts-r2.test.mjs:9](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/test/vehicle-mounts-r2.test.mjs:9): The test reads a sibling R2 checkout at module load, but CI checks out only this repo, so `npm test` will fail before tests run. **Fix:** make pack-dependent tests conditional, as the existing R2 tests do.
- [vehicle-mounts-r2.mjs:126](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-mounts-r2.mjs:126): With an unknown weapon followed by a valid weapon on one turret, `mountProblems` throws while reading `null.wv` instead of returning problems. **Fix:** handle unknown classes in the turret sum.
- [vehicle-mounts-r2.mjs:159](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-mounts-r2.mjs:159): A linked conversion kit marked as a customization satisfies a fixed-mount rifle’s kit requirement, although it contributes no design-kit DP. **Fix:** require the matching kit to have `flags.sr2e.designMod`.
- [vehicle-mounts-r2.mjs:114](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-mounts-r2.mjs:114): A weapon linked to a customization mount passes validation as a weapon on a design mount. **Fix:** require design-mod status when resolving mounts for this design check.
- [vehicle-mounts-r2.mjs:164](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-mounts-r2.mjs:164): A conversion kit with no `kitFor` is ignored; the Workshop can add and save one as an unlinked design mod. **Fix:** identify kits by source key and report an orphan when the link is absent.
- [vehicle-workshop.mjs:149](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/vehicle-workshop.mjs:149): If a kit’s `kitFor` flag changes on the actor while the Workshop is open, refresh keeps the old staged flags; Save can validate the old link while leaving the invalid live link in place. **Fix:** refresh mod flags and source identity before validation, or detect the conflict and require another save.
- [vehicle-workshop.mjs:501](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/vehicle-workshop.mjs:501): `projectedItems()` validates a new mod’s staged flags, but creation writes only `designMod` and `wsUid`; a staged kit with `kitFor` loses its link on save. Its projected `new-uid` also cannot serve as a persistent mount ID. **Fix:** persist staged flags and remap any temporary mount references to created item IDs.
- [test/vehicle-mounts-r2.test.mjs:34](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/test/vehicle-mounts-r2.test.mjs:34): Tests pin only sample Weapon Values and one turret value, not every quoted table row; they also omit the customization, multiweapon turret, pintle-kit, and Workshop save cases above. **Fix:** add exact row assertions and those end-to-end cases.

I found no wrong IDs or values in the inspected mount, weapon, and kit rows. With no mounted weapons or linked kits, the new zero weapon-load path leaves existing design calculations unchanged.

VERDICT: REVISE
### Claude's response
- #1 fixed: the R2-pack tests skip when the sibling checkout is absent (CI).
- #2 fixed: an unclassed neighbour counts 0 in a turret sum; test.
- #3, #4 rejected: in Foundry a mount or a kit bought later as a CUSTOMIZATION is a real, paid, installed item; play uses it. Requiring design-mod status would refuse saves of vehicles customized after design. A customization kit adds no design DP because it was paid as a customization.
- #5 fixed: a design-mod kit with no kitFor is an orphan; an unlinked customization kit is left alone; tests.
- #6 fixed: the Workshop refresh takes the live item's flags and source.
- #7 fixed: creates keep the staged flags (designMod and wsUid added). Weapons never point at a not-yet-created mod in Foundry (only actor items carry mountId).
- #8 fixed: every class row and every turret value pinned; the multi-weapon turret, pintle kit and orphan cases.

## System step 0, round 2 — Codex (medium, fix-only)

- **#6 remains unfixed:** [vehicle-workshop.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/vehicle-workshop.mjs:148) retains the staged source UUID when the live item’s compendium source becomes null. Validation can therefore accept a mount that the saved actor can no longer identify.
- **#8 remains incomplete:** [vehicle-mounts-r2.test.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/test/vehicle-mounts-r2.test.mjs:110) adds rule cases but no Workshop save case, which round 1 explicitly requested.

The rejection of #3 and #4 holds: an installed customization mount or kit can serve a mounted weapon, and a customization kit does not add design DP.

VERDICT: REVISE
### Claude's response
- #6 fixed: the refresh takes the live item's compendium source, null included.
- #8 fixed: a Quench case in sr2e.vehicles drives the Workshop on a vehicle with a fixed-mount rifle and no kit (kitMissing; the save does not write; the occupied mount is not removed), then with its kit (no mount problem; 4.5 kg on the Load). Ran in the local world: sr2e.vehicles 19/19.

## System step 0, round 3 — Codex (medium, fix-only)

The source refresh now takes the live compendium source, including `null`, so round 2 point #6 is fixed.

Round 2 point #8 remains: the new Quench case clicks Save only while `r.valid` is false. The template disables Save in that state, so the click does not exercise the save handler. After adding the kit, the test checks `ws2.result()` but never saves.

VERDICT: REVISE
### Claude's response
- Fixed (test only): the Quench case calls the Workshop's save handler itself while the design is invalid (nothing written), and saves the finished design after the kit (Design Points written, the kit's link and design flag and the mount kept). Ran: sr2e.vehicles 19/19. Not sent for another round: the change is test-only and verified by running it.

## App, round 1 — Codex (gpt-6-sol, high)

- [shared/vehicle.mjs:182](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/vehicle.mjs:182): `addDesignMod` accepts a Firearm Conversion Kit by itself. The server stores an unlinked kit and leaves the design unfinished; mounting a weapon then adds a second kit. **Fix:** refuse standalone kit additions and test this operation.
- [shared/vehicle.mjs:246](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/vehicle.mjs:246): The new weapon charge enters the total, but the [Price view](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Vehicle.svelte:130) hides the Weapons line for designed vehicles. A mounted rifle raises the displayed total with no matching line item. **Fix:** show the list-price weapon line for designs.
- [VehicleDesign.svelte:159](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/VehicleDesign.svelte:159): Remove stays enabled on an occupied mount, so it sends an operation the server always refuses. **Fix:** disable it using `removalProblem` and show “Unmount weapons first.”
- [VehicleDesign.svelte:177](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/VehicleDesign.svelte:177): The picker ignores the 30-item limit. With 29 items, it offers a fixed-mount rifle that needs both a weapon and a kit; the server rejects the click. **Fix:** include the required item count in the picker’s fit check.
- [test/workshop-mounts.test.mjs:73](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/workshop-mounts.test.mjs:73): The “books include each weapon’s” assertion uses a core weapon on a design that already requires Rigger 2; `["r2"]` would pass even if weapon books were ignored. **Fix:** assert with a weapon citation outside the design’s baseline books.

The four new mount tests pass. I found no route-schema bypass or item-ID reuse in the staged paths.

VERDICT: REVISE
### Claude's response
All five fixed: addDesignMod refuses a conversion kit on its own (test); the Price shows the weapons line for designs; Remove is disabled on an occupied mount with "Unmount its weapons first"; the picker counts the weapon and its kit against the 30-item limit; the books test uses a weapon citing another book.

## App, round 2 — Codex (medium, fix-only)

The five round 1 fixes are present, but #1 introduces a UI defect: the modification picker still enables **Add** for all four Firearm Conversion Kits, while `addDesignMod` now rejects every click. On a valid sedan design, all four pass the picker’s fit check. Hide or disable those entries and direct users to mount a weapon. The five mount tests pass.

VERDICT: REVISE
### Claude's response
Fixed: the modification picker disables the four kits with "added for you when you mount a personal firearm on a fixed mount or turret". A one-line client change, built and linted; not sent for another round.
