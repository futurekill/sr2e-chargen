# Code review log: M4a (Karma after creation)
Codex gpt-6-sol, read-only. System release/0.161.0 (7907ad57, cb5004ee, then the round-2 fixes); app chargen/on-0.161 (local).

## Round 1 — Codex (high)
The table costs and the `karmaAward` split match the plan. The app’s four Karma tests pass. I found these revision blockers:

- **Award macro never reaches the write.** `7907ad57:macros/award-karma.js:30,74` — `DialogV2.wait()` returns the action string, while the macro expects the callback’s `{ amount, selected }`; choosing Award exits at `!result.selected`. **Fix:** capture the form data in a variable and check the returned action, as the advancement dialog does.
- **A vetoed Karma write can delete a skill permanently.** `7907ad57:module/karma-advance.mjs:60–67` — reverting a learned skill deletes it before `actor.update`; if that update is vetoed, the rollback list cannot restore the item. **Fix:** save the item source and recreate it on failure, checking the restoration result.
- **A changed learned skill can be undone and deleted.** `7907ad57:module/rules/sr2e-rules.mjs:4949` — learn Car at 1, change it to 4 outside the ledger, then undo Learn: the transition accepts the undo and removes the rating 4 skill for a 1 Karma refund. **Fix:** compare the created item’s current relevant fields with the recorded source before allowing the revert.
- **Foundry cannot learn a new skill through the dialog.** `7907ad57:module/sheets/sheet-actions.mjs:4639–4663` — the dialog offers raises and named tiers, but no skill compendium picker or `{ newSkill: source }` action required by Draft 3. **Fix:** add the compendium-backed new-skill choice and pass its item source to `karmaTransition`.
- **Rollback failures are reported as clean refusals.** `7907ad57:module/karma-advance.mjs:67–70` — if the first item update succeeds, the Karma update is vetoed, and a hook vetoes the restoring item update, the function returns `false` with the raise still applied. **Fix:** check every compensation write and surface an incomplete rollback for repair.
- **Award limit exceeds the approved range.** [server/routes/documents.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:35), `7907ad57:module/rules/sr2e-rules.mjs:4877`, and [Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:242) — an award of 500 is accepted, though the plan specifies 1–200. **Fix:** enforce 200 in the schema, transition, and form.
- **Required paths lack tests.** [test/karma.test.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/karma.test.mjs:60) does not test idempotent award replay; `7907ad57:module/quench/sr2e-quench.mjs:959–979` calls the transition directly rather than exercising the dialog and does not cover deletion rollback. **Fix:** add those integration cases, including vetoed writes and changed-item undo.

VERDICT: REVISE
### Response
All seven fixed: the macro captures its dialog data; applyKarmaRecord writes the Karma before any removal and checks every rollback write, reporting an incomplete one for repair; a learned skill changed since can't be undone; the dialog learns a new skill from the compendium; awards 1-200 everywhere; tests for the replay (app), the vetoed undo and the dialog path (Quench).

## Round 2 — Codex (medium, fix-only)
- [sr2e-rules.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:4952) (cb5004ee): Rename a learned skill or change its category while leaving its rating at 1; undo still deletes the edited skill. Compare the learned item’s name and category as well as its ratings before allowing removal.
- [karma-advance.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/karma-advance.mjs:67) (cb5004ee): If the skill disappears after a revert record is calculated, the missing target is treated as a successful removal and Karma is refunded. Treat a missing removal target as a failed write and roll back the Karma update.
- [award-karma.js](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/macros/award-karma.js:60) (cb5004ee): Entering `200.9` passes the new limit check and awards 200, silently changing the requested amount. Parse the full value with `Number` and require an integer from 1 to 200.

The app replay test passes. These cases leave the system fixes incomplete.

VERDICT: REVISE
### Response
All three fixed (name and category compared; a missing removal target is a failure; the macro refuses non-integers). Stopped here.
