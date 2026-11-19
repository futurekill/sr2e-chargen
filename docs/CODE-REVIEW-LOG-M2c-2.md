# Code review log: M2c-2 physical adept powers (app) and adeptPowerBudget (system)
Codex gpt-6-sol, read-only. App branch chargen/on-0.161 (local), system branch release/0.161.0 (local).

## Round 1 — Codex (high)
1. **Killing Hands levels are incorrectly blocked.** [shared/creation.mjs:192](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:192) treats Killing Hands (L) and (D) as duplicates. Buying L, then D is refused, although SR2 p.126 explicitly permits both. **Fix:** Deduplicate Killing Hands by level, and add an L plus D test.

2. **Invalid senses pass validation.** [shared/creation.mjs:425](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:425) checks only that the list is nonempty. `radio` and `low-light vision, low-light vision` are accepted and priced as improvements; the former is excluded by p.125. **Fix:** Reject technological senses and repeated normalized entries, with tests for both.

3. **Magic type changes expose a Foundry parity error.** [actor-data.mjs:1236](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1236) still applies an adept power’s attribute modifiers after changing the character to mundane, while [derive.mjs:29](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/derive.mjs:29) drops them; Improved Ability has the same Foundry gate issue. For example, Increased Reaction +1 remains active in Foundry after the type change. **Fix:** Gate all Foundry adept effects on `magic.type === "physical_adept"` and test the type change.

4. **Printed powers omit their choices.** [server/sheet/model.mjs:79](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:79) renders only name and level. A sheet with Improved Ability on Firearms and two named senses prints neither “Firearms” nor the senses. **Fix:** Include `improvedSkill` and the named senses in sheet and card power rows.

The `4e984a0f` budget extraction appears behavior identical to the removed cost method and loop. The 24 focused app tests pass; they do not cover the cases above. No files were modified.

VERDICT: REVISE
### Response
All four fixed: Killing Hands deduplicated per level (p.126); senses once each and nothing radio (p.125); Foundry gates adept attribute and skill effects on physical_adept (Quench test); the sheets print Improved Ability's skill and the named senses.

## Round 2 — Codex (medium, fix-only)
- [module/sheets/sheet-actions.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:713), [module/documents/item.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1263): After changing an adept with Killing Hands to `magic.type = "none"`, an unarmed attack still offers and applies Killing Hands. **Fix:** require `physical_adept` in both the attack dialog and damage checks.

- [shared/creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:430): The senses check accepts “low-light vision, low light vision” as two improvements and accepts technological choices such as “digital camera”; its normalization and keyword check miss both. **Fix:** normalize equivalent sense names and validate choices against permitted physical senses.

- [server/sheet/model.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:80), [server/sheet/render.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:292): A default Killing Hands item prints its descriptive `notes` in the new “For” column, while the PDF gives that column only 5% of the table width. Even a chosen “low-light vision” wraps into a very tall cell. **Fix:** populate “For” only from the relevant power choice and give it a usable PDF width.

VERDICT: REVISE
### Response
Fixed: Killing Hands needs physical_adept in the attack dialog and the damage path; sense names compare letters only (low-light = low light) and the keyword list gains camera/digital/electronic (a shortcut: the GM judges the rest, p.125); the 'For' column takes only the power's choice and 40% of the PDF table. Stopped here.
