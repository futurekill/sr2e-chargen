# Plan: milestone 1 — the catalog
_Draft 2 (2026-11-16), after Codex round 1 (11 findings, all accepted; docs/PLAN-catalog-REVIEW-LOG.md). Roadmap: docs/ROADMAP.md (approved 2026-11-16). Requirement: docs/PLAN.md "Content catalog"
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
3. **Select.** Items of every type; actors of type `vehicle` (to buy) and `character` from the `runners` pack
   (archetypes). Not NPCs, critters, IC, macros, tables, journals, scenes, folders.
4. **Shape.** One entry per document:
   `{ id, uuid, package, pack, book, kind: item|actor, type, name, category[], citation: { book, page } | null,
   cost, streetIndex, availability, system, text: { <field>: { book, value } }, items? }`.
   - **Package and book are separate** (#6): `package` = the module (or `sr2e`) it ships in; `book` = the book key
     of its citation, or the package's own book when it has none. **Book toggles filter on `book`** — "the Street
     Samurai Catalog is on" means its items, whichever package carries them.
   - `uuid` = the compendium uuid (`Compendium.<package>.<pack>.<Item|Actor>.<_id>`); `id` = `<package>.<pack>.<_id>`
     (a duplicate fails the build).
   - `category` (#8) = the folder path where the pack has folders; otherwise the pack's label from its manifest;
     plus `system.category` when the document has one.
   - **Text** (#5): text is classified BY FIELD, not by length. `TEXT_FIELDS` (`notes`, `biography`, `description`,
     `otherFeatures`, … — completed from the data when the build is written) are moved, wherever they sit in
     `system`, to `text.<path>` and tagged with the entry's `book`. Then the build walks every remaining string in
     `system` and FAILS on unclassified prose: a string of four or more words whose field is not in an explicit
     `DATA_FIELDS` allow-list (names, codes, formulas). A reduced-content mode can therefore remove ALL book prose.
   - `text.<field>.value` is stored as PLAIN TEXT (#10): the build strips tags and decodes entities. The client
     renders it as text only (Svelte's escaping; no `{@html}` anywhere), so compendium HTML is never interpreted.
   - `items` (archetypes and vehicles) = the embedded items in the same shape, with `embeddedIn: <entry id>`,
     `uuid: null` and `citation` possibly null (#7). The build requires a citation on every top-level ITEM except
     a listed set of exceptions; archetypes and embedded items may have none and show no badge.
   - Dropped: `_stats`, `ownership`, `sort`, `flags` other than `flags.sr2e.rule`, `prototypeToken`, `effects`
     except their `name` and `changes`.
5. **Output** (#2). `dist/catalog/catalog.json` = `{ pins: [{ id, version, tag, commit }], books: [{ key, abbr,
   title, module, count }], entries: [...] }`, entries sorted by id, keys in a fixed order, NO timestamp: the same
   pins give a byte-identical file. `dist/catalog/manifest.json` = the same without `entries`, plus the file's
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
8. **Image** (#1). The Dockerfile COPIES `dist/catalog` (built on the host first: `npm run build:catalog`; the
   `.dockerignore` lets it through) and the image build FAILS when it is absent or its checksum is wrong — unless
   the build argument `ALLOW_EMPTY_CATALOG=1` is given, which only CI uses until it has access to the content
   repositories (the release milestone). A server without a catalog refuses to start in production for the same
   reason, with the same explicit override. CI's tests use a small fixture catalog.

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
