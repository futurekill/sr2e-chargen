# Code review log: portraits (uploads and premade)
Codex gpt-6-sol, read-only. Reviewed 6ecac4f and 322eab6.

## Round 1 — Codex (high)
1. **Upload retries break idempotency** — [server/routes/documents.mjs:96](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:96). Replay a successful PUT with the same key, revision, and bytes: `portraitTarget` returns 409 before `setPortrait` can return the stored answer. **Fix:** Check the idempotency record before the revision preflight, then process only new requests.

2. **An upload can race with character edits** — [client/src/pages/Character.svelte:148](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:148). Start an upload, then rename the character while it is processing: the operation queue and upload can both write from the same revision, so one gets a stale error and the edit may be dropped during recovery. **Fix:** Put portrait mutations on the same queue as character operations.

3. **Replacement can fail despite enough net quota** — [server/library.mjs:246](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:246). A user at the byte limit with five portraits cannot replace the oldest with an equal-sized image: the new image is charged before the old one is evicted. **Fix:** Evict within the transaction before checking the net byte charge.

4. **A sheet can mix two revisions** — [server/routes/documents.mjs:53](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:53). If an upload commits between `getDocument` and `getPortrait`, the PDF renders the old character body with the new portrait. **Fix:** Resolve the portrait from the same revision as the fetched document.

VERDICT: REVISE
### Response
All four accepted and fixed.

## Round 2 — Codex (medium, fix-only)
1. **Upload retry — [server/routes/documents.mjs:98](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:98).** Failing case: two requests with the same key overlap; the second sees no completed replay, then reaches the revision check just after the first commits and gets 409 instead of the stored answer. **Fix:** Resolve the key through the transactional idempotency path before rejecting a stale revision.

2. **Page operation queue — [client/src/pages/Character.svelte:136](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:136).** Failing case: none found; upload, stock selection, and removal now read the revision when their queued turn begins. **Fix:** None needed.

3. **Eviction and quota — [server/library.mjs:266](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:266).** Failing case: an account exactly at its byte limit has five portraits; replacing the oldest with an equal-size image frees enough asset space, but charging the new revision still rejects the upload. **Fix:** Include the revision’s net byte cost in the replacement capacity check.

4. **Sheet revision — [server/routes/documents.mjs:53](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:53).** Failing case: enough edits prune the fetched revision between `getDocument` and `getPortrait`; sheet generation returns 404 despite already having its body. **Fix:** Load the portrait referenced by the body already fetched for the sheet.

VERDICT: REVISE
### Response
#1 accepted: a stale revision re-checks the key for a stored answer. #4 accepted: the sheet reads the portrait from the body it already fetched. #3 declined: a completely full account can't store the new revision itself — the same rule as for every write; the portrait's own bytes are freed before the new one is charged. Not re-reviewed.
