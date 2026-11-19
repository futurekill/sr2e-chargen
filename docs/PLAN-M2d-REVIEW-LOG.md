# Plan review log: M2d
Codex gpt-6-sol, read-only, high effort.

## Round 1 — Codex
## Findings

- **Server rolls lack a safe request boundary.** The draft puts gang and finish rolls in `op.roll`, but the [ops route](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:24) derives a strict public schema from `OPS`; adding `roll` there risks accepting client dice, while adding it before [idempotency fingerprinting](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:132) makes a retry look like a different request. **Fix:** Keep rolls out of public ops and generate private, validated roll values inside the idempotent `applyOps` transaction, fingerprinting the original request.

- **The promised edits after finish do not work safely.** [M2d §6](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2d.md:60) allows name and notes, but [applyOp](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:99) refuses `setName`; `setNotes` passes through `rebuildItems`, which can rewrite finished items. **Fix:** Handle both fields as direct metadata edits that return before rebuilding items.

- **The purchase gate rejects planned free entries.** Removing the explicit contact/lifestyle refusal in [purchase.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:77) still leaves the `price <= 0` refusal, which rejects contacts and the free Streets lifestyle. **Fix:** Apply the positive-price gate only to types that require a fixed purchase price.

- **The operation schema cannot express the planned choices as written.** [M2d §§2–3](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2d.md:16) calls for `addItem` kind/months and a five-string `setExtra.archetypes`, while the [current schema](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:19) makes every listed field required and has no array field type. **Fix:** Define per-operation public schemas, including optional type-specific add choices and a bounded archetype array, then enforce them again in the reducer.

- **The budget switch can hide a finish-blocking problem.** [chargenBudget](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1889) returns `resources.vehicleProblems`; [M2d §1](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2d.md:7) says to retain checks outside the budget but does not turn those problems into validation errors. A character carrying a zero-price vehicle receipt could finish. **Fix:** Convert every `vehicleProblems` entry into a finish-blocking validation error.

- **The allergy check leaves incomplete selections ambiguous.** [allergyBonus](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1545) silently grants zero unless both rarity and severity exist; [M2d §4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2d.md:39) does not require all four choice fields together. **Fix:** Accept either five empty allergy fields or a substance plus valid rarity, severity, and both bonus categories; report every partial state.

- **Finish can omit the two starting contacts.** [M2d’s contact rules](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2d.md:16) price the first two at zero but specify no validation for fewer than two, despite the [core-rule summary](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/RULES-CHARGEN.md:64) saying every character starts with two. **Fix:** Add a finish-blocking to-do until two ordinary contacts are chosen.

The existing [revision-conditional write](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:83) is sufficient to make only one concurrent finish or finish-versus-restore succeed, provided validation and rolling remain inside that transaction.

VERDICT: REVISE
### Response
All seven accepted (Draft 2).

## Round 2 — Codex
Draft 2 addresses the seven round 1 findings, but introduces three remaining problems:

1. **A metatype change can trap an allergy error.** Set an allergy on an elf, then change the character to human. Validation reports the retained allergy, but the client hides the only form that can clear it ([plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2d.md:72)). **Fix:** Keep a Clear allergy control visible for humans, or clear the allergy when changing to human.

2. **Finishing disables an existing print choice.** After finishing, `setCard` would be refused under Draft 2’s “every other op” rule, although it currently edits only the table card and is allowed on finished characters ([plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2d.md:96), [reducer](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:99)). **Fix:** Keep `setCard` as a metadata edit that returns before rebuilding items.

3. **Followers can pass validation with nonexistent archetypes.** Five distinct strings such as `["A", "B", "C", "D", "E"]` satisfy every stated check, yet do not identify the five Archetypes required for followers ([plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2d.md:27), [rules summary](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/RULES-CHARGEN.md:64)). **Fix:** Validate each selection against supported core archetypes, with an explicit path for GM-approved custom archetypes.

VERDICT: REVISE
### Response
#1, #2 accepted (Draft 3). #3 declined as a hard check: p.44 lets the player choose any five archetypes and p.43 allows GM-approved ones; the app suggests core names and checks five, non-blank, different.

## Round 3 — Codex
Draft 3 resolves the finished-character `setCard` case. Its follower approach is a stated GM approval choice. One allergy case remains:

- **Failing case:** On a human character, an API `setAllergy` request can store a nonempty allergy. Validation then blocks Finish, while the human UI hides the form needed to clear it. The `setMetatype` transition in [Draft 3](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2d.md:114) never runs.
- **Fix:** Refuse nonempty `setAllergy` values when the current metatype is human; allow an all-empty request to clear existing data.

VERDICT: REVISE
### Response
Accepted and folded into Draft 3 (setAllergy refuses non-empty values on a human). Plan complete.
