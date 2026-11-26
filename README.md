# sr2e-chargen

**Hoi, chummer!** A web app for building and running **Shadowrun, Second Edition** characters, in the spirit of D&D
Beyond: a step-by-step, rules-accurate character generator that keeps managing the character as it grows in play.
Characters move to and from the [SR2E Foundry VTT system](https://github.com/futurekill/sr2e-foundryvtt) as JSON with
nothing lost in either direction.

Built for a small private group: invite-only accounts, one Docker container on your own server.

> **Status: beta, [v0.1.0-beta.1](https://github.com/futurekill/sr2e-chargen/releases/tag/v0.1.0-beta.1)** (a pre-release,
> a signed private image on GHCR). The tool is **standalone first**: you can make a character for a physical table
> without Foundry ([docs/ROADMAP.md](docs/ROADMAP.md)). In the beta: accounts and a library with revisions; **the
> catalog** (1,763 entries from the core book and 11 sourcebooks, each with its page reference); **character
> creation** through priorities, metatype, magic, attributes, skills and resources, with a rules check that cites the
> page; **printable PDF sheets** in three styles, a one-page table card and a Markdown stat block, whose numbers
> match Foundry's; portraits; nightly verified backups. Next: adept powers, contacts, lifestyle and finishing.

## Contents
- [Running the image](#running-the-image): pull, settings, compose, reverse proxy, the first admin, updates
- [Databases](#databases): SQLite (the default and the recommendation), PostgreSQL, MySQL/MariaDB
- [Backups and restore](#backups-and-restore)
- [Admin commands](#admin-commands)
- [Building a character](#building-a-character): the player's guide
- [Run it locally (development)](#run-it-locally-development)

## Running the image

The app ships as one hardened container image: Node on distroless (no shell), read-only root file system, non-root
user (uid **65532**), port **3000**, its own health check. The catalog is built into the image, so it needs nothing at
run time except its settings and a place for the database.

### 1. Get the image

The image is a **private** package on GitHub's registry. Log in once on each host, with a personal access token that
has only the `read:packages` scope:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <your-github-user> --password-stdin
```

Pull by tag, or better by digest (the release notes print the digest):

```bash
docker pull ghcr.io/futurekill/sr2e-chargen:v0.1.0-beta.1
```

Optional, recommended: check the signature before you run it (needs [cosign](https://docs.sigstore.dev/)):

```bash
cosign verify ghcr.io/futurekill/sr2e-chargen@sha256:<digest> \
  --certificate-identity https://github.com/futurekill/sr2e-chargen/.github/workflows/release.yml@refs/tags/v0.1.0-beta.1 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

### 2. Settings

Environment variables only. `BASE_URL` is the one you must set.

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | required | The address people type, exactly (scheme, host, port). It must be **https**; plain `http` is accepted only for `localhost`. It is the only Origin the app accepts, so a mismatch makes every form fail. |
| `DATABASE_URL` | `sqlite:///data/chargen.db` | Where the data lives. See [Databases](#databases). |
| `TRUST_PROXY` | none | Comma-separated addresses or CIDRs of your reverse proxy. Only their `X-Forwarded-*` headers are believed (client IPs for rate limits and logs). |
| `PORT`, `HOST` | `3000`, `0.0.0.0` | Where it listens inside the container. |
| `LOG_LEVEL` | `info` | `warn` is quieter. Logs go to stdout as JSON. |
| `BACKUP_DIR` | unset | SQLite only: turns on the nightly verified backup into this directory. See [Backups and restore](#backups-and-restore). |
| `BACKUP_KEEP` | `7` | How many nightly backups to keep. |

### 3. Compose

`docker/compose.example.yml` in the repository is the reference. The short form:

```yaml
services:
  chargen:
    image: ghcr.io/futurekill/sr2e-chargen:v0.1.0-beta.1   # or @sha256:<digest>
    restart: unless-stopped
    environment:
      BASE_URL: https://chargen.example.net
      TRUST_PROXY: 172.16.0.0/12
      BACKUP_DIR: /backups
    ports:
      - "127.0.0.1:3000:3000"      # only the proxy reaches it
    volumes:
      - chargen-data:/data          # the SQLite database (characters and portraits)
      - chargen-backups:/backups    # nightly backups: a separate volume, ideally another disk
    read_only: true
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    tmpfs: ["/tmp"]
    mem_limit: 1g                   # the memory bound for PDF rendering and portrait decoding: keep it
volumes:
  chargen-data:
  chargen-backups:
```

```bash
docker compose up -d
```

**Bind mounts instead of volumes:** the container runs as uid 65532, so give that user the directories first:

```bash
sudo install -d -o 65532 -g 65532 -m 0700 /srv/chargen/data /srv/chargen/backups
```

### 4. The reverse proxy

TLS ends at your proxy; the app speaks plain HTTP on `127.0.0.1:3000`.
- Forward `Host` and `X-Forwarded-For` / `X-Forwarded-Proto`, and list the proxy in `TRUST_PROXY`.
- **Allow request bodies of at least 8 MB** (portrait uploads). nginx's default is 1 MB: `client_max_body_size 8m;`.
- The app sets its own security headers (CSP, HSTS and so on); the proxy doesn't need to add them.

### 5. The first admin, then invites

There is no anonymous mode: every player has an account, and accounts come only from invites.

```bash
docker compose exec chargen /nodejs/bin/node server/cli.mjs admin bootstrap
```

It prints a setup link that works once (only while no enabled admin exists). Open it, pick a handle and a password
(12 characters or more). Then make an invite link for each player, either on the Admin page in the app or:

```bash
docker compose exec chargen /nodejs/bin/node server/cli.mjs admin invite
```

Links are shown once and stored only as hashes; if one is lost, make another. All admin commands:
[Admin commands](#admin-commands).

### Troubleshooting: "Wrong origin"

Every form posts with the browser's `Origin` header, and the app accepts it only when it is EXACTLY the origin of
`BASE_URL`: scheme, host name and port. The error message shows both. Typical mismatches:
- `BASE_URL=http://localhost:3000` but the page was opened at `http://192.168.1.20:3000` (another machine on the LAN);
- `http://` in the address bar but `https://` in `BASE_URL` (or the other way round);
- a different host name (`www.` or not; an IP instead of the name) or a port the proxy exposes (`:8443`).

Open the app at exactly the `BASE_URL`, or change `BASE_URL` to the address people type and restart the container.
`BASE_URL` must be **https** for anything but `localhost`: for a LAN without a certificate, put a TLS proxy in front
(Caddy's `tls internal`, for example) and use its https address.

### 6. Check it

- `docker compose ps` shows `healthy` (the image's health check calls `/healthz`).
- `curl -fsS http://127.0.0.1:3000/healthz` answers `{"ok":true}`.

### Updating

Pull the new tag (or digest), change `image:`, `docker compose up -d`. Database migrations run at start; an older image
refuses to start against a database a newer one migrated, so read the release notes before going back a version.
With SQLite, take a backup first (`backup create`, see [Backups and restore](#backups-and-restore)).

### Platform

linux/amd64 only for now (the portrait library ships a prebuilt libvips for that platform).

## Databases

One setting picks the database: `DATABASE_URL`. Everything the app keeps is in it: accounts, characters with every
revision, and portraits (as binary rows in the `assets` table). There are no other files to back up.

| Database | `DATABASE_URL` | Tested in CI |
|---|---|---|
| **SQLite** (default) | `sqlite:///data/chargen.db` | yes, every push |
| PostgreSQL | `postgres://user:pass@host:5432/chargen` (`postgresql://` too) | PostgreSQL 18 |
| MySQL | `mysql://user:pass@host:3306/chargen` | MySQL 9 |
| MariaDB | `mariadb://user:pass@host:3306/chargen` | MariaDB 12 |

The schema is created and upgraded by the app itself: migrations run at start (`db status` / `db migrate` in the
[admin commands](#admin-commands) show and run them by hand). An image refuses to start against a database that a newer
image has migrated.

### SQLite: the default, and the right choice for a group

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
- **Backups and restore**: [Backups and restore](#backups-and-restore).

Looking inside (read-only, from the host, while it runs):

```bash
sqlite3 -readonly /var/lib/docker/volumes/<project>_chargen-data/_data/chargen.db '.tables'
```

### PostgreSQL

- Create an empty database and a user that owns it (the app creates its tables):

  ```sql
  CREATE USER chargen WITH PASSWORD '…';
  CREATE DATABASE chargen OWNER chargen;
  ```

- `DATABASE_URL=postgres://chargen:…@db.internal:5432/chargen`. TLS and other connection options go in the URL as the
  `pg` driver reads them, for example `?sslmode=require`.
- Each app process opens at most 10 connections.

### MySQL / MariaDB

- Create the database with the `utf8mb4` character set (the server's default on MySQL 8+ and MariaDB 11+; set it if
  your server is configured otherwise), and a user with all privileges on it:

  ```sql
  CREATE DATABASE chargen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'chargen'@'%' IDENTIFIED BY '…';
  GRANT ALL PRIVILEGES ON chargen.* TO 'chargen'@'%';
  ```

- `DATABASE_URL=mysql://chargen:…@db.internal:3306/chargen` (or `mariadb://…`, the same driver).
- Each app process opens at most 10 connections. Portraits are stored as `LONGBLOB`.

### Backups for PostgreSQL and MySQL

The app does not dump server databases itself: use the database's own tool, on a schedule, from a sidecar container
(the official database image). See [Backups and restore](#backups-and-restore). After restoring a dump, run
`backup sanitize` and `backup verify` on it before starting the app.

### Changing database later

Moving an existing library from SQLite to PostgreSQL or MySQL (`db copy`) is not built yet. Choose before your group
starts: a new PostgreSQL or MySQL database is set up on first start, but nothing is carried over from SQLite.

## Backups and restore

A backup is the whole database: accounts, characters, revisions and portraits. It holds password hashes and every
player's private characters: keep it where only you can read it, and encrypt any copy that leaves the machine (for
example with `age`).

### SQLite: built in

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

#### Restore (SQLite)

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

### PostgreSQL and MySQL/MariaDB: the database's own tools

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

## Admin commands

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
| (Admin page) Rules | How selling pays: refund what was paid, or a fence (p.188) — every character on the server |
| `admin reset-link <user>` | A one-time password reset link, valid 24 hours. There is no email: hand it over yourself. |
| `db status` / `db migrate` | Migration state / run pending migrations (the server also migrates at start). |
| `maintenance on` / `off` / `status` | Stop every write (reads go on) / resume. |
| `backup create` | A verified SQLite backup now, into `BACKUP_DIR`. |
| `backup verify <file>` / `backup verify --database-url <url>` | Check a SQLite backup file / a restored server database. |
| `backup restore <file>` | SQLite, server stopped: restore a backup (see [Backups and restore](#backups-and-restore)). |
| `backup sanitize --database-url <url>` | After restoring a PostgreSQL/MySQL dump: sign everyone out, cancel unused links. |

Links are printed once and stored only as hashes. If one is lost, make another.

The Admin page in the app does the everyday part too: invites (user or admin), the user list, disabling and
re-enabling, and reset links.

## Building a character

**Hoi, chummer!** builds a Shadowrun, Second Edition character the way the core book does it, one step at a time.
The **Rules check** panel beside every step shows your budgets and anything still to do or against the rules, each
with its page reference (`SR2 p.44`). Nothing stops you from saving a half-finished character: the check tells you
what is left.

### Start

On **Library**, type a street name, keep **Character** as the kind, and **Start**. (A *draft* is a free-text note,
for ideas.) Every change saves itself and keeps a revision. A deleted character stays under **Deleted** for 30 days,
where **Restore** brings it back.

### The steps

Each step is a **tab** at the top of the character page; a tab with a number has that many things left to do (red
when one breaks a rule). The **Rules check** beside the tabs lists every problem: click one to open its tab. The page
remembers the tab you were on.

1. **Concept**: name, notes, and a portrait: upload a JPEG, PNG or WebP (it is re-encoded and its location data
   removed), or choose one of the premade portraits. **Sourcebooks**: tick the books your table uses (or **All**); the
   core book is always on. The shops then also list those books' weapons, armor, ammunition, gear and spells — the
   other parts of each book (metatypes, Edges and Flaws, cyberware, bioware…) come in later versions, and an entry with
   special rules (a drug, a skillsoft, an item with active effects) isn't offered yet. A book can be turned on at any
   time; it can be turned off once nothing on the character comes from it. Each shop row shows its book and page.
   With the Shadowrun Companion on, **Edges and Flaws** appear here too (p.22–35, the GM's optional rule): add them
   from the list, choose a value where the book allows several, an attribute for Bonus Attribute Point or Exceptional
   Attribute, and a detail (the skill, substance, phobia…). They must add up to 0. Some change creation: Bonus
   Attribute Point (+1 per point, 2 points past the racial maximum), Exceptional Attribute (+1 maximum), Bonus Skill
   Point (skill points), Bonus Force Point (2 Force Points per point, magicians only), Extra Contact (one more free
   contact); Lightning Reflexes adds Reaction and Will to Live overflow boxes. The rest are played at the table.
   Cyberpirates' and Rigger 2's Edges and Flaws appear too when their books are on. With Shadowtech on, the shop offers **bioware**:
   choose the rating and grade (cultured: ×0.75 Body Cost, ×4 price; neural bioware is always cultured already). The
   Body Index is shown; an Awakened character pays it in Essence too; going over Body is overstress (a warning).
   Bioware with its own rules (Adrenal Pump, Pain Editor, Orthoskin, Muscle Augmentation…) comes later. Book
   **cyberware** (Cybertechnology, Street Samurai Catalog…) is offered too, except limbs and implants with their own
   rules. With the **Street Samurai Catalog** on, every cyberware purchase can be **alpha** (Essence ×0.8, price ×3) or
   **beta** (×0.6, ×7) (p.98); an accessory inside a cybereye takes the eye's grade.
2. **Priorities** (p.44): give each of Race, Magic, Attributes, Skills and Resources one letter, A to E, each letter
   once. Picking a letter that is in use swaps the two. With the Shadowrun Companion on you can choose **Sum-to-10**
   instead (p.20): A counts 4, B 3, C 2, D 1, E 0, letters may repeat, and the five add up to at most 10. Or
   **Point-based** (p.20–21): no letters; the GM's Building Points (100 by default) buy every part — metahuman 10,
   magician 20 (with 30 Force Points), physical adept 15, 2 per Attribute Point, 1 per Skill Point, a nuyen tier (0¥
   gives 5 back … 1,000,000¥ costs 30), and Force Points traded 2 per point. Edges and Flaws balance to 0, unless the GM
   lets them cost and add Building Points.
3. **Metatype** (p.44): human, dwarf, elf, ork or troll. A metahuman needs Race A (or C with the GM's *More
   Metahumans* option, p.46). With the Shadowrun Companion turned on, a dwarf, elf, ork or troll can be a
   **metavariant** (Cyclops, Gnome, Oni, Night One…, Companion p.39–44): its own racial modifiers, the base
   metatype's priority and maximums, and its notes (every variant meets a Hostile reaction; a Cyclops takes +2 TN on
   ranged attacks). For an Oni the GM may allow Race B with Resources A and Magic C (an adept, p.42). The Companion
   also offers **shapeshifters** (bear, fox, leopard, seal, tiger, wolf; p.36–38): Race A buys only the shapeshifter
   and its own table gives the rest (Magic B a magician, C an adept); base attributes go no higher than 6 and the
   species' human-form modifiers apply on top (the Attributes tab shows both forms); no free contacts, no cyberware,
   no allergy points, and a Karma Pool of 1 (R10).
4. **Magic** (p.45): full magician (hermetic, or shamanic with a totem) or physical adept, as your Magic priority
   allows.
5. **Attributes** (p.45): spend your Attribute Points; racial modifiers and maximums are applied for you.
6. **Skills** (p.45, p.70, p.74): add skills from the book, or your own Knowledge skills; set points, a concentration
   and a specialization. Mark your native language free (Intelligence + 2) and, with a Street lifestyle, one local
   dialect.
7. **Resources** (p.46): search the core book's gear, cyberware, spells and foci and **Add**; set quantities,
   ratings and Force on each row.
   - Gear is bought at list price; nothing above Rating 6.
   - Cyberware takes Essence; cybereye accessories can go **In** the eyes (up to .5 Essence free, p.247).
   - A physical adept buys its powers here too, in power points (its Magic Rating): Improved Ability names one of
     your skills, Improved Physical Senses names its senses (each one is a level). Killing Hands levels can be held
     together (p.126).
   - Magicians pay Force Points for spells (Force up to 6) and for bonding foci. A spell focus names its spell; a
     weapon focus names the melee weapon it is bonded to (its price follows the weapon's Reach, p.263).
   - **Contacts and extras** (p.43–44): two contacts are free, each further one 5,000¥; one may be your **buddy**
     (10,000¥). Add a **gang or tribe** (50,000¥; the server rolls its 2D6 members once) or **followers** (200,000¥;
     name five different archetypes).
   - **Lifestyle** (p.46): pick one and the months paid ahead; with none, the character lives on the street.
   - **Vehicles and drones** (p.264): choose the Vehicle type in the search and add one at its list price. The book's
     "Restricted" vehicles have no price and can't be bought. The sheet lists their stats.
   - Metahumans may take an **allergy** in the Metatype step for extra points (p.46).
8. **Finish** (p.47): when the rules check is clean, finish: unspent Resources become nuyen at 10:1, plus 3D6 ×
   1,000¥ rolled by the server. Creation then closes; name, notes and the table card can still change.
9. **Table card**: tick what goes on the one-page card for the table.

The house rulings the app follows where the book is unclear are in the repository's `docs/RULINGS.md` (for example:
a weapon with Concealability above 5 makes a small weapon focus).

### After creation: Karma

A finished character gets a **Karma** step at the top of its page (p.190–191):
- **Award Karma** after a run: it adds to Total Karma; one-tenth of Total (rounded up) is the Karma Pool, the rest
  is Good Karma to spend.
- **Raise** an attribute (its new rating; double above the racial maximum, with the GM's approval) or a skill
  (2 × the new rating; a language 1 ×; a Concentration 1.5 ×; a Specialization 1 ×), **add** a named Concentration
  or Specialization, or **learn** a new skill (1 Good Karma). Reaction, Essence and Magic are never raised with Karma.
- **History** lists every change; **Undo** reverses the newest one.

### After creation: Nuyen

The **Nuyen** step (finished characters):
- **Record** money received (a run's pay) or paid (rent, a bribe); the balance can't go below 0.
- **Buy** weapons, armor, gear, ammunition, cyberware and programs: the street price is shown (list × Street Index,
  p.184); enter the price you agreed after any negotiation. Cyberware bought now is a spare: install it with surgery on
  the **Condition** step.
- **Sell** what you own. How selling pays is the GM's setting (Admin → Rules, R6): a refund of what was paid, or a
  fence — 30% of the list value, 5% more or less per extra Negotiation success, between 10% and 50% (p.188).
- Every change is in the history (the Karma step) with **Undo** on the newest one, and the printed sheet and the stat
  block include the history, so the GM can check it. Installed cyberware can't be sold: it comes out by surgery (not in
  the app yet).

### After creation: Condition

The **Condition** step (finished characters) records what happened at the table; the app rolls nothing here.
- **Wounds** (p.111): pick Physical or Stun and a number of boxes, then **Take damage** or **Heal**. Stun past 10 boxes
  rolls into Physical, Physical past 10 into the overflow; healing takes the overflow first (R8). The page shows the
  wound level, the injury modifier (+TN and −Initiative), and when the character is unconscious, dying or dead. The
  printed sheet marks the boxes.
- **Ammunition**: **Use** takes rounds off a box of ammunition. Buy more on the Nuyen step.
- **Surgery** installs a spare implant. Enter the surgeon's successes (the TN is shown): 0 successes adds 15% to the
  implant's Essence, 2–3 change nothing, 4–5 take 10% off, 6 or more 20% (Cybertechnology p.53). The procedure's
  category (core p.114) sets the fee and the wound; untick either if your table handles it another way. A surgery that
  would take Essence below 0 is refused. It goes in the history and can be undone while the implant and the wounds are
  as it left them.

### Archiving a character

**Archive** (on a Library row, or on the **Concept** tab) hides a character from the Library's main list without
deleting it: it moves to **Archived**, where you can still open, edit and print it, and **Unarchive** brings it back.
Archived characters are never removed on their own.

### Deleting a character

On the **Concept** tab, **Delete character…** asks you to type the character's name before it deletes. A deleted
character moves to **Deleted** in your Library, where **Restore** brings it back for 30 days; after that it is gone.

### Print and share

On the **Print** tab, choose the style, paper and font, then:
- **Print sheet**: the full character sheet as a PDF, in the **Fohawk** (the default), **Fohawk (ink saver)**, **Classic**, **Printout** (a computer printout: mono
  headings, grey bands) or **Dossier** (a case file: serif headings, double rules) style,
  on US Letter or A4, in your account's font or the readable font.
- **Print card**: the one-page table card (tick its rows on the same tab). The page says whether it fits on one page, and which rows run over.
- **Stat block (Markdown)**: the character as text, for a forum post or your notes.

### Your garage (vehicles)

Start a vehicle from the Library (**Kind: Vehicle**, then pick one of the core book's vehicles, p.264). Its page shows
its stats and its weapon mounts as the book prints them (p.251–253): a **hardpoint** takes a heavy weapon, a
**firmpoint** a smaller firearm, and a mounted weapon costs twice its list price. Load cargo (gear, or missiles for a
launcher), name it, write notes, and download it for Foundry.

On a character's **Resources** step, **From your garage** lets you **buy** a vehicle at creation (you pay its whole
price; the character keeps a copy of it as it was) or **link** one (free, any time; the sheet shows it as it stands in
your garage). A deleted or archived vehicle shows as "unavailable" on the characters that link it.

### Your account

**Account** holds your password, the site's **theme** (Cyberpunk, the default; Terminal, Cybernoir or GeoCities retro) and the
**readable font** option (Atkinson Hyperlegible). Both change the site at once and follow you to other devices; the
font is also the sheets' default.

### Not in this beta

The sourcebooks and character management in play
follow. See the repository's CHANGELOG and `docs/ROADMAP.md`.

## Run it locally (development)

```bash
npm ci
```
```bash
npm run build
```
```bash
npm run build:catalog
```
```bash
DATABASE_URL=sqlite://./data/dev.db BASE_URL=http://localhost:3000 node server/cli.mjs admin bootstrap
```
```bash
DATABASE_URL=sqlite://./data/dev.db BASE_URL=http://localhost:3000 npm start
```
Open the setup link the bootstrap command printed (it works once), pick a handle and password, and you're the admin.
`npm run build:catalog` reads `content/`, this project's own copy of the content (the Foundry system and the
sourcebook modules at the releases in `content-pins.json`). A daily workflow proposes updates as pull requests.
`node server/cli.mjs` with no arguments lists the admin commands. `npm test` runs the suite. Needs Node 26.13+.

## What it will do

- **Build a character** the way the core book does it: priorities, race, magic, attributes, skills, resources,
  contacts, lifestyle. Start from scratch or from an archetype. Alternate methods from the books you enable (e.g. the
  Shadowrun Companion's Sum-to-10 and point-based design).
- **Pick your books**: an ALL toggle for the sourcebooks; the core book is always on. Every item and rule shows where
  it comes from (`SSC p.59`, `R2 p.14`).
- **Manage it in play**: Karma and advancement, nuyen, purchases, damage, ammo, with history and undo.
- **Rigger 2 vehicle design**: design a vehicle from scratch by the Rigger 2 rules (the Garage covers core vehicles).
- **Export**: Foundry JSON (characters with their vehicles, spirits and images), printable PDF sheets in several
  styles (Classic and Fohawk, with an ink-saver option), a Markdown stat block and a one-page table card.
- **Shadowland banter** while you build: in-character commentary from street handles, never printed on sheets.

## How it fits with Foundry

The Foundry system is the source of truth for the rules. Its rules code is shared with this app, so a character is
computed the same way in both places. Tests check that both give identical results. The Docker image ships fully formed, with the catalog built in from pinned content versions.

**App → Foundry.** On a character's Print tab, "Foundry" downloads the character (and each vehicle bought at creation)
as a Foundry actor file. In Foundry: create an Actor of type Character, right-click it in the sidebar, choose
**Import Data** and pick the file. Set the portrait yourself: Foundry stores image paths, not images.

**Foundry → App.** In Foundry, right-click a finished character and choose **Export Data**. In the app's library,
choose "Import a character from Foundry…". The character arrives finished, ready for play (Karma, nuyen, condition).
A character still in creation, from a newer system version than the app knows, or with bad numbers is refused with
the reason. Effects, the portrait, and in-play state stay in Foundry. Foundry's Export Data leaves out each item's
compendium source, so imported items show no source link.

## Documents

| File | What it holds |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | The approved plan: decisions, architecture, security, exports, milestones |
| [docs/PLAN-REVIEW-LOG.md](docs/PLAN-REVIEW-LOG.md) | Every review round and how each finding was resolved |
| [docs/ROADMAP.md](docs/ROADMAP.md) | The approved order of work: standalone first |
| [docs/PLAN-catalog.md](docs/PLAN-catalog.md) | Milestone 1, the catalog, with its review logs |
| [docs/PLAN-M2.md](docs/PLAN-M2.md) | Milestone 2, character creation, with its review logs |
| [docs/QA-PLAN.md](docs/QA-PLAN.md) | How a change is checked: the automatic checks and the manual walk-through |
| [CHANGELOG.md](CHANGELOG.md) | What changed, release by release |
| [docs/PLAN-M3.md](docs/PLAN-M3.md) | The app skeleton's plan (accounts, library, container), with its review log |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | The operator's reference: content and catalog updates, releases, the first-release checklist (the guide is this README) |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | What is protected, from whom, and where each defence lives |
| [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) | Every dependency and why it is there |
| [docs/RULES-CHARGEN.md](docs/RULES-CHARGEN.md) | The creation rules captured from the books, with page references (M0) |
| [docs/RULINGS.md](docs/RULINGS.md) | Where the books are unclear: the reading the app follows, and why |
| [docs/GRAPHICS.md](docs/GRAPHICS.md) | The graphics plan for the site and the sheets |

## Roadmap

The approved order is in [docs/ROADMAP.md](docs/ROADMAP.md) (standalone first, revised 2026-11-16).

| Milestone | What | Status |
|---|---|---|
| M0 | Capture the creation rules from the books | done |
| — | App skeleton: Docker, accounts, library, the first theme | done |
| 1 | Catalog: browse and search every item, with page references | done |
| 2 | Create a character, core book ([docs/PLAN-M2.md](docs/PLAN-M2.md), [docs/PLAN-M2c.md](docs/PLAN-M2c.md)) | done (M2a–M2d) |
| 3 | Printable sheet ([docs/PLAN-sheet.md](docs/PLAN-sheet.md)) | done: Classic, Fohawk and ink-saver styles, Markdown stat block, table card, portraits |
| 4 | Manage a character: Karma, nuyen, purchases, damage, history | done (M4a–M4c) |
| 5 | Sourcebooks, alternate methods, Edges and Flaws | done (M5a–M5n) |
| 6 | Release ([docs/PLAN-release.md](docs/PLAN-release.md)) | done: backups, image scan, SBOM, signed image; first beta v0.1.0-beta.1 |
| 7 | Foundry connector (optional) ([docs/PLAN-M7.md](docs/PLAN-M7.md)) | simple form done: Foundry actor JSON both ways |
| 8 | Later: themes and sheet styles, Vehicle Workshop, NPC builder, social login | site themes, sheet styles Printout and Dossier, and the Garage (Vehicle Workshop part 1) done; Rigger 2 design, NPC builder and social login not started |

Each milestone goes plan → review → build → code review → release.

## Stack

Node 26 with Fastify, Svelte 5 with Vite, Kysely over SQLite (node:sqlite), PostgreSQL or MySQL/MariaDB, delivered as
one hardened distroless Docker image. Security follows OWASP ASVS Level 2; dependencies are pinned and scanned.

## Not affiliated

Shadowrun is a trademark of its owners. This is an unofficial fan tool for personal use, with no official art or logos.
