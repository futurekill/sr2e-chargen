# Code Review Log: changing a user's role
2026-11-27. Codex gpt-6-sol medium.

## Round 1
- **UI role state stays stale after a change** ([Admin.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Admin.svelte:15), [App.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/App.svelte:12)). If an admin demotes themself, the PUT succeeds, but the following admin-list reload gets 403. The page still shows the old role and admin controls. A logged-in runner who is promoted likewise sees no Admin link until a refresh. **Fix:** refresh the app’s session state after a role change and leave the Admin page if the current user was demoted.

The 19 relevant tests pass. I found no server-side last-admin, session-role, or CSRF bypass in this change.

VERDICT: REVISE
Fixed: the Admin page refreshes the session and goes to the Library when the admin demotes themself. Accepted as is: a user promoted on another device sees the Admin link after a reload (the server allows them at once).

## Round 2
VERDICT: APPROVED