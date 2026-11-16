# Code Review Log: M3a
Codex gpt-6-sol; round 1 high effort, later rounds fix-only at medium; a fresh session per round.

## Round 1 — the server (REVISE, 10 findings)
## Findings, ordered by severity

1. **Critical — an old password can create a session after a reset.** [server/auth/accounts.mjs:133](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/auth/accounts.mjs:133) reads the user and verifies the password before its transaction. If a reset commits during verification, login can then create a fresh session using the old password, undoing the reset’s session revocation. **Fix:** In the login transaction, lock and recheck the user’s password hash, disabled state, and lockout before creating the session.

2. **Critical — an in-flight password change can overwrite a reset.** [server/auth/accounts.mjs:161](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/auth/accounts.mjs:161) verifies the current password outside the write transaction. A reset can commit before line 169, after which the change replaces the new password using credentials that are no longer current. **Fix:** Make the update conditional on the verified hash still being current, and refuse it if the account was disabled.

3. **High — revoking a session does not stop a request already past authentication.** [server/app.mjs:53](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/app.mjs:53) checks session and role before the route’s write transaction. An admin reset-link request can pass that check, then have its admin disabled and sessions deleted, yet still issue a reset link through [server/auth/accounts.mjs:107](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/auth/accounts.mjs:107). **Fix:** Revalidate the session and required role inside the transaction that performs each protected write.

4. **High — migrations have no cross-process lock.** [server/db/index.mjs:37](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/db/index.mjs:37) calls Kysely’s SQLite migrator without the plan’s `BEGIN IMMEDIATE` migration lock; its SQLite adapter runs migrations outside a transaction. Two processes starting on a fresh database can both observe a missing `settings` row at [server/db/migrations/001-initial.mjs:87](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/db/migrations/001-initial.mjs:87), then one fails its insert and startup. **Fix:** Acquire a database-wide migration lock before rereading migration state and running steps.

5. **High — the migration will fail on MySQL when that dialect is added.** [server/db/migrations/001-initial.mjs:84](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/db/migrations/001-initial.mjs:84) asks Kysely to emit `CREATE INDEX IF NOT EXISTS`; Kysely’s MySQL compiler emits that text, while [MySQL’s `CREATE INDEX` syntax](https://dev.mysql.com/doc/refman/8.4/en/create-index.html) has no `IF NOT EXISTS`. A fresh MySQL migration stops at the first index. **Fix:** Check for each index before issuing a plain `CREATE INDEX` on MySQL.

6. **High — setup redemption and bootstrap take locks in opposite orders on Postgres/MySQL.** [server/auth/accounts.mjs:54](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/auth/accounts.mjs:54) locks `admin_gen` before updating setup tokens; [server/auth/accounts.mjs:86](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/auth/accounts.mjs:86) consumes a setup token before updating `admin_gen`. Concurrent bootstrap and redemption can deadlock, returning a server error to one caller. **Fix:** Acquire these locks in the same order in both operations.

7. **Medium — delete and restore create gaps in revision history.** [server/library.mjs:107](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:107) and [server/library.mjs:113](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:113) increment `documents.revision` without appending a revision row. Confirmed: create → delete → restore leaves document revision 3 with only revision 1 in history; requesting revision 2 returns 404. **Fix:** Append the body for each mutation that advances the revision, and charge its retained bytes.

8. **Medium — the first unknown-user login is measurably slower.** [server/auth/passwords.mjs:63](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/auth/passwords.mjs:63) generates the dummy hash on first use. That unknown-user attempt performs a hash *and* a verification, while a known-user attempt performs one verification, defeating the plan’s timing protection at startup. **Fix:** Generate the dummy hash before accepting login requests.

9. **Low — mutation queries evade both validation and the specified idempotency fingerprint.** [server/library.mjs:54](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/library.mjs:54) omits the query, and mutation routes such as [server/routes/documents.mjs:18](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:18) have no query schema. Reusing a key for `POST /api/documents?x=1` and `?x=2` returns the prior 200 response instead of the plan’s 422 for a different request. **Fix:** Reject unknown mutation query parameters and include the accepted query in the fingerprint.

10. **Low — two security tests pass without exercising their stated condition.** [test/library.test.mjs:119](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/library.test.mjs:119) accepts 401 for the prototype-key probe, so authentication can reject it before JSON validation runs. [test/accounts.test.mjs:23](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/accounts.test.mjs:23) calls the “racing” bootstraps sequentially and manually revives a token, so it never tests concurrent lock behavior. **Fix:** Send the JSON probe with a valid session and key, and run the bootstrap/redemption race through separate database connections.

`node --test test/` passed 47 tests; two CLI tests could not create temporary databases because this read-only sandbox returned `EPERM`.

VERDICT: REVISE

### Claude's response
All 10 fixed.
- #1 login locks the user and re-checks hash, disabled and lock inside its transaction. #2 the password update is conditional on the verified hash and a live account.
- #3 `writeTx` re-checks the acting session (and the route's role) under a row lock; routes pass a request context.
- #4 our own migration runner, the whole run in one write transaction (Kysely's migrator takes no lock on SQLite and refuses a transaction). The concurrent-start test then found a second bug: the WAL switch answered "locked" before any busy timeout — now retried.
- #5 MySQL index creation checks first. #6 redemption takes the admin lock first, like bootstrap.
- #7 delete and restore append their revision rows. #8 the dummy hash is made at startup. #9 mutations take no query string.
- #10 the prototype probe runs signed in; the bootstrap "race" test renamed for what it tests (the true lock-order race needs Postgres/MySQL).

## Round 2 — fix-only (REVISE, 2 findings)
- `server/db/index.mjs:30` — **New regression:** the runner ignores the previous `kysely_migration` table. I reproduced a database marked `999-from-the-future` there being accepted and reported as current. **Fix:** read and honor the old migration history before creating or using `migrations`.
- `test/accounts.test.mjs:24` — **Round 1 #10 remains:** the bootstrap test still runs sequentially and manually revives a token, so a concurrent bootstrap regression would leave it green. **Fix:** run the bootstrap and redemption race through separate database connections.

VERDICT: REVISE

### Claude's response
- `kysely_migration`: **rejected.** No database with that table exists outside this machine's test files: nothing has been released or deployed (M3a is a development build), so there is no old history to honour, and reading a table that never shipped would be dead code.
- The bootstrap race: **accepted in the form SQLite allows.** Two connections in one process can't race on SQLite (the busy wait blocks the event loop), so the test now runs three `chargen admin bootstrap` PROCESSES at once and redeems all three links: exactly one admin. The bootstrap-vs-redemption lock order across connections is tested when Postgres/MySQL land.
