# Code review log: milestone 2c (resources)
Codex gpt-6-sol, read-only. Round 1 high; round 2 fix-only, medium. Reviewed 89fd3b8.

## Round 1 — Codex
The M2c change does **not** fully match draft 4. I reproduced the reducer and pricing cases below; the six existing resource tests pass, but they do not cover these cases. The workspace was not changed.

1. **Muscle replacement is overpriced with a cyberlimb.** [shared/purchase.mjs:113](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:113): A full cyberarm plus Rating 1 Muscle Replacement totals **120,000¥** here; the system’s Foundry-shaped inputs count the limb and total **116,000¥**. `wareCtx` reads `_source.system`, which these plain actor items lack. **Fix:** Adapt actor items to the source shape expected by `wareCtx` before pricing.

2. **Existing M2b skills cannot be edited first.** [shared/creation.mjs:237](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:237): An older skill record without `type` gets “No such skill” on its first `setSkill` or `removeSkill`; migration runs only after the operation switch. **Fix:** Migrate legacy records before dispatching the operation.

3. **Rating 7 gear passes validation.** [shared/creation.mjs:348](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:348): “Deluxe Improved Gyro Mount” is buyable with its catalog Rating 7 and produces no Resources problem, contrary to plan §3. **Fix:** Report any starting item whose projected rating exceeds 6.

4. **The Bow accepts a choice outside the plan.** [shared/purchase.mjs:23](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:23): `setItem` accepts `strengthMinimum: 10`; draft 4 specifies 1–6. **Fix:** Set the Bow choice’s upper bound to 6.

5. **A spell focus accepts a foreign spell ID.** [shared/creation.mjs:169](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:169): Setting `spell` to another character’s spell ID succeeds and writes it to `boundSpellId`; validation catches it only afterward. **Fix:** Refuse a nonempty spell choice unless it identifies this character’s spell record.

6. **Unspent Force Points never produce the planned warning.** [shared/creation.mjs:369](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:369): A full magician with Resources A and zero Force Points spent gets no warning, despite plan §3 saying unspent points are warned about. **Fix:** Add a warning when a magician’s Force Points remain.

7. **Shop results can revert to an older search.** [client/src/pages/Character.svelte:48](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:48): If search A responds after newer search B, A overwrites B’s results and can clear the busy state while B is pending. **Fix:** Give each request a sequence number and apply only the latest response.

8. **The reducer accepts prototype operation names.** [shared/creation.mjs:87](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:87): `applyOp(body, {op: "__proto__"})` succeeds as a no-op because `in` includes inherited keys; the HTTP schema rejects it, but the reducer’s own unknown-operation contract fails. **Fix:** Use `Object.hasOwn(OPS, op.op)`.

VERDICT: REVISE
### Response
All eight accepted and fixed (see the round-1 fix commit).

## Round 2 — Codex
Round 2 found one incomplete fix. The targeted tests pass (23/23), but they do not cover the catalog search timing case.

1. **Pass — [shared/purchase.mjs:113](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:113).** Case: muscle replacement beside a full cyberarm previously missed its 20% discount. Fix: pass source-shaped documents to `wareCtx`.
2. **Pass — [shared/creation.mjs:90](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:90).** Case: `setSkill` on an M2b record without `type` previously failed lookup. Fix: fill legacy records before dispatching the operation.
3. **Pass — [shared/creation.mjs:364](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:364).** Case: fixed Rating 7 Deluxe Improved Gyro Mount previously escaped the cap. Fix: report ratings above 6 on projected items.
4. **Pass — [shared/purchase.mjs:23](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:23).** Case: Bow Strength Minimum 7 was accepted. Fix: cap the choice at 6.
5. **Pass — [shared/creation.mjs:179](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:179).** Case: a Spell Focus could name another character’s spell ID. Fix: require an owned spell record.
6. **Pass — [shared/creation.mjs:376](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:376).** Case: a magician with 50 unspent Force Points received no warning. Fix: warn when their remaining balance is positive.
7. **Fail — [client/src/pages/Character.svelte:44](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:44).** Case: search A is pending; the user types B; A returns during B’s 250 ms debounce and replaces the results because `shopSeq` has not advanced. Fix: increment `shopSeq` immediately in `searchShop()`, before scheduling the request.
8. **Pass — [shared/creation.mjs:87](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:87).** Case: `__proto__` or `toString` was treated as a known operation. Fix: check `Object.hasOwn(OPS, op.op)`.

VERDICT: REVISE
### Response
Accepted #7: the sequence number is taken when the search is typed, not when it starts. One-line client fix; not re-reviewed.
