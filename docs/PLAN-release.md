# Plan: release readiness (roadmap milestone 6)
_Draft 1 (2026-11-18). The gates docs/PLAN.md sets before the group is invited: backups with a restore test, the image
scanned (Trivy, fails on High/Critical), an SBOM, the image signed (cosign keyless via GitHub OIDC), a weekly rebuild.
The repository is PRIVATE; the image goes to a private registry only (PLAN.md "Distribution": never a public push)._

## 1. Backups — logical, by the app (a change from PLAN.md, with the reason)
PLAN.md named `VACUUM INTO` / `pg_dump` / `mysqldump`. The image is distroless (no shell, no client tools), so the
database tools aren't there, and a dialect-specific dump can't be restored into another dialect. Instead the app writes
a **logical backup** itself, the same for all four databases:
- `chargen backup create` (CLI) and a **nightly run inside the server** when `BACKUP_DIR` is set (a timer, the same
  pattern as the daily purge; `BACKUP_KEEP` newest kept, default 7). Writes `BACKUP_DIR/chargen-<UTC timestamp>/`:
  - `tables/<table>.jsonl` — every row of every table in primary-key order, one JSON object per line; binary columns
    as base64; numbers as numbers;
  - `manifest.json` — app version, schema migrations applied, per table the row count and a SHA-256 of its canonical
    rows, and per asset its `id`, `bytes`, `sha256`; written LAST, so a directory without it is incomplete.
- **Consistency**: all tables read inside ONE read transaction at a snapshot — Postgres `REPEATABLE READ`,
  MySQL/MariaDB `START TRANSACTION WITH CONSISTENT SNAPSHOT`, SQLite a read transaction (WAL gives it a stable view).
  Writers are not stopped.
- **Where**: `BACKUP_DIR` must be a different volume or host path from `/data` (OPERATIONS.md; the server warns at start
  when it is inside `/data`). Written to a temp name and renamed when complete.
- **Secrets**: a backup holds password hashes and session/token hashes (never secrets in clear, as in the database).
  OPERATIONS.md says to protect it like the database. Sessions are NOT restored (everyone signs in again).
- `chargen backup verify <dir>` — restores into a scratch in-memory SQLite (fresh migrations), recomputes every table's
  checksum and every asset's SHA-256, and compares with the manifest; exit code 0 only when all match.
- `chargen backup restore <dir>` — into an EMPTY database only (refuses otherwise), the app in maintenance mode, the
  schema version must match (else refuse and say which build to use); then verifies like `verify`. This is also the
  cross-database move (PLAN.md's `db copy`): back up from SQLite, restore into Postgres.
- **CI restore test**: on each of the four databases, a seeded instance (users, characters with revisions, a portrait,
  idempotency rows) is backed up, restored into a fresh database of EVERY other kind, and the per-table checksums and
  asset hashes compared (covers PLAN-portrait.md's copy/restore requirement).

## 2. The image gates (a release workflow)
`.github/workflows/release.yml`, run on a version tag (`v*`) only:
1. Build the image (the same Dockerfile; `--provenance` and SBOM attestations on).
2. **Trivy** scan of the built image (OS packages and npm libraries), failing on HIGH/CRITICAL with a fix available;
   accepted findings live in `.trivyignore` with a reason and an expiry (like osv-scanner.toml).
3. **SBOM** (SPDX JSON, by Trivy) attached to the GitHub release as an asset.
4. Push to **GHCR as a private package** (`ghcr.io/futurekill/sr2e-chargen:<version>` + digest) with the workflow's
   `GITHUB_TOKEN` (`packages: write` for this job only).
5. **Sign** the pushed digest with cosign keyless (GitHub OIDC, `id-token: write` for this job only) and attach the SBOM
   as an attestation; `docs/OPERATIONS.md` shows the `cosign verify` command with the expected identity.
- **Weekly**: a scheduled workflow rebuilds the image from the pinned base digests and runs the Trivy gate (no push);
  Renovate already bumps base-image digests, so a base patch arrives as a pull request and the release rebuilds it.
- Every action pinned to a commit SHA, `permissions:` per job (CI rule).

## 3. Operations
OPERATIONS.md gains: the backup variables and schedule, verify and restore, a restore drill, pulling and verifying the
signed image, and the first-release checklist (compose, BASE_URL, TRUST_PROXY, mem_limit, BACKUP_DIR, admin
bootstrap).

## Out of scope
Publishing anywhere public; off-site backup copy (the operator's job, documented); key-based signing.

## Tests
Backup/restore round trips on all four databases (CI matrix) and cross-dialect; verify detecting a changed byte, a
missing row, a missing manifest; restore refusing a non-empty database and a different schema version; the nightly
timer keeping N; the release workflow validated by `actionlint` in CI (it only runs on a tag).
