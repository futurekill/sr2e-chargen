# Admin commands

The image has no shell. Run commands through Node in the running container:

```bash
docker compose exec chargen /nodejs/bin/node server/cli.mjs <command>
```

or, when the server is stopped (restore), in a one-off container: `docker compose run --rm chargen server/cli.mjs <command>`.
With no command it lists them all.

| Command | Does |
|---|---|
| `admin bootstrap` | The first admin's setup link. Works only while no enabled admin exists (also the way back in if every admin is lost). |
| `admin invite [--role admin]` | A one-time invite link, valid 7 days. |
| `admin invites` / `admin revoke-invite <id>` | The open invites / cancel one. |
| `admin users` | Everyone, with role and state. |
| `admin disable <user>` / `admin enable <user>` | Disabling signs that user out everywhere. The last admin can't be disabled. |
| `admin reset-link <user>` | A one-time password reset link, valid 24 hours. There is no email: hand it over yourself. |
| `db status` / `db migrate` | Migration state / run pending migrations (the server also migrates at start). |
| `maintenance on` / `off` / `status` | Stop every write (reads go on) / resume. |
| `backup create` | A verified SQLite backup now, into `BACKUP_DIR`. |
| `backup verify <file>` / `backup verify --database-url <url>` | Check a SQLite backup file / a restored server database. |
| `backup restore <file>` | SQLite, server stopped: restore a backup (see [Backups and restore](Backups-and-Restore)). |
| `backup sanitize --database-url <url>` | After restoring a PostgreSQL/MySQL dump: sign everyone out, cancel unused links. |

Links are printed once and stored only as hashes. If one is lost, make another.

The Admin page in the app does the everyday part too: invites (user or admin), the user list, disabling and
re-enabling, and reset links.
