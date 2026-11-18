# Code review log: weapon foci at creation (S12)
Codex gpt-6-sol, read-only. Reviewed 5ad6f2c (round 1) and b3e4038 (round 2).

## Round 1 — Codex (high)
- **[P1] A focus can bond to a weapon stack** — [shared/creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:205). Bond a focus to a Katana, then set the Katana’s quantity to 2. Validation reports no focus problem, but `bondedWeaponId` identifies a stack rather than one melee weapon. **Fix:** require the target weapon’s quantity to be 1, including when its quantity changes.

- **[P2] Removing the weapon leaves a stale bonded focus** — [shared/creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:214). Removing a bonded Reach 1 Katana leaves the focus marked `bonded: true` with a dangling `bondedWeaponId`; rebuilding also drops its displayed price from 290,000¥ to 190,000¥. Validation catches the missing weapon, but the draft item and budget are inconsistent. **Fix:** clear the focus binding and bonding spend when its weapon is removed, then require a new selection.

- **[P2] The shop advertises the wrong focus price** — [client/src/pages/Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:367). “Weapon Focus” appears at its catalog price of 10,000¥, while adding it immediately projects a minimum price of 190,000¥. **Fix:** show the weapon focus formula in search results instead of its catalog price.

The 10 focused resource tests pass. The new test checks projected focus costs and Force Points, but does not assert the Resources total or cover the stack and stale source cases.

VERDICT: REVISE
### Response
All three fixed: a weapon with quantity above 1 is refused and reported; removing the weapon unbonds its focus; the catalog shows no list price for a weapon focus. The test now checks the Resources total.

## Round 2 — Codex (medium, fix-only)
- [shared/creation.mjs:405](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:405): **Validation regression.** If a stored Weapon Focus points to an Armor Jacket’s ID, `validate()` reports no focus problem; the previous check rejected nonweapon links. Fix: require the linked item to be a melee weapon before checking its quantity.

The quantity and removal fixes passed their focused tests. The catalog price fix is reflected in a fresh build; the local catalog file is generated. Two catalog tests could not run because the read-only environment denied temporary directory creation.

VERDICT: REVISE
### Response
Fixed: the panel accepts only a melee weapon as the link. Stopped here (a one-line fix).
