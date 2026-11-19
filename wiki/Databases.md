# Databases

One setting picks the database: `DATABASE_URL`. Everything the app keeps is in it: accounts, characters with every
revision, and portraits (as binary rows in the `assets` table). There are no other files to back up.

| Database | `DATABASE_URL` | Tested in CI |
|---|---|---|
| **SQLite** (default) | `sqlite:///data/chargen.db` | yes, every push |
| PostgreSQL | `postgres://user:pass@host:5432/chargen` (`postgresql://` too) | PostgreSQL 18 |
| MySQL | `mysql://user:pass@host:3306/chargen` | MySQL 9 |
| MariaDB | `mariadb://user:pass@host:3306/chargen` | MariaDB 12 |

The schema is created and upgraded by the app itself: migrations run at start (`db status` / `db migrate` in the
[admin commands](Admin-Commands) show and run them by hand). An image refuses to start against a database that a newer
image has migrated.

## SQLite: the default, and the right choice for a group

For a gaming group, SQLite is the recommended database: nothing else to run, and the app's backups (nightly,
verified, one command to restore) work only with SQLite.

- **The URL is a file path.** Three slashes for an absolute path: `sqlite:///data/chargen.db` is `/data/chargen.db`
  inside the container (the image's `/data` volume). Two slashes and a dot for a relative path, as in development:
  `sqlite://./data/dev.db`.
- **Keep `/data` on a volume** (or a bind mount owned by uid 65532). The container's root file system is read-only;
  without a volume the database dies with the container.
- **WAL mode.** The app opens the database in SQLite's write-ahead-log mode, with foreign keys on and a 5-second busy
  timeout. So next to `chargen.db` you will see `chargen.db-wal` and `chargen.db-shm` while it runs: they are part of
  the database. **Never copy only `chargen.db` from a running server**: use `backup create` (below), which takes a
  consistent copy without stopping anyone.
- **Local disk only.** WAL needs shared memory between processes on one machine: put `/data` on a local file system,
  never on NFS, SMB/CIFS or other network shares.
- **One host.** Several app processes on the same host may share the file (one of them takes the nightly backup);
  two hosts may not. If you need more than one host, use PostgreSQL or MySQL.
- **Size.** Each user is limited to 200 documents and 500 MB; a group's database stays small (portraits are
  re-encoded to WebP, the newest five per character kept).
- **Backups and restore**: [Backups and restore](Backups-and-Restore).

Looking inside (read-only, from the host, while it runs):

```bash
sqlite3 -readonly /var/lib/docker/volumes/<project>_chargen-data/_data/chargen.db '.tables'
```

## PostgreSQL

- Create an empty database and a user that owns it (the app creates its tables):

  ```sql
  CREATE USER chargen WITH PASSWORD '…';
  CREATE DATABASE chargen OWNER chargen;
  ```

- `DATABASE_URL=postgres://chargen:…@db.internal:5432/chargen`. TLS and other connection options go in the URL as the
  `pg` driver reads them, for example `?sslmode=require`.
- Each app process opens at most 10 connections.

## MySQL / MariaDB

- Create the database with the `utf8mb4` character set (the server's default on MySQL 8+ and MariaDB 11+; set it if
  your server is configured otherwise), and a user with all privileges on it:

  ```sql
  CREATE DATABASE chargen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'chargen'@'%' IDENTIFIED BY '…';
  GRANT ALL PRIVILEGES ON chargen.* TO 'chargen'@'%';
  ```

- `DATABASE_URL=mysql://chargen:…@db.internal:3306/chargen` (or `mariadb://…`, the same driver).
- Each app process opens at most 10 connections. Portraits are stored as `LONGBLOB`.

## Backups for PostgreSQL and MySQL

The app does not dump server databases itself: use the database's own tool, on a schedule, from a sidecar container
(the official database image). See [Backups and restore](Backups-and-Restore). After restoring a dump, run
`backup sanitize` and `backup verify` on it before starting the app.

## Changing database later

Moving an existing library from SQLite to PostgreSQL or MySQL (`db copy`) is not built yet. Choose before your group
starts: a new PostgreSQL or MySQL database is set up on first start, but nothing is carried over from SQLite.
