# Running sr2e-chargen
A development build (M3a): fine to try on your own machine or server; not released, no backups yet.

## Start it
1. Build the image from the repo root: `docker build -f docker/Dockerfile -t sr2e-chargen:dev .`
   The image builds its own catalog from `content/`, this project's copy of the content. Nothing else is needed.
2. Copy `docker/compose.example.yml` to `compose.yml` and set `BASE_URL` to the address people will type
   (https, exactly). Set `TRUST_PROXY` to your reverse proxy's address or network.
3. `docker compose up -d`
4. Make the first admin: `docker compose exec chargen /nodejs/bin/node server/cli.mjs admin bootstrap` — it prints a
   link that works once. Open it, pick a handle and password.
5. Point your reverse proxy (TLS) at `127.0.0.1:3000`.

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
- `npm run build:catalog` builds `catalog/` for a local server. The server reads it at start; a production server
  does not start without a valid one.

## Day to day
- **Updating**: rebuild the image, `docker compose up -d`. Migrations run at start; an older build refuses to start
  against a newer database.
- **Until backups land (M3b)**: stop writes (`maintenance on`), copy the `/data` volume, `maintenance off`.
- **Health**: `GET /healthz`; the container reports `healthy`.
- **Limits per user**: 200 documents, 500 MB, 50 revisions per document; deleted documents are purged after 30 days.

## Moving to Postgres or MySQL/MariaDB
Set `DATABASE_URL` and start: an empty database is migrated on first start. Copying an existing SQLite library across
(`db copy`) is M3b.

## Portraits and memory
Portraits are stored in the database (table `assets`), so a database backup holds them. Uploads are checked from
their header (JPEG, PNG or WebP only, at most 4096 × 4096) before the image library opens them, then re-encoded to WebP
with all metadata removed, in a separate process. The container's `mem_limit` (1 GB in the compose example) is the
memory bound for that work; keep it. The image supports linux-x64 only for now (sharp's prebuilt libvips).
