# Code review log: release readiness (backups, image gates)
Codex gpt-6-sol, read-only. Reviewed 44b17da (round 1) and ac1b647 (round 2).

## Round 1 — Codex (high)
## Findings

1. **Nightly backups fail with the example deployment.** [docker/compose.example.yml:17](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docker/compose.example.yml:17): A fresh `/backups` volume has no writable directory prepared for the image’s `nonroot` user, so `mkdirSync` or `VACUUM INTO` fails. **Fix:** Create `/backups` with ownership for `nonroot` in the image, or provision that ownership on the volume.

2. **The private-package check cannot verify the intended package.** [.github/workflows/release.yml:69](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/.github/workflows/release.yml:69): GitHub documents `/users/{username}/packages/...` as a [public-package metadata endpoint](https://docs.github.com/en/rest/packages/packages#get-a-package-for-a-user). An existing private package can be treated as “none” before push; the same lookup can fail after push, leaving an unsigned image without a release. **Fix:** Use a token and endpoint that can read this owner’s private package, and treat only a confirmed 404 as absence.

3. **Restore can replace a database while the server is running.** [server/backup/restore.mjs:28](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/backup/restore.mjs:28): Running `backup restore` against an active SQLite server deletes its live `-wal` and `-shm` files before replacing the database; the startup staging guard does not stop an already running server. **Fix:** Require an exclusive offline lock or otherwise prove the server has stopped before touching those files.

4. **A failed staging copy can prevent the server from starting.** [server/backup/restore.mjs:16](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/backup/restore.mjs:16): If `copyFileSync` runs out of space, it can leave `.restore-staging`; the copy and `chmodSync` sit outside the cleanup `try`, and the start guard then refuses startup. **Fix:** Put staging creation and permission changes inside a cleanup scope that removes an incomplete staging file.

5. **Interrupted backup jobs leave partial files.** [server/backup/job.mjs:29](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/backup/job.mjs:29): An `fsync` or verification exception leaves `.partial`; a timeout kills the child without cleanup, and `prune` does not implement its stated partial-file cleanup. **Fix:** Remove the partial in a job-wide `finally` and reap abandoned partials safely on a later run.

6. **Verification can approve broken references.** [server/backup/checks.mjs:14](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/backup/checks.mjs:14): An orphaned document or asset can pass the current counter and checksum checks; SQLite explicitly says [`integrity_check` does not check foreign keys](https://www.sqlite.org/pragma.html#pragma_integrity_check). **Fix:** Fail verification when `PRAGMA foreign_key_check` returns rows.

7. **Verification loads every portrait into memory at once.** [server/backup/checks.mjs:20](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/backup/checks.mjs:20): A database with assets exceeding the compose container’s 1 GB limit can kill the verification child, so otherwise valid nightly backups never publish. **Fix:** Iterate asset rows and hash one blob at a time.

8. **The nightly lease can admit a second backup after a successful one.** [server/backup/index.mjs:61](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/backup/index.mjs:61): Process B can read an old `last_ok`, pause, then acquire the lease just after process A records success and releases it; B runs another backup despite the fresh result. **Fix:** Recheck `last_ok` after acquiring the lease, before starting the job.

9. **A first backup delays server startup.** [server/main.mjs:39](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/main.mjs:39): On a fresh deployment, `await sweep()` awaits the backup before `app.listen`; a large backup can keep the service unavailable for the job’s 30-minute timeout. **Fix:** Start listening before scheduling the backup sweep.

10. **Retention can race a manual backup.** [server/backup/index.mjs:73](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/backup/index.mjs:73): If `backup create` is still verifying when nightly `prune` runs, its partial is invisible; it can publish afterward and leave `BACKUP_KEEP + 1` complete files. **Fix:** Coordinate creation and pruning under one backup-directory lock, then prune after the last publish.

11. **The attestation comparison selects an arbitrary first result.** [.github/workflows/release.yml:91](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/.github/workflows/release.yml:91): Re-running a tag can leave multiple valid SPDX attestations on the same digest; `head -1` may select an older SBOM and reject the new matching one. **Fix:** Examine all verified predicates and require one whose canonical digest matches the uploaded SBOM.

12. **CHANGELOG extraction can include the wrong release.** [.github/workflows/release.yml:98](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/.github/workflows/release.yml:98): For tag `v1.2.3`, the unescaped dots also match heading `## 1x2y3`; a read-only reproduction printed both sections. **Fix:** Compare the heading’s literal version field instead of building a regex from the tag.

13. **The concurrency test does not prove its claim.** [test/backup.test.mjs:46](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/backup.test.mjs:46): `Promise.all` passes even if the writer waits for the entire backup, and it never checks which writes the snapshot contains. **Fix:** Control an overlapping write, assert it completes promptly, and check the copy represents one consistent state.

Review was read-only; I did not run the file-writing test suite.

VERDICT: REVISE
### Response
Fixed 1–9 and 11–13 (see commit ac1b647). Declined 10: a manual backup racing a prune leaves one extra file until the next night; harmless.

## Round 2 — Codex (medium, fix-only)
- [.github/workflows/release.yml:71](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/.github/workflows/release.yml:71): If GHCR times out, `curl` returns HTTP `000` and the workflow proceeds with the push; the check after the push has the same failure mode. **Fix:** Proceed only on an expected anonymous denial; fail on transport errors and other responses.
- [server/main.mjs:45](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/main.mjs:45): With two servers sharing the database, stopping one clears the shared heartbeat while the other is still running, so restore can replace its live database. **Fix:** Give each server its own heartbeat and refuse restore while any heartbeat is fresh.
- [test/backup.test.mjs:54](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/backup.test.mjs:54): On a fast runner, the backup can finish during the fixed 150 ms sleep; the test then fails even though concurrent writes work. **Fix:** Synchronize the write with an active backup phase instead of using a timed delay.

VERDICT: REVISE
### Response
All three fixed: the visibility checks pass only on an anonymous denial (401/403/404) and fail on 000 or any other answer; each server writes its own heartbeat row (`server.alive.<id>`) and restore refuses while any row is fresh (sanitize removes them); the concurrency test writes once the backup's partial file exists. Also: actionlint's two shellcheck notes in ci.yml fixed. Stopped here (fix-only rounds; the remaining changes are small and tested).
