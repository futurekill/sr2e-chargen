# Code review log: M7, the Foundry connector

## Round 1 — Codex (gpt-6-sol, high)
- **High — Broken Karma operations:** [shared/foundry.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/foundry.mjs:63) checks Karma fields but accepts `system.karma` as a string. The import passes derive and validate; awarding Karma then throws a server error. **Fix:** require a Karma object and validate or fill its numeric fields before saving.
- **High — Damage is calculated incorrectly:** [shared/foundry.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/foundry.mjs:61) leaves condition monitor values unchecked. With `physical.value: "1"`, one box of damage produces **10** filled boxes. **Fix:** validate the monitor’s shape and bounded integer values.
- **High — Accepted import breaks the sheet:** [server/library.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:143) calls derive and validate but never checks sheet generation. A numeric `system.race` or `system.magic.type` passes import, then `sheetModel` throws when the PDF is requested. **Fix:** validate those fields against the system’s allowed values and check the sheet model before storage.
- **Medium — Validation errors are ignored:** [server/library.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:143) discards `validate(body).problems`. A cyberware Essence cost of 7 is stored as a finished character even though validation reports Essence −1 as an error. **Fix:** refuse imports with validation errors.
- **Medium — Skill advancement uses corrupt numbers:** [shared/foundry.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/foundry.mjs:70) accepts a skill rating of `"5"`; the Karma screen then offers `5 → 51` at a cost of 102. **Fix:** validate skill ratings and concentration/specialization ratings as bounded integers.
- **Medium — Reimport creates duplicates:** [server/library.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:140) deduplicates only requests that reuse the same idempotency key. The client uses a fresh key after a successful import, so importing the same file twice creates two characters, contrary to the QA plan. **Fix:** enforce a per-owner file fingerprint for successful imports or revise the stated behavior.

VERDICT: REVISE
### Response
- #1–#3, #5: the import now checks Karma (an object of whole numbers), the condition monitor (whole numbers 0–100), the metatype and magic type (choice keys), item ratings (whole 0–50) and Essence (numbers 0–20, also module rows). The sheet model runs once at import: a throw refuses it.
- #4: a rules error (validate severity error) refuses the import, with the first error named.
- #6: wording fixed, not the behavior: a retry (same idempotency key) dedupes; a deliberate re-import makes a copy, which a player may want.

## Round 2 — Codex (gpt-6-sol, medium, fix-only)
VERDICT: APPROVED