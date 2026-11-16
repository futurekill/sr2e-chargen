# Plan Review Log: M3 — the creator skeleton
Started 2026-11-16. Codex gpt-6-sol, high effort, a fresh session per round. Round 5 is a check-in with the user.

## Round 1 — Codex (REVISE, 20 findings)
1. **M3a is presented as a runnable release without required release gates.** [PLAN-M3](</Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M3.md:13>) defers image scanning, SBOM, signing, backups, and the catalog to M3b, while the [approved M3 milestone and security gates](</Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN.md:376>) require them for the shipped image. **Fix:** Treat M3a as an unreleased development build, or move the required gates and content into its release.

2. **Import validation directly contradicts the parent plan.** Checking only three envelope properties and size accepts malformed graphs, references, and source data; the parent explicitly requires full schema validation of untrusted JSON import. **Fix:** Wait for the system’s portable schema before enabling import, then validate the entire bundle before storing it.

3. **Newer bundles can be edited when they must be view-only.** A numeric `schemaVersion` check permits versions and modules the creator does not understand, violating the parent’s D10 compatibility rule. **Fix:** Check envelope, system, Foundry, and module versions and block edits when any is unsupported.

4. **Token redemption checks an ID but not the bearer token.** The proposed conditional `UPDATE` predicates on `id`, expiry, and use state, never `token_hash` or `kind`; possession of an exposed token ID could redeem it. **Fix:** Look up by the hash of the supplied secret and atomically verify its kind, binding, expiry, and unused state.

5. **First-admin bootstrap has a race.** Two CLI processes can both observe “no admin exists” and issue setup links before either is redeemed. **Fix:** Reserve the single bootstrap entitlement with a database constraint and transaction, then consume it when creating the admin.

6. **The last admin can disable themselves and strand the installation.** Bootstrap only works while no admin *exists*, including a disabled one. **Fix:** Reject disabling the last enabled admin or provide an explicit local recovery command.

7. **Password change lacks a reauthentication rule.** The account page offers password change, but the plan never requires the current password; a stolen active session could replace the password and revoke the owner’s sessions. **Fix:** Require the current password for an ordinary password change.

8. **One-time links have no safe token transport specified.** Putting setup, invite, or reset secrets in a URL path or query exposes them to reverse-proxy access logs and browser history before the app’s `Referrer-Policy` applies. **Fix:** Put the secret in the URL fragment, submit it in a JSON body, and clear the fragment immediately.

9. **Per-IP throttling does not bound Argon2 memory use.** At 64 MiB per attempt, concurrent requests from different IPs can exhaust the container even when each stays below 10/min. Node’s built-in `argon2` is asynchronous and returns a raw key; it does not supply the proposed PHC storage format. [Node crypto documentation](https://nodejs.org/api/crypto.html). **Fix:** Add a small global hashing queue and explicitly implement and test PHC encoding and parameter parsing.

10. **“Uploaded JSON file” is not defined by the HTTP stack.** No multipart parser is listed, and Fastify’s route `bodyLimit` covers its default JSON parser; a separate upload path needs its own streaming limits. [Fastify route documentation](https://fastify.dev/docs/v5.12.x/Reference/Routes/). **Fix:** Have the client read the file and POST bounded JSON, or specify a bounded multipart parser.

11. **Idempotency is incomplete for create, delete, and restore.** Only `PUT` has a specified expected revision and key, while retries of create can duplicate documents and retries of restore can append revisions. Pruning revisions also deletes the only recorded keys. **Fix:** Require an idempotency key and appropriate precondition for every mutation, with durable key records independent of revision retention.

12. **Concurrent retries can return 409 instead of the first result.** Two requests with the same key can both pass the initial replay lookup; after one commits, the other fails the revision check. A reused key with different content is also silently treated as a replay. **Fix:** Store a request fingerprint and, after a conflict, re-read the key to return the original result only for an identical request.

13. **Quota checks need serialization across all three databases.** Counting documents or bytes before concurrent creates or writes lets both transactions pass; soft-deleted documents can also accumulate indefinitely if they stop counting toward quota. **Fix:** Enforce quotas under a per-user database lock or atomic counter, define deleted-document accounting, and purge after 30 days.

14. **The proposed `node:sqlite` adapter is more than a thin method wrapper.** Kysely expects a `reader` property and array-style parameter binding; Node statements expose `columns()` and variadic parameters. Its connection APIs are synchronous. [Kysely SQLite interface](https://raw.githubusercontent.com/kysely-org/kysely/master/src/dialect/sqlite/sqlite-dialect-config.ts), [Node SQLite documentation](https://nodejs.org/api/sqlite.html). **Fix:** Specify and test result detection, parameter spreading, statement cleanup, streaming, and transaction behavior in a dedicated adapter.

15. **Kysely’s SQLite migration “lock” does not coordinate the server and CLI.** Its SQLite adapter does nothing for locking because it assumes one reserved connection; the CLI is another process. [Kysely SQLite adapter](https://raw.githubusercontent.com/kysely-org/kysely/master/src/dialect/sqlite/sqlite-adapter.ts). **Fix:** Serialize startup and CLI migrations across processes with an explicit SQLite write lock or a single migration owner.

16. **Migration crash recovery differs by dialect.** MySQL/MariaDB DDL implicitly commits, so a failed multi-step migration may leave schema changes without a completed migration record; “schema builder only” does not make it atomic. [MySQL DDL transaction documentation](https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html). **Fix:** Make each migration restartable and test failure after each DDL step on MySQL/MariaDB.

17. **JSON and timestamp decoding are not dialect-neutral as written.** `pg` already parses `jsonb` into an object, so unconditional `JSON.parse` fails; millisecond timestamps overflow a PostgreSQL 32-bit `integer`, while 64-bit values need consistent driver conversion. [node-postgres type documentation](https://node-postgres.com/features/types). **Fix:** Define per-dialect JSON decoding, use 64-bit timestamp columns, and normalize values before copy checksums.

18. **Backups are incompatible with the stated runtime layout.** The approved plan requires a different backup volume and `pg_dump`/`mysqldump`, while M3 specifies only `/data` writable and a distroless final image without shell tools. [Distroless image documentation](https://github.com/GoogleContainerTools/distroless). **Fix:** Specify an external backup job or a separate tool container with a distinct backup mount and consistent asset snapshot.

19. **`db copy` lacks a mechanism that actually stops writes.** Saying it enters maintenance mode does not explain how web requests and direct admin CLI writes are fenced across processes during copy and checksum comparison. **Fix:** Use one database-backed maintenance flag enforced by every writer and wait for active writes to drain before copying.

20. **The catalog plan omits two explicit parent requirements.** M3b names a build and source tagging but does not require authenticated catalog routes or a build failure when book-derived text lacks its source tag. **Fix:** Specify authenticated routes and make source-tag completeness a catalog build gate.

VERDICT: REVISE

### Claude's response (draft 2)
All 20 accepted.
- #1 M3a is an unreleased development build; the first release is M3b with the parent's gates.
- #2, #3, #10 no real bundle is stored until the system's schema is vendored; M3a stores only the strict empty envelope; import = the client POSTs JSON, gated on the schema, with D10 view-only.
- #4 redemption keyed on the secret's hash and kind. #5, #6 `admin_gen` counter makes racing bootstraps yield one admin; the last enabled admin can't be disabled. #7 current password required. #8 secrets in the URL fragment.
- #9 global hashing queue; our own PHC codec with tests.
- #11, #12 an `idempotency` table with fingerprints, for every mutation, independent of revision pruning. #13 atomic per-user counters; deleted documents count until purged at 30 days.
- #14 a dedicated node:sqlite driver with its own tests. #15, #16 one migration owner via the database's lock; restartable migrations, tested on MySQL. #17 bigint timestamps and per-dialect JSON decoding.
- #18 backups as a separate tool service with its own mount. #19 a maintenance flag every writer checks in its transaction. #20 authenticated catalog routes; source-tag completeness fails the build.
