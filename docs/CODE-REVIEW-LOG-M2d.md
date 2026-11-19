# Code review log: M2d
Codex gpt-6-sol, read-only. Local branch chargen/on-0.161.

## Round 1 — Codex (high)
- **Finished characters can still change portraits** — [server/library.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:278): After Finish, a direct `POST /portrait/stock` with the current revision changes `creation.portrait`; upload and removal have the same gap. **Fix:** Reject portrait writes when `creation.finished` is set.

- **A failed server-only op does not cancel queued edits** — [Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:111): If Add gang returns `stale` while a later priority change is queued, `send()` reloads the other tab’s character and the queued change then saves against that unseen version. **Fix:** On `send()` failure, advance the queue epoch and drop pending optimistic edits, as `change()` does.

- **Rename is unavailable after Finish** — [Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:229): The input and button are disabled on a finished character, although Draft 2 explicitly permits `setName`. **Fix:** Keep the rename controls enabled after Finish.

- **Contact rows do not show their actual price** — [Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:127): A third ordinary contact displays “two free, then 5,000¥” instead of its 5,000¥ charge, contrary to the plan’s per-row price requirement. **Fix:** Derive each contact row’s charge from its position and kind under the budget rules.

- **The public schema lacks the specified per-op bounds** — [server/routes/documents.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:20): `addExtra` with a 61-character name or `kind: "enemy"` passes route validation and only fails in the reducer. Draft 2 requires those fields’ bounds and enum in the request schema. **Fix:** Define op-specific field schemas for `addExtra` and the other bounded operations.

VERDICT: REVISE
### Response
#2–#5 fixed. #1 declined: a portrait is presentation, like the name and notes that stay editable after finishing (PLAN-M2d Draft 2); nothing about the build changes with it.

## Round 2 — Codex (medium, fix-only)
- [Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:114): A queued `send()` still runs after an earlier `send()` fails because it never checks `epoch`. For example, queue two gang additions; if the first save fails, the second can still be saved even though the page says queued edits were dropped. **Fix:** Capture `epoch` when queuing `send()` and skip its request when the epoch has changed.

VERDICT: REVISE
### Response
Fixed as proposed: send() captures the epoch and skips when a failure before it dropped the queue. Stopped here.
