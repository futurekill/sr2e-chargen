# Plan: milestone 1 — the catalog
_Draft 1 (2026-11-16). Roadmap: docs/ROADMAP.md (approved 2026-11-16). Requirement: docs/PLAN.md "Content catalog"
(the pinned content, the source tag on book text, authenticated routes, citations)._

## Goal
A signed-in user can browse and search every item the Foundry compendia hold — gear, weapons, armor, spells,
cyberware, bioware, skills, programs, vehicles, metatypes, traditions, lifestyles, archetypes — filter by book and
type, and see where each one comes from (`SR2 p.231`). Milestone 2 (character creation) reads the same catalog.

## What exists (measured 2026-11-16)
- The system and 13 sourcebook modules keep one JSON file per document in `packs-src/<pack>/`: 1,458 items and 546
  actors in all. Adventure modules (Double Exposure, Missions, Queen Euphoria) are excluded.
- Every item has a structured `system.citation { book, page }` (11 contacts lack a page). The system's
  `module/rules/books.mjs` `BOOKS` maps a book key to its abbreviation, title and module id.
- Book-derived text sits in three fields: `system.notes` (1,719 documents), `system.biography` (226),
  `system.description` (58).
- A document's kind is in its `_key` (`!items!…`, `!actors!…`, `!folders!…`); folders give each pack its categories.

## Approach
1. **Pins.** `content-pins.json` lists the content: the system and each book as `{ dir, tag }` (a sibling repository
   and the release tag to read). Changing content = a commit that changes a tag.
2. **Build** (`npm run build:catalog`, `tools/build-catalog.mjs`): for each pin, read `packs-src/**` and the manifest
   (`system.json` / `module.json`) AT THE TAG with `git archive <tag>` piped to tar, into a temporary directory —
   the working trees are never read, so an uncommitted edit can't leak in. The repository directory comes from
   `CONTENT_ROOT` (default: the parent directory). A missing repository or tag fails the build, naming it.
3. **Select.** Items of every type; actors of type `vehicle` (to buy) and `character` from the `runners` pack
   (archetypes). Not NPCs, critters, IC, macros, tables, journals, scenes.
4. **Shape.** One entry per document:
   `{ id, uuid, book, pack, kind: item|actor, type, name, category[], citation: { book, page }, cost, streetIndex,
   availability, system, text: { notes|biography|description: { book, value } }, items? }`.
   - `uuid` = the compendium uuid Foundry uses (`Compendium.<package>.<pack>.<Item|Actor>.<_id>`), so a character
     can point back to its source. `id` = `<package>.<pack>.<_id>` (unique in the catalog; a duplicate fails the build).
   - `category` = the document's folder path inside its pack.
   - `system` = the document's stats with the text fields REMOVED; **every text field is under `text`, tagged with
     its book** (U12): a reduced-content mode is then a filter. The build FAILS if a string longer than 200
     characters stays inside `system` (book prose in an unlisted field).
   - `items` (archetypes and vehicles only) = the embedded items, shaped the same way.
   - Dropped: `_stats`, `ownership`, `sort`, `flags` other than `flags.sr2e.rule`, `prototypeToken`, `effects`
     except their `name` and `changes` (creation needs what an item modifies).
5. **Output.** `dist/catalog/catalog.json` = `{ builtAt, pins: [{ id, version, tag, commit }], books: [{ id, key,
   abbr, title, count }], entries: [...] }` and a `dist/catalog/manifest.json` (the same without `entries`).
   The pins record the commit each tag pointed at.
6. **Serve** (`server/catalog.mjs`, routes under `/api/catalog`, all behind the session like every route):
   - loaded once at start, validated (shape, unique ids), kept in memory (a few megabytes); a missing catalog is
     not an error: the routes answer with an empty catalog and the manifest says `empty: true`.
   - `GET /api/catalog` → the manifest and the list of types with counts.
   - `GET /api/catalog/entries?book=&type=&q=&offset=&limit=` → a page of summaries (`id, name, type, book,
     citation, cost, category`), sorted by name; `book` and `type` may repeat; `q` matches name and category,
     case-insensitive, at most 64 characters; `limit` ≤ 100.
   - `GET /api/catalog/entries/:id` → one full entry.
   Inputs validated by schema; no input is used as a path, a pattern or a query fragment.
7. **Client.** A Catalog page: search box, book toggles (ALL at the top; the core book listed first), type filter,
   a result list with the citation badge (abbreviation; the full title on hover and for screen readers), a detail
   view with the stats and the text. Paged with "load more".
8. **Image.** The Dockerfile copies `dist/catalog` when it exists. The documented local build runs
   `npm run build:catalog` first. CI has no access to the content repositories yet: its tests use a small fixture
   catalog, and its image is built without one (the app then says the catalog is empty). Giving CI the content is
   part of the release milestone.

## Key decisions & tradeoffs
- **`git archive` at a tag, not the working tree**: reproducible, and it needs no network. Cost: a local build
  needs the sibling repositories checked out.
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
