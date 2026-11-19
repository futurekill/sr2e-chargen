# Plan review log: M4a (Karma after creation)
Codex gpt-6-sol, read-only, high effort.

## Round 1 — Codex
## Findings

1. **Karma mutations do not meet D13’s shared transition requirement.** [PLAN-M4a.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:23) shares pricing, but the app and Foundry still write Karma and ratings through separate paths; Foundry’s skill advancement currently updates the item and actor in two writes. **Fix:** Share a Karma transition that validates and produces the complete source change, and use it from both paths.

2. **Existing finished characters remain vulnerable to skill re-derivation.** The proposed `finish` change finalizes future characters, but existing finished items can still have `ratingsFinalized: false`; Foundry derives those ratings from `allocated`. **Fix:** Migrate existing finished characters by finalizing their stored skill ratings before advancement or export. [Foundry item-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:139)

3. **The current reducer would erase advancement.** Manager operations must return before `rebuildItems`: it regenerates every creation-owned skill from its original allocation, with `ratingsFinalized: false`. **Fix:** Give finished-character operations a path that edits `actor` without calling `rebuildItems`. [creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:373)

4. **The rules check would reject legal advances.** `validate()` still reports attributes above racial maximum and general skills above 6 as creation errors. **Fix:** Apply those limits only during creation, and validate post-creation advances under their own rules. [creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:425)

5. **Foundry awards will disagree with the app.** The existing award macro adds the full award to both `karma.current` and `karma.total`; the plan deducts the Pool share from Good Karma. **Fix:** Route the macro through `karmaAward` as well. [award-karma.js](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/macros/award-karma.js:82)

6. **Newly bought languages would receive a creation bonus in Foundry.** `chargenLanguage` defaults to `true`, while a Karma-bought language requires `false`; `ratingsFinalized` alone does not address this. **Fix:** Set `chargenLanguage: false` on every post-creation language item. [item-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:127)

7. **The displayed Pool would be wrong for an imported character mid-encounter.** The plan uses capacity, while Foundry subtracts `karma.spent` and adds `karma.drawn` for available Pool. **Fix:** Derive both capacity and available Pool from the source’s `spent` and `drawn` fields. [actor-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:588)

8. **The ledger does not cover every change it claims to cover.** `setName`, `setNotes`, and `setCard` remain unledgered, and folding entries after 1,000 loses the individual changes needed for a full history. **Fix:** Ledger every finished-character mutation and retain detailed entries in an archive when the active list is capped. [PLAN-M4a.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:36)

9. **Undo lacks a complete eligibility rule.** Checking Good Karma alone does not ensure that reversing an award leaves a valid Pool capacity after existing burns or encounter spending; the plan also does not say whether an undo entry can itself be undone. **Fix:** Revalidate the entire resulting Karma source and define undo-of-undo behavior explicitly. [PLAN-M4a.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:54)

10. **The planned skill picker can sell an invalid Sorcery advance.** The plan explicitly defers the hermetic sorcery-library requirement while allowing core skill raises; a hermetic could buy Sorcery without the required library. **Fix:** Check library rating before offering or accepting Sorcery advancement, or block that advance until the check exists. [RULES-CHARGEN.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/RULES-CHARGEN.md:99)

VERDICT: REVISE
### Response
All ten accepted (Draft 2).

## Round 2 — Codex
Draft 2 fixes the skill finalization, award split, and language bonus issues, but I found these remaining problems:

1. **Foundry item writes** ([Draft 2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:81)): Raise a skill: the proposed single `actor.update` cannot reliably apply the embedded Item change, so Karma can be charged while the rating stays put. [Foundry documents separate embedded Item APIs](https://foundryvtt.com/api/v13/classes/foundry.documents.Actor.html). **Fix:** Specify an embedded Item write and a failure-safe way to coordinate it with the Karma write.

2. **Undo gets stuck** ([Draft 2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:102)): Award, spend, then undo the spend; the newest entry is now the undo entry, which cannot itself be undone, so the award can never become eligible. **Fix:** Find the latest original entry that has no `undoneBy`, ignoring revert entries.

3. **Undo double-counts burned Pool** ([Draft 2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:102)): A human with Total 10 and burned 2 has valid capacity 0; after an award of 10, undoing that award restores capacity 0 but fails the proposed `0 ≥ burned 2` check. **Fix:** Check outstanding personal spending against capacity; `karmaPoolCapacity` has already subtracted burned points.

4. **Pool context is missing** ([Draft 2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:81)): Identical `{system, items}` for a metahuman can have different starting Pool capacities depending on More Metahumans, which lives in [creation options](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:43) or a [Foundry setting](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:586). A pure revert check cannot choose the right capacity. **Fix:** Pass the resolved rule option into the transition explicitly.

5. **New core skills lack source data** ([Draft 2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:81)): Buying Firearms when it is absent supplies only a catalog ID; `{system, items}` contains no Firearms template from which the pure transition can produce `newItem`. **Fix:** Resolve and validate the catalog entry before the call, then pass its item source in the action.

6. **The round-trip test contradicts history** ([plan tests](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:70)): After spend and undo, the body must contain both ledger entries, so it cannot equal the body before spending. **Fix:** Compare actor state and balances while asserting that the spend and revert remain in the ledger.

VERDICT: REVISE
### Response
All six accepted (Draft 3).

## Round 3 — Codex
Draft 3 leaves three failures:

- [Foundry writes](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:110): If an `item.update` is vetoed and returns a falsy result, the plan still proceeds to charge Karma. **Fix:** Verify the item write succeeded before calling `actor.update`.
- [Rollback](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:112): Adding a named concentration changes its name and rating; if the Karma write fails, restoring only the old rating leaves the new name behind. **Fix:** Restore every item field changed by the operation.
- [Pool check](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M4a.md:115): `spent` means personal points used, while `drawn` means Team Karma held; after an award is undone, capacity 1, spent 2, drawn 1 incorrectly passes `1 ≥ 2 − 1`. **Fix:** Require capacity ≥ spent.

VERDICT: REVISE
### Response
All three accepted and folded into Draft 3. Plan complete.
