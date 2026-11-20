# Plan review log: M5l

## Round 1 — Codex (gpt-6-sol, high)
## Findings

1. **The pair keys are not catalog IDs.** The content uses values such as `ct:w-cybergun-light-pistol`, while [build-catalog.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/build-catalog.mjs:126) assigns IDs such as `sr2e-cybertechnology.ct-weapons.a6dad5c34858acc2`. A direct catalog lookup of the flag will fail. **Fix:** resolve the short keys to catalog entries, require a unique reciprocal match, and store the resulting catalog IDs.

2. **The browser cannot add both records with its current lookup.** It fetches only the selected implant before calling the shared reducer; the paired weapon is absent from its [entry cache](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:82). **Fix:** fetch and cache the paired weapon before the optimistic operation, or include its full entry with the implant response.

3. **The proposed `pairedTo` record link disappears from Foundry export.** [rebuildItems](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:758) projects records into items, and [export/import](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/foundry.mjs:23) retains items and flags, not creation records. M7 imports every item as foreign. With two copies of one implant, source flags cannot identify which weapon belongs to which implant; sale protection is lost too. **Fix:** persist the instance link in exported item flags and make play operations recognize it after import.

4. **Pair sale and undo need a two-item transaction.** [sellItem](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:547) and [undoMoney](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:569) currently quote, snapshot, remove, compare, and restore one item. The [sale UI](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:438) will also offer the 0¥ weapon separately. Undoing a sale may reassign a colliding `_id`, leaving an instance link stale. **Fix:** quote the implant, hide and reject its weapon as a separate sale, snapshot and compare both items, and update both links if restoration reassigns either ID.

5. **An unattached cybergun cannot pass the current creation check.** Foundry’s limb model calls it an orphan, and [limbChecks](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:847) makes every orphan a creation error. The outside-limb Essence branch can calculate a value, but that does not make the character finishable. **Fix:** give known cyberguns a specific natural-limb placement path that charges outside-limb Essence; keep invalid links and the unattached taser as errors.

6. **The proposed spare weapon shows as an attack before surgery.** The [weapon derivation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/derive.mjs:171) includes every `weapon` item, while the [plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M5l.md:28) buys the implant as an uninstalled spare and adds its weapon beside it. **Fix:** suppress a paired weapon’s attack while its linked implant is uninstalled.

7. **The p.52 Essence values are wrong for two cyberguns.** [OUTSIDE_LIMB_ESSENCE](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/limb-stats.mjs:141) and the content assign **1.0 to the heavy pistol** and **0.6 to the submachine gun**; the *Cybertechnology* p.52 Cybergun Essence Costs table assigns **0.6** and **1.0**, respectively, as also reflected in [FASA’s later table](https://www.scribd.com/document/697678733/Fasa-7126-Man-and-Machine). The book also limits a limb to one cybergun, which the plan does not check. **Fix:** correct both source values and Foundry’s mapping, then reject a second cybergun in the same limb.

VERDICT: REVISE
## Round 2 — Codex (gpt-6-sol, high)
VERDICT: APPROVED
Response: Draft 2 in docs/PLAN-M5l.md (#7 rejected: Cybertechnology p.52 and SSC p.86 rendered).
