# Running sr2e-chargen
The operator's reference. The step-by-step guide is in the README: [Running the image](../README.md#running-the-image),
[Databases](../README.md#databases), [Backups and restore](../README.md#backups-and-restore).

## Start it
1. Get the image: the released one, `docker login ghcr.io` (a token with `read:packages`) then
   `docker pull ghcr.io/futurekill/sr2e-chargen:<tag>` (set `image:` in the compose file to it); or build your own
   from the repo root: `docker build -f docker/Dockerfile -t sr2e-chargen:dev .` The image builds its own catalog
   from `content/`, this project's copy of the content. Nothing else is needed.
2. Copy `docker/compose.example.yml` to `compose.yml` and set `BASE_URL` to the address people will type
   (https, exactly). Set `TRUST_PROXY` to your reverse proxy's address or network.
3. `docker compose up -d`
4. Make the first admin: `docker compose exec chargen /nodejs/bin/node server/cli.mjs admin bootstrap` — it prints a
   link that works once. Open it, pick a handle and password.
5. Point your reverse proxy (TLS) at `127.0.0.1:3000`. Allow request bodies of 8 MB (portrait uploads; nginx:
   `client_max_body_size 8m;`). Bind mounts must be owned by uid 65532 (the image's non-root user).

## Settings (environment variables only)
| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | required | The public address. Must be https (plain http only on localhost). The only accepted Origin. |
| `DATABASE_URL` | `sqlite:///data/chargen.db` | Also `postgres://…`, `mysql://…`, `mariadb://…` |
| `TRUST_PROXY` | none | Comma-separated addresses/CIDRs whose proxy headers are believed |
| `PORT`, `HOST` | `3000`, `0.0.0.0` | Where it listens inside the container |
| `LOG_LEVEL` | `info` | `warn` is quieter |

## The admin CLI
`docker compose exec chargen /nodejs/bin/node server/cli.mjs <command>` (there is no shell in the image):

| Command | Does |
|---|---|
| `admin bootstrap` | First admin's setup link — only while no enabled admin exists (also the way back in if every admin is lost) |
| `admin invite [--role admin]` | A one-time invite link (7 days) |
| `admin invites` / `admin revoke-invite <id>` | Open invites / kill one |
| `admin users` | Everyone, with role and state |
| `admin disable <user>` / `admin enable <user>` | Disabling ends that user's sessions; the last admin can't be disabled |
| `admin role <user> user\|admin` | Change a role (also on the Admin page); applies at once; the last admin can't lose it |
| `admin reset-link <user>` | A one-time password reset link (24 hours). There is no email: hand it over yourself |
| `db status` / `db migrate` | Migration state / run pending migrations (the server also migrates at start) |
| `maintenance on` / `off` / `status` | Stop every write (reads go on) / resume |

Links are shown ONCE and stored only as hashes: if one is lost, make another.

## The content and the catalog
- `content/` is this project's own copy of the content: the Foundry system and the sourcebook modules, the files the
  catalog reads, exactly as in their releases. `content-pins.json` lists each repository, its release tag, and the
  commit that tag points at.
- **Updates come by pull request.** Once a day, the Content sync workflow looks for new releases. When a book has
  one, it opens (or updates) one pull request named "Content: …" with the new copy and the new pins, and a table of
  the checks it ran. Review it and merge it.
  - GitHub holds the CI runs of that pull request for approval: approve them on the pull request, or merge.
  - If a check failed, the usual cause is a new text field in the content: add it to `tools/string-paths.json` on
    the `content-sync` branch.
  - The workflow needs the repository setting **Settings → Actions → General → "Allow GitHub Actions to create and
    approve pull requests"**. Without it, the workflow stops and says so.
  - Run it at any time: Actions → Content sync → Run workflow.
- **By hand** (with the content repositories checked out beside this one): `npm run content:sync` copies the pinned
  versions; `node tools/sync-content.mjs --latest` moves every pin to its newest release first. Commit `content/` and
  `content-pins.json` together.
- **Never edit `content/` by hand.** The catalog build refuses a changed, missing or extra file. CI also compares
  `content/` with the pinned commits on GitHub (`npm run content:verify`).
- `npm run build:catalog` builds `catalog/` for a local server (`catalog.json`, `vehicles.json` with the vehicles'
  complete sources, and `manifest.json` with each file's checksum). The server reads it at start; a production server
  does not start without a valid one.

## Day to day
- **Updating**: rebuild the image, `docker compose up -d`. Migrations run at start; an older build refuses to start
  against a newer database.
- **Before an update** (SQLite): `backup create`. Never copy `chargen.db` alone from a running server: the database
  runs in WAL mode, so `chargen.db-wal` holds recent writes; `backup create` takes a consistent copy.
- **Health**: `GET /healthz`; the container reports `healthy`.
- **Limits per user**: 200 documents, 500 MB, 50 revisions per document; deleted documents are purged after 30 days.

## Databases
SQLite is the default and the recommendation for a group: `sqlite:///data/chargen.db` (three slashes: an absolute
path, in the `/data` volume), WAL mode, foreign keys on. Keep `/data` on a LOCAL file system (never NFS/SMB) and on one
host; the built-in backups work only with SQLite. PostgreSQL (`postgres://…`) and MySQL/MariaDB (`mysql://…`,
`mariadb://…`) are supported and tested in CI (PostgreSQL 18, MySQL 9, MariaDB 12): create an empty database (MySQL:
`utf8mb4`) owned by the app's user, set `DATABASE_URL` and start; the app creates its tables. Copying an existing
SQLite library to another database (`db copy`) is not built yet: choose before your group starts. Details:
[the README's Databases section](../README.md#databases).

## Portraits and memory
Portraits are stored in the database (table `assets`), so a database backup holds them. Uploads are checked from
their header (JPEG, PNG or WebP only, at most 4096 × 4096) before the image library opens them, then re-encoded to WebP
with all metadata removed, in a separate process. The container's `mem_limit` (1 GB in the compose example) is the
memory bound for that work; keep it. The image supports linux-x64 only for now (sharp's prebuilt libvips).

## Backups (docs/PLAN-release.md)
**SQLite (the default).** Set `BACKUP_DIR` to its own volume (the compose example mounts `chargen-backups` at
`/backups`; better still, a bind mount on another disk). Every night one server process takes a backup with SQLite's
own `VACUUM INTO`, verifies it (integrity, schema, every portrait's checksum, every user's counters) and keeps the
newest `BACKUP_KEEP` (default 7); an old one is deleted only after a new one verified. Files are `chargen-<time>.db`,
readable by their owner only. A backup holds password hashes and everyone's private characters: keep it where only
you can read it, and encrypt any copy you take off the machine (for example with `age`).
- Now: `docker compose exec chargen /nodejs/bin/node server/cli.mjs backup create`
- Check a file: `… server/cli.mjs backup verify /backups/chargen-….db`
- **Restore** (the server must be STOPPED):
  1. `docker compose stop chargen`
  2. `docker compose run --rm chargen server/cli.mjs backup restore /backups/chargen-….db` — copies it beside the
     database, signs everyone out, cancels unused invite/setup/reset links, verifies, then swaps it in. A bad file
     changes nothing.
  3. `docker compose start chargen`
- **Drill**: restore last night's backup into a scratch copy of the compose project once a month.

**Postgres / MySQL / MariaDB.** Use the database's own dump tool in a sidecar container (the official database image)
on a schedule, writing `*.partial`, then `sync` and `mv` on success, never under the app's volume, for example:
`pg_dump -Fc -f /backups/chargen.dump.partial "$DATABASE_URL" && sync && mv /backups/chargen.dump.partial /backups/chargen-$(date +%F).dump`
(MySQL: `mysqldump --single-transaction --routines …`). Stop the sidecar while upgrading the app (upgrades migrate).
To restore: restore into the database with `pg_restore`/`mysql`, then BEFORE starting the app:
`server/cli.mjs backup sanitize --database-url <url>` and `server/cli.mjs backup verify --database-url <url>`.

## Releases and the signed image
A `v*` tag on `main` runs `.github/workflows/release.yml`: the whole CI, then the image is built, scanned (any High or
Critical fails; accepted findings in `.trivyignore.yaml` with a reason and an expiry), its SBOM made, pushed to
`ghcr.io/futurekill/sr2e-chargen` as a **private** package, signed (cosign keyless), and the GitHub release created
with the CHANGELOG section and the SBOM. A weekly job rebuilds and scans (no push); its failure means "cut a release".
Verify an image before running it:

    cosign verify ghcr.io/futurekill/sr2e-chargen@sha256:<digest> \
      --certificate-identity https://github.com/futurekill/sr2e-chargen/.github/workflows/release.yml@refs/tags/<tag> \
      --certificate-oidc-issuer https://token.actions.githubusercontent.com

## First-release checklist (the owner)
1. GitHub → the repository → Settings → Rules: a **tag ruleset** for `v*` (only you can create, update or delete).
2. After the first release: GitHub → Packages → sr2e-chargen: confirm it is **Private**.
3. On the server: `compose.yml` from the example — `BASE_URL`, `TRUST_PROXY`, `mem_limit`, `BACKUP_DIR` on its own
   volume; `docker login ghcr.io` with a read-only token; pull by digest; `cosign verify` as above.
4. `docker compose up -d`, then `admin bootstrap` for the first admin; take a backup and restore it once (the drill).
5. Invite the group.
