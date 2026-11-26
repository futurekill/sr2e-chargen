# Code review log: the Garage (docs/PLAN-garage.md)
_2026-11-26. Codex gpt-6-sol: r1 high, r2 medium (fix-only)._

## Round 1 — Codex
The changes need revision. I found these concrete failures:

- **Restricted vehicle can be bought.** [shared/creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:369): a Federated-Boeing Eagle has a 0¥ list price, but mounting an 8,000¥ HMG makes `g.price > 0`, so `buyGarageVehicle` accepts it. **Fix:** Require a positive base vehicle list price as well as a valid total.

- **The Vehicle page cannot offer weapons or cargo.** [Vehicle.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Vehicle.svelte:25): `/api/catalog/entries` returns summaries without `system`; `priced(e)` is therefore false for every result, leaving both selectors empty. **Fix:** Fetch full entries by ID before filtering and displaying their costs.

- **An archive or delete can race a purchase or link.** [server/library.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:134): `garageOf` reads the live vehicle without locking its row; a concurrent archive can commit after that read and before the character write commits. **Fix:** Lock each target vehicle row during the operation transaction and check its live state under that lock.

- **Unavailable links vanish from the sheet and stat block.** [server/library.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:143): deleting or archiving a linked vehicle filters it out entirely, although the plan requires a “vehicle unavailable” entry without its contents. **Fix:** Return a placeholder for each unresolved link and render it in the vehicle rows.

- **Deleting an edited vehicle fails from its page.** [Document.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Document.svelte:45): Vehicle updates its own revision, while the parent’s `doc.document.revision` stays at the opening value; Delete then sends a stale revision and gets 409. **Fix:** Pass the child’s current revision to the delete handler or refresh the parent document after operations.

- **Garage vehicles beyond the first 100 are unreachable from a character.** [Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:97): accounts may hold 200 documents, but the panel reads one 100-document page; a live link outside it is also mislabeled unavailable. **Fix:** Page through the library results and resolve existing link IDs independently.

- **Restoring a revision reuses an embedded item ID.** [shared/vehicle.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/vehicle.mjs:68): add item `gv…1`, restore the initial vehicle revision, then add another item; both historical additions receive `gv…1`. **Fix:** Preserve a monotonically increasing item counter when restoring vehicle revisions.

- **A renamed vehicle exports its old token name.** [shared/vehicle.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/vehicle.mjs:128): renaming “Harley Scorpion” to “Red” changes the actor name, but `prototypeToken.name` still exports as “Harley Scorpion.” **Fix:** Update the prototype token name when building the vehicle actor.

- **The vehicle page loses purchase context after an edit.** [server/library.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:202): GET supplies `usedBy`, but an ops response does not, so the displayed users disappear after the first edit; it also never supplies the purchased revision required by the plan. **Fix:** Include purchase/link details and purchase revision in vehicle operation responses.

VERDICT: REVISE

### Claude's response
Fixed #1 (the vehicle's own list price must be positive), #2 (catalog summaries carry `weaponType`; the page uses the
summary's cost and type), #4 (a gone link prints as "Vehicle unavailable"), #5 (the vehicle page deletes with its own
revision), #6 (the garage panel pages through the library), #8 (the token name follows a rename), #9 (op answers keep
`usedBy`, with the revision a character bought).
Rejected #3: a purchase is a snapshot the character owns and a link is re-resolved on every read, so an archive racing
a purchase or a link leaves nothing unsafe. Rejected #7: item ids are unique within the vehicle at all times (what
Foundry needs); a revision restore is an explicit rollback, so an id may be reused after one (the plan's "kept
forever" corrected).

## Round 2 — Codex
VERDICT: APPROVED
