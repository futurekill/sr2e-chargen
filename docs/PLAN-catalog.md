# Plan: milestone 1 — the catalog
_Draft 5 (2026-11-16): Amendment A added (the project's own copy of the content). Draft 4 was after Codex rounds 1–3 (11 + 5 + 3 findings, all accepted; the last three fixes are not re-reviewed; docs/PLAN-catalog-REVIEW-LOG.md). Roadmap: docs/ROADMAP.md (approved 2026-11-16). Requirement: docs/PLAN.md "Content catalog"
(the pinned content, the source tag on book text, authenticated routes, citations)._

## Goal
A signed-in user can browse and search every item the Foundry compendia hold — gear, weapons, armor, spells,
cyberware, bioware, skills, programs, vehicles, metatypes, traditions, lifestyles, archetypes — filter by book and
type, and see where each one comes from (`SR2 p.231`). Milestone 2 (character creation) reads the same catalog.

## What exists (measured 2026-11-16; corrected in round 1 #11)
- The system and 12 sourcebook modules keep one JSON file per document in `packs-src/<pack>/`. Not included:
  the adventure modules (Double Exposure, Missions, Queen Euphoria), Pink Fohawk (a custom module), and
  Paranormal Animals (critters only: nothing a character buys).
- Catalog items have a structured `system.citation { book, page }` (11 contacts lack a page). The 7 archetypes
  (runner actors) have NO citation, and 51 of their 96 embedded items have none either; embedded items carry no
  source uuid.
- The package a document ships in and the book it cites are DIFFERENT: core items cite the Companion, Fields of
  Fire, the Street Samurai Catalog and Shadowtech; Cyberpirates items cite Rigger 2.
- The system's `module/rules/books.mjs` `BOOKS` maps a book key to its abbreviation, title and module id.
- Book-derived text: `system.notes`, `system.biography`, `system.description`, and others such as a vehicle's
  `system.otherFeatures` — short strings included.
- Only the core system has folder documents; the modules have none.

## Approach
1. **Pins** (round 1 #2). `content-pins.json` lists the system and each book as `{ dir, tag, commit }`. A tag can be
   moved, so the COMMIT is the pin: the build resolves the tag and FAILS when it is not that commit.
   `npm run pins:update` rewrites the commits from the current tags (a reviewed change, like any other).
2. **Build** (`npm run build:catalog`, `tools/build-catalog.mjs`). It reads the content straight from Git objects at
   the pinned commit — `git ls-tree -r <commit> -- packs-src` and `git cat-file --batch` — run with `execFile`,
   never through a shell, with literal path arguments (#3). No archive is extracted and no temporary directory is
   used (#4); only regular-file entries (mode 100644) under `packs-src/` are read, so a symlink in a pack is refused.
   The working trees are never read. The system's manifest and `module/rules/books.mjs` are read from the SAME
   commit (#9). The repositories are found under `CONTENT_ROOT` (default: the parent directory). A missing
   repository, tag, or commit mismatch fails the build, naming it.
3. **Select.** By the record's KIND first (round 2 #3): its `_key` prefix — `!items!` and `!actors!` only. A folder
   record has `type: "Item"` too, and is not an item. Then: items of every type; actors of type `vehicle` (to buy)
   and `character` from the `runners` pack (archetypes). Not NPCs, critters, IC, macros, tables, journals, scenes.
4. **Shape.** One entry per document:
   `{ id, uuid, package, pack, book, kind: item|actor, type, name, category[], citation: { book, page } | null,
   cost, streetIndex, availability, system, text: { <field>: { book, value } }, items? }`.
   - **Package and book are separate** (#6): `package` = the module (or `sr2e`) it ships in; `book` = the book key
     of its citation. **Book toggles filter on `book`** — "the Street Samurai Catalog is on" means its items,
     whichever package carries them.
   - **No printed source** (round 2 #5): eleven contacts cite `book: "none"`, and archetypes cite nothing. Their
     `book` and `citation` are `null`: never attributed to a book, no badge. Every entry also has a `listBook`
     (round 3 #2) = its `book`, or its PACKAGE's book when it has none; **the toggles and the `book=` filter use
     `listBook`** (core contacts appear while the core book is on, which is always).
   - `uuid` = the compendium uuid (`Compendium.<package>.<pack>.<Item|Actor>.<_id>`); `id` = `<package>.<pack>.<_id>`
     (a duplicate fails the build).
   - `category` (#8) = the folder path where the pack has folders; otherwise the pack's label from its manifest;
     plus `system.category` when the document has one.
   - **Text** (#5, round 2 #2): EVERY string path is classified, whatever its length. `tools/string-paths.json`
     lists each path that holds a string, per document type (`weapon: system.damage`, `vehicle: system.seating` …),
     as `data` (a code, a formula, a key, a name the rules read) or `text` (book wording — `notes`, `biography`,
     `description`, `otherFeatures`, `seating` …). The list is written by auditing every path the pinned content
     has. `text` paths are moved to `text.<path>` and tagged with the entry's `book`; a string at a path that is
     NOT in the list fails the build, naming the path. A reduced-content mode can therefore remove all book wording.
   - `text.<field>.value` is stored as PLAIN TEXT (#10): the build strips tags and decodes entities. The client
     renders it as text only (Svelte's escaping; no `{@html}` anywhere), so compendium HTML is never interpreted.
   - `items` (archetypes and vehicles) = the embedded items in the same shape, with `embeddedIn: <entry id>`,
     `uuid: null` and `citation` possibly null (#7). The build requires a citation on every top-level ITEM except
     a listed set of exceptions; archetypes and embedded items may have none and show no badge.
   - **What the rules read stays** (round 2 #4): ALL of `flags.sr2e` (rule markers, `pairedWeapon`, `vehicleId` …),
     and the entry presents its provenance the way the system's pure rules look for it — `_stats: {
     compendiumSource }`: a top-level entry's own uuid; an EMBEDDED item keeps the source uuid it already has
     (all 270 embedded Rigger 2 vehicle items have one) or none (round 3 #1) — since some rules classify an item by its source uuid (the core Cyberarm has no
     rule flag). `effects` keep their `name` and `changes`.
   - Dropped: the rest of `_stats`, `ownership`, `sort`, flags of other packages, `prototypeToken`.
5. **Output** (#2). `catalog/catalog.json` = `{ pins: [{ id, version, tag, commit }], books: [{ key, abbr,
   title, module, count }], entries: [...] }`, entries sorted by id, keys in a fixed order, NO timestamp: the same
   pins give a byte-identical file. `catalog/manifest.json` = the same without `entries`, plus the file's
   SHA-256.
6. **Serve** (`server/catalog.mjs`, routes under `/api/catalog`, all behind the session like every route):
   - loaded once at start, validated (shape, unique ids, the manifest's checksum), kept in memory.
   - `GET /api/catalog` → the manifest and the list of types with counts.
   - `GET /api/catalog/entries?book=&type=&q=&offset=&limit=` → a page of summaries (`id, name, type, book,
     package, citation, cost, category`), sorted by name; `book` and `type` may repeat; `q` matches name and
     category, case-insensitive, at most 64 characters; `limit` ≤ 100.
   - `GET /api/catalog/entries/:id` → one full entry.
   Inputs validated by schema; no input is used as a path, a pattern or a query fragment.
7. **Client.** A Catalog page: search box, book toggles (ALL at the top; the core book listed first), type filter,
   a result list with the citation badge (abbreviation; the full title on hover and for screen readers), a detail
   view with the stats and the text. Paged with "load more".
8. **Image** (#1, round 2 #1). The Dockerfile COPIES `catalog/` (a tracked directory whose contents are build output, not committed) (built on the host first: `npm run
   build:catalog`; the `.dockerignore` lets it through) and runs `tools/check-catalog.mjs` in the build: the image
   build FAILS when the catalog is absent, empty, fails its checksum, or its pins are not exactly those of the
   current `content-pins.json` (a stale catalog). The one exception is the build argument `TEST_IMAGE=1`, which
   builds an image LABELLED as a test image that carries the small FIXTURE catalog from `test/fixtures/` (round 3
   #3: the server never starts without a valid catalog, so the smoke test needs one); only CI's smoke test uses it, and the release
   milestone's publish step refuses a test image. A production server likewise refuses to start without a valid
   catalog. CI's unit tests use a small fixture catalog passed in explicitly; nothing else can run empty.

## Amendment A — the project's own copy of the content (user ruling 2026-11-16)
The user ruled: this project keeps **its own copy** of the content, **inside this repository**, kept in sync with the
Foundry content repositories by a **daily pull request**. It replaces "read the sibling repositories" (§2) for the
catalog build, and removes CI's missing-content gap (§8).

A1. **Layout.** `content/<dir>/` per pin, holding exactly the files the catalog reads, unchanged: the manifest
    (`system.json` or `module.json`), every file under `packs-src/`, and for the system `module/rules/books.mjs`.
    `content/<dir>/CONTENT.json` = `{ dir, id, tag, commit, files: { <path>: <git blob id> } }`.
A2. **Sync** (`tools/sync-content.mjs`, `npm run content:sync`). Reads each repository from Git objects at the pinned
    commit (tools/content.mjs, as before: no shell, regular files only) and REPLACES `content/<dir>/` with those
    files and the record. `--latest` first moves each pin to the repository's newest GitHub release (`gh api
    repos/<owner>/<repo>/releases/latest`), resolving its commit. Only the content directories and
    `content-pins.json` are written.
A3. **The build reads the copy, and checks it.** `tools/build-catalog.mjs` reads `content/`, not the sibling
    repositories. For each pin it requires: the record's `dir`, `tag` and `commit` equal the pin; every listed file
    exists, is a regular file (`lstat`: no symlink), and has the listed git blob id (`sha1("blob <size>\0" +
    bytes)`); no file under `content/<dir>/` is unlisted. A hand edit, a missing file or a stale copy fails the
    build, naming it. The copy can only change through the sync.
A4. **The image builds its own catalog.** The Dockerfile copies `content/` and `content-pins.json` and runs the
    catalog build and check in its build stage. No host-built catalog, no `TEST_IMAGE` exception: CI builds the real
    image. The invented fixture catalog stays for the unit tests only.
A5. **CI** also runs the real catalog build on every push (a test that builds `content/` and checks the pins).
A6. **The daily sync** (`.github/workflows/content-sync.yml`, cron once a day and on demand). With the repository's
    own token (read-only for the public content repositories, `contents: write` and `pull-requests: write` here):
    for each pin, look up the newest release; if any moved, fetch only that tag of that repository (`git fetch
    --depth 1 origin refs/tags/<tag>:refs/tags/<tag>` into a fresh directory), run the sync, run the catalog build
    and the unit tests, then push the branch `content-sync` (force) and open — or update — ONE pull request whose
    body lists each book's old and new version and the result of the catalog build. A failed catalog build (for
    example a new unclassified text field) still opens the pull request, marked as failing, and the workflow ends
    red: the change is visible, and a person fixes it on that branch.
    - Known limit: a pull request opened with the repository token does not start other workflows, so the sync
      workflow runs the build and the tests itself and reports them in the pull request. Merging to `main` runs CI.
    - The repository setting "Allow GitHub Actions to create and approve pull requests" must be on (it is OFF on
      2026-11-16): the owner turns it on; the workflow says so if it can't open the pull request.
A7. **Tests.** The sync writes exactly the commit's files and a correct record (fixture repository made by the
    test); the build refuses a changed byte, a missing file, an extra file, a symlink, and a record that doesn't
    match the pins; the vendored `content/` builds and matches `content-pins.json`.

## Key decisions & tradeoffs
- **Git objects at a pinned commit, not the working tree**: reproducible, no network, nothing extracted to disk.
  Cost: a local build needs the sibling repositories checked out (their `.git`, not their files).
- **In memory, not in the database**: the catalog is read-only build output, small, and the same for everyone.
  Cost: a server restart to load a new one.
- **`system` carried whole (minus text)** rather than a hand-written field list per type: milestone 2 needs the real
  stats for the rules functions, which read the same shapes Foundry does.
- **Images are not in milestone 1.** Entries keep their Foundry image path as data; the app shows no item art yet.

## Risks / open questions
- A text field this plan doesn't know about (the 200-character check is the control).
- Items whose derived values Foundry computes at load (a rating-priced item's cost): the catalog carries SOURCE
  data; milestone 2 prices through the system's `itemBaseCost`, as Foundry does.
- 11 contacts have no page: shown without a page, listed by the build.

## Out of scope
Item art, the reduced-content mode itself (only its tag), characters, the Vehicle Workshop, NPCs and critters.
