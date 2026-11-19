# Plan review log: M4c (damage, ammunition, cybersurgery)

## Round 1 (Codex gpt-6-sol, high): 8 findings, all accepted → Draft 2
1. Category from the item's base Essence, not the adjusted cost. Accepted.
2. Cyberlimbs change muscle Essence (Cybertechnology p.57); core sells both. Accepted: whole-inventory totals.
3. The app's `essenceOf` isn't Foundry's `actualEssenceCost`. Accepted: `wareEssence` + the limb markers everywhere.
4. Finished characters store no monitor. Accepted: written at finish, created when missing.
5. Undo lacks the after-state. Accepted: full before/after snapshots.
6. Selling installed cyberware bypasses removal. Accepted: refused.
7. Sheets print capacity only. Accepted.
8. Bounds and optional fields. Accepted.

## Round 2 (high): 2 findings, both accepted → Draft 3
1. `sourcesOf` needs `_source.system`: use `asDocs`.
2. `wareEssence` needs `capacityUsed`: compute it from the module rows. (Mechanical; folded without a round 3, pinned by
   a parity test.)
