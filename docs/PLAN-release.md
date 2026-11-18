# Plan: release readiness (roadmap milestone 6)
_Draft 2 (2026-11-18), after Codex plan round 1 (16 findings; its simpler path adopted — docs/PLAN-release-REVIEW-LOG.md).
The gates docs/PLAN.md sets before the group is invited: backups with a restore test, the image scanned (Trivy,
fails on High/Critical), an SBOM, the image signed (cosign keyless via GitHub OIDC), a weekly rebuild. The repository
is PRIVATE; the image goes to a private registry only (PLAN.md "Distribution": never a public push)._

## 1. Backups — the database's own tools (as PLAN.md approved), one set by construction
Portraits are rows (`assets`), so a database backup IS the "database AND assets" set PLAN.md requires.
- **SQLite (the default deployment)**: the server takes the backup itself with `VACUUM INTO '<file>'` — SQLite's own
  consistent snapshot, plain SQL, no tool in the image. Run on a SEPARATE read connection (not the app's write
  transaction path, which uses `BEGIN IMMEDIATE`), so writers are not blocked; nothing is held in Node memory.
  - `chargen backup create` (CLI) and, when `BACKUP_DIR` is set, a nightly run.
  - Written as `BACKUP_DIR/.chargen-<UTC timestamp>-<random>.db.partial`, then `fsync`ed, renamed to
    `chargen-<timestamp>-<random>.db`, the directory `fsync`ed; a failure deletes the partial and keeps every older
    backup. Retention (`BACKUP_KEEP`, default 7) deletes old ones only AFTER the new one has verified.
  - **Verify** (run after every backup, and `chargen backup verify <file>`): open the copy read-only, `PRAGMA
    integrity_check` = ok, the `migrations` list equals this build's, every asset's SHA-256 recomputed from its bytes
    equals its stored `sha256`, and the users' `doc_count`/`bytes_used` recomputed from documents, revisions and
    assets equal the stored counters (a mismatch is reported, not "fixed").
  - **Restore** = stop the server, replace `/data/chargen.db` with the backup file, start (OPERATIONS.md step by step;
    sessions in the copy are deleted at the next start by `chargen backup restore <file>`, which copies the file into
    place, deletes all sessions and every unused invite/setup/reset token, and then verifies).
  - **One owner**: the nightly run claims the day with a conditional UPDATE of a `settings` row (`backup.last` from
    yesterday to today), so of several server processes exactly one runs it; a run in progress is never started twice
    in one process.
- **Postgres / MySQL / MariaDB**: their native dump tools, run OUTSIDE the app image — OPERATIONS.md gives a sidecar
  compose service (the official database image running `pg_dump -Fc` / `mysqldump --single-transaction` on a schedule
  into the backup volume) and the restore commands. `chargen backup verify --database-url <restored-db>` runs the same
  checks (assets, counters, migrations) against a restored database.
- **Where and how protected** (r1 #10): `BACKUP_DIR` is its own volume, not under `/data`; the server refuses to start
  the nightly run if `BACKUP_DIR` is inside `/data`. Files are written mode 0600. A backup contains password hashes
  and every private library: OPERATIONS.md says to keep it on storage only the operator can read, and to encrypt any
  off-site copy (e.g. `age`), which is outside the app.
- **Cross-database move** stays PLAN.md's `chargen db copy` (maintenance mode, per-table checksums) — a later item, not
  part of this release.

**CI tests**: SQLite backup during concurrent writes (writers not blocked, the copy consistent), verify catching a
changed asset byte, a wrong counter and a missing migration; restore deleting sessions and unused tokens; the
nightly claim with two processes (one runs); retention keeping N and never deleting before verify; a disk-full
simulation (a failing write) leaving older backups intact. Postgres/MySQL: `backup verify --database-url` on the CI
databases after a seeded run.

## 2. The image gates — a release workflow (r1 #13–#15)
`.github/workflows/release.yml`, on a pushed `v*` tag:
1. **Prove the commit**: the tagged commit must be on `main` (`git merge-base --is-ancestor`); the workflow then runs
   the whole CI (`ci.yml` made `workflow_call`-able) as its first job; publishing `needs` it.
2. Build the image (same Dockerfile).
3. **Trivy**: fail on ANY High or Critical finding (OS packages and npm), fixed or not; exceptions only in
   `.trivyignore.yaml` (Trivy's YAML format) with an id, a reason and an expiry.
4. **SBOM** (SPDX JSON) uploaded to the GitHub release (`contents: write`, that job only).
5. **Push** to `ghcr.io/futurekill/sr2e-chargen:<version>` (`packages: write`, that job only); then the job reads the
   package's visibility through the API and FAILS if it is not `private`.
6. **Sign** the pushed digest with cosign keyless (`id-token: write`, that job only) and attest the SBOM to it; the job
   then runs `cosign verify` against the digest with the exact identity
   (`https://github.com/futurekill/sr2e-chargen/.github/workflows/release.yml@refs/tags/<tag>`, issuer
   `https://token.actions.githubusercontent.com`), and OPERATIONS.md gives the same command for the operator.
- **Weekly**: a scheduled job builds the image and runs the Trivy gate (no push).
- Every action pinned to a commit SHA; `permissions: {}` at the top, granted per job.
- **Repository settings the OWNER sets** (I don't change settings): a tag ruleset restricting who can create or move
  `v*` tags; documented in OPERATIONS.md's release checklist.
- `actionlint` runs in CI on every workflow file.

## 3. Operations
OPERATIONS.md: backup variables, the nightly run, verify/restore, the database sidecars, a restore drill, pulling and
verifying the signed image, and the first-release checklist (compose, BASE_URL, TRUST_PROXY, mem_limit, BACKUP_DIR
volume, admin bootstrap, the tag ruleset).

## Out of scope
Public publishing; off-site copies (the operator's); key-based signing; `db copy`.
