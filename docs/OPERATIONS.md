# Running sr2e-chargen
A development build (M3a): fine to try on your own machine or server; not released, no backups yet.

## Start it
1. Build the image from the repo root: `docker build -f docker/Dockerfile -t sr2e-chargen:dev .`
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

## Day to day
- **Updating**: rebuild the image, `docker compose up -d`. Migrations run at start; an older build refuses to start
  against a newer database.
- **Until backups land (M3b)**: stop writes (`maintenance on`), copy the `/data` volume, `maintenance off`.
- **Health**: `GET /healthz`; the container reports `healthy`.
- **Limits per user**: 200 documents, 500 MB, 50 revisions per document; deleted documents are purged after 30 days.

## Moving to Postgres or MySQL/MariaDB
Set `DATABASE_URL` and start: an empty database is migrated on first start. Copying an existing SQLite library across
(`db copy`) is M3b.
