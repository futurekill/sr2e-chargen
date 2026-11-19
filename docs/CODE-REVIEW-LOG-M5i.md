# Code review log: M5i, rule-bearing implants

## Round 1 — Codex (gpt-6-sol, high)
- **Bone lacing has no attack to update on a new app character.** [newCharacter](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:48) starts with no items, [purchase.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:109) refuses the zero-price Unarmed Strike, and [derive.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/derive.mjs:111) only updates an existing weapon. I bought Bone Lacing (Plastic) through the normal creation flow and got `attacks: []`; Foundry gives every character an Unarmed Strike. The parity fixture supplies one manually. **Fix:** Add the innate strike to app characters and test bone lacing through an actual purchase.

- **A failed move-by-wire implant leaves stale effects and warnings.** [derive.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/derive.mjs:25) still counts its modifiers and level, while [creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:803) still warns about its conflicts. Foundry excludes `secondhandFailed` move-by-wire when selecting the working implant ([actor-data.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1366)). On an imported in-play actor, this also gives the wrong Rigger 2 Control Pool. **Fix:** Exclude failed ware from derived effects and conflict selection while retaining its Essence cost.

- **The warning parity test can pass with incorrect warning text.** [ware-parity.test.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/ware-parity.test.mjs:26) cuts both actual and expected conflicts at the first colon, comparing only item names. It cannot catch a wrong rule, condition, or warning message. **Fix:** Compare the complete conflict text, with an explicit normalization only for citation formatting.

VERDICT: REVISE
### Response
- #1: true, and older than 5i: Foundry's Import Data replaces the new actor's items, its innate Unarmed Strike with them. derive now adds a virtual fist (Foundry's UNARMED_STRIKE_DATA) when the character has none; the export carries it (id unarmedStrike000, never twice). The core parity tests leave the virtual fist out (Foundry adds the real one at creation).
- #2: derive skips a failed second-hand part's modifiers, VCR, lacing, enhancer and move-by-wire (its Essence stays), as Foundry's secondhandDead; the warnings skip it too.
- #3: the warning parity compares whole texts (the page moved from the text to the citation).

## Round 2 — Codex (gpt-6-sol, medium, fix-only)
VERDICT: APPROVED