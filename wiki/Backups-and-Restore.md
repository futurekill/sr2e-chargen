# Backups and restore

A backup is the whole database: accounts, characters, revisions and portraits. It holds password hashes and every
player's private characters: keep it where only you can read it, and encrypt any copy that leaves the machine (for
example with `age`).

## SQLite: built in

Set `BACKUP_DIR` (and mount a volume there, separate from `/data`, ideally on another disk). Then:

- **Every night**, one app process copies the database with SQLite's own `VACUUM INTO` (writers are not blocked),
  checks the copy (integrity, schema, foreign keys, every portrait's checksum, every user's counters) and keeps the
  newest `BACKUP_KEEP` (default 7). An old backup is removed only after a new one has been checked. Files are named
  `chargen-<time>.db`, readable by their owner only.
- **Now**, by hand (before an update, say):

  ```bash
  docker compose exec chargen /nodejs/bin/node server/cli.mjs backup create
  ```

- **Check a file**:

  ```bash
  docker compose exec chargen /nodejs/bin/node server/cli.mjs backup verify /backups/chargen-<time>.db
  ```

### Restore (SQLite)

The server must be stopped: the restore refuses while one is running.

```bash
docker compose stop chargen
```
```bash
docker compose run --rm chargen server/cli.mjs backup restore /backups/chargen-<time>.db
```
```bash
docker compose start chargen
```

The restore copies the backup beside the database, signs everyone out, cancels unused invite, setup and reset links,
checks it, and only then swaps it in. A bad file changes nothing.

**Drill**: once a month, restore last night's backup into a scratch copy of the compose project and open it.

## PostgreSQL and MySQL/MariaDB: the database's own tools

Run the dump on a schedule from a sidecar container (the official database image), into the backup volume, writing a
`.partial` file and renaming it only when the dump succeeded:

```bash
pg_dump -Fc -f /backups/chargen.dump.partial "$DATABASE_URL" && sync && mv /backups/chargen.dump.partial /backups/chargen-$(date +%F).dump
```

MySQL/MariaDB: `mysqldump --single-transaction --routines …` the same way. Stop the sidecar while you update the app
(updates migrate the schema).

To restore: load the dump with `pg_restore` or `mysql`, then, BEFORE starting the app:

```bash
docker compose run --rm chargen server/cli.mjs backup sanitize --database-url "<url>"
```
```bash
docker compose run --rm chargen server/cli.mjs backup verify --database-url "<url>"
```
