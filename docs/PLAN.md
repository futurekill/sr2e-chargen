# Plan: SR2E Character Generator & Manager (standalone)
_Draft 6, 2026-11-13, by Claude, after Codex plan rounds 1–5 (38 findings, all taken; see docs/PLAN-REVIEW-LOG.md). Supersedes the 2026-07-17 design doc
(`sr2e-foundryvtt/docs/PLAN-character-creator.md`), whose schema ideas it keeps._

## Goal

A web app, in the spirit of D&D Beyond, for the user and their friends. It builds a **complete, rules-accurate SR2E
character** step by step as the core book describes, then **keeps managing it** as it evolves in play. It runs as
one Docker container on the user's server. Characters move to and from the sr2e Foundry system as JSON with **no
loss in either direction**.

## User decisions (2026-11-11 / 2026-11-12)

- U1. Own repo, Docker image on the user's server. Audience: the user and friends only (minimal exposure).
- U2. Generator **and** manager: characters evolve over time (Karma, gear, nuyen, wounds) and are used at the table.
- U3. New-character screen: sourcebook picker (ALL toggle at the top; core book always on, can't be turned off),
  handle (required), government name (optional). Then the core-book steps. Enabled books may add **alternate
  generation methods**, offered as choices.
- U4. Build from scratch **or** start from an archetype.
- U5. Exports: PDF (official-sheet look, no FASA art or logos), Foundry JSON (100% round-trip both ways), plain-text/
  Markdown stat block, one-page table card. Later: share link.
- U6. Themes: old-school terminal, cyberpunk, cybernoir, GeoCities retro. Themes change the look only.
- U7. Vehicle Workshop included: vehicles built on their own, attachable to characters.
- U8. Creator and Foundry hold **copies**. Import over an existing character warns and asks first; no live sync.
- U9. Content: the same data the Foundry compendia already carry (stats, names, page references); no book prose
  copied in beyond what the compendia hold.
- U10. Later, not v1: social login (Google etc.), personal library with public copies, campaigns/GM layer.
- U11. **Shadowland banter** in the builder (2026-11-12, a must): in-character BBS-style commentary on choices
  (`>>>>>[ … ]<<<<< —Handle`), shown in the builder only, never printed on sheets or exports. Banter is data
  (`banter/*.json`, keyed to steps, items, metatypes, choices), so it can be toggled and swapped. Default set is
  ORIGINAL writing in the style with our own handles; quotes from the books only in the full-content mode (U12).
- U12. **Copyright-friendly mode** (later, to think through): a run mode with reduced content exposure. Design
  hook now: every piece of book-derived text (descriptions, book banter) is tagged with its source so a mode can
  filter it; stats and page references stay.
- U13. Auth v1 = invite-only local accounts (accepted 2026-11-12). Repo name `sr2e-chargen` (accepted).
- U14. **Voice: ham it up.** The site greets visitors with "Hoi chummer!" (the user may use it as the domain or
  subdomain). Copy across the app is in-world street slang, matching the banter (U11); errors, empty states and
  buttons included, as long as the meaning stays clear.
- U15. Ships as a Docker image. SQLite on a mounted volume to start; a supported path to Postgres (preferred) or
  MySQL/MariaDB later.
- U16. Multiple character sheet styles; the user likes the Pink Fohawk / Mel sheet in particular.
- U17. Up-to-date packages and current methods throughout; security is a must (recent wave of vulnerabilities).
- U18. Everything on a sheet must be easily readable and fit its area: no words cut off for lack of space.
- U19. Cite book and page for items (and rules) during creation, as Foundry does today.
- U20. Multi-page sheets are acceptable (one page would be nice, but not at the cost of fit/readability).
- U21. Players will print the PDFs: sheets designed for paper (Letter/A4, margins, B&W legible, ink-saver).
- U22. Toggle for dyslexia-friendly fonts on sheets and the site. More accommodations (site and sheets) to look
  at later.
- Graphics: see `docs/GRAPHICS.md` (Codex consult + what we adopt).
- Also accepted: always-on rules panel with page references, in-app dice with a log, history/undo, portrait upload
  exported as a Foundry token, GM NPC builder, phone-friendly viewing.

## The central problem: one set of rules in two places

"Rules accurate" and "100% Foundry compatible" both mean the creator must compute **exactly** what the system
computes. Today:

- **Pure already:** `module/rules/*.mjs` (≈ 15k lines incl. `sr2e-rules.mjs` 4.5k: priorities, Skill Web, pricing,
  grades, Edges) and most of `module/config.mjs` (tables). Imports only each other; two `Hooks.callAll` lines in
  config.mjs are the only Foundry calls.
- **Not pure:** the character's derived state lives in `module/data/actor-data.mjs` (2.6k lines) and
  `item-data.mjs` (1.6k) as Foundry `TypeDataModel` methods (`prepareDerivedData`, `_applyRacialModifiers`,
  `_calculateAttributeValues`, `_calculateDicePools`, `_calculateArmor`, `_collectItemModifiers`, …), plus Active
  Effects. Foundry's own code can't be shipped in the creator (licence), so these can't run there as-is.
- The in-system chargen budget (`chargenBudgetOf`, `priorityTableFor`) sits in `sheets/actor-sheet.mjs` and reads
  `CONFIG`.

**Decision D1: the system repo is the shared package.** No third repo. Derived-state logic moves out of the data
models into pure functions (`module/derive/*.mjs`) that take plain `{system, items}` objects; the data models
become thin callers. The creator imports the system's `module/rules`, `module/derive` and the static tables
directly, pinned to a system version. They come as a **code-only package** built by the system's release
workflow from the same tag (`sr2e-core-<version>.tgz`, an allow-list of `module/rules`, `module/derive`,
`module/portable`, `schema` and the static tables; never `packs-src` or assets), attached to the GitHub release;
the creator's CI inspects the final image layers and fails on any excluded path (round 2 #8). Rejected: copying the math (drifts — this
estate has been bitten before); a separate `sr2e-core` package (a second release train for no gain); shimming
Foundry's DataModel (fragile, and the licence problem).

**D2: extraction is behaviour-preserving and incremental.** One derivation at a time, each landing as a normal system
release: the existing 1,615 unit tests + Quench batches must stay green, plus a new **parity test** per extracted
piece (Foundry path vs pure path on every pregen in `packs-src/runners` and the module archetypes). Only what the
creator needs is extracted, in this order: attributes (racial, ware, limbs) → Essence/Magic/Body Index → initiative
& Reaction → dice pools → armor → condition monitors → chargen budget. Matrix/vehicle-in-play/combat derivations
stay in the system.

**D3: Active Effects.** The creator cannot run Foundry AEs. Rule: every effect that changes a *character's* numbers
must be expressible as data the pure derive layer reads (item fields — already the norm, e.g. `ware-rules`,
`quality-rules`). Audit step: list every AE the system creates on characters; each is either (a) already derived
from item data (fine), (b) transient play state (wound/drug/spell-sustain — carried through JSON opaquely, see D5),
or (c) needs converting. Category (c) is a blocker list for v1, fixed in the system first.

**D9: the derivation context is explicit** (round 1 #1). The data models read more than `{system, items}`: flags
(event records, shapeshifter/healing/permanent-damage state), effect-backed records (`recordEvent` markers), the
actor's uuid, world time, world settings, and tables that content modules register at `init`. The pure layer takes
ONE argument, `DeriveContext = { source, system, items (prepared), effects, flags, uuid, now, settings, registries }`
(round 3 #2: `source` is the immutable actor and embedded-document source, separate from the prepared working data,
because derivations read `_source` and restore from it between preparations; parity tests include removing a
derivation mechanism and preparing twice), built
by a Foundry adapter in the system and by the creator's own adapter. Each derive function declares which keys it
reads; a parity test fails if a function reads a key it didn't declare. Effects: the context carries the
character's Active Effects as data, and the pure layer applies only the **supported semantics** (the system's own
AE keys listed in its CLAUDE.md: `system.<attr>.mod`, `reaction.mod`, `initiative.mod`, `armor.ballistic/impact`, with
ADD/OVERRIDE modes). Any other effect is **unsupported**: the creator shows the affected values as "as last computed
in Foundry" (from the export) with a warning, and never edits them.

## Portable character JSON (the interchange)

Keeps the 2026-07-17 envelope (`schema`, `schemaVersion`, `systemVersion`, `modules: {id: version}`, `exportedBy`,
`metadata`) but changes what it holds (round 1 #3, #4):

- **A bundle, not one document.** `linkedVehicles`, `controlledVehicles` and `boundSpirits` are references to OTHER
  actors, so an export is a **document graph**: the character plus every actor it references (vehicles, drones,
  bound spirits), each a `document` with a stable `portableId`. References inside documents are rewritten to
  `portable:<portableId>` on export and remapped to new or existing ids on import; a document referenced twice is
  stored once; a reference to something not exported is listed in `unresolved[]` and shown on import.
- **Lossless by construction.** Each document carries its **complete source** (`source`: Foundry `toObject()` of the
  actor and every embedded item and effect, flags included), plus a `portableId` per embedded item. The creator
  never drops anything it doesn't understand.
- **Field ownership.** A schema file lists the paths the creator OWNS (attributes, skills, item quantities, nuyen…);
  the creator edits only those, in the source itself. Edits are recorded as a patch (`edits[]`: path, before, after)
  so an import can show them. Deleting an item is an explicit `deleted[]` entry (portableId), confirmed on import.
  Identity: an import over an existing actor matches items by `portableId` (stored as `flags.sr2e.portableId` in
  Foundry): matched → updated in place (keeps the Foundry id), unmatched → created, `deleted[]` → removed.
- **Embedded items are authoritative** (round 1 #5). On import, an item's `source` compendium UUID only restores its
  provenance link (`_stats.compendiumSource`); its data is never replaced by the installed compendium's. Bringing a
  character's items up to a newer compendium is a separate, explicit "update content" action, item by item, later.
- **Assets** (round 1 #6). Portrait and token images travel in the export as files: the export is a zip
  (`<handle>.sr2e.zip`: `character.json` + `assets/`); JSON-only export stays available without images. Archive
  import (round 2 #6) is streaming and bounded in BOTH apps: at most 64 entries, 20 MB expanded in total, 5 MB per
  entry, compression-ratio check; entry names must be plain relative paths (no `..`, absolute paths, links or
  duplicates); every image goes through the same decode/pixel/re-encode checks as an upload. Foundry
  import (GM) uploads the images to `worlds/<world>/sr2e-imports/<portableId>/` and rewrites the paths; a missing
  image becomes a warning and the default icon. The creator stores uploaded images per user (served only to their
  owner, see Security).

Additions:
- **D4** `ruleset`: the optional-rule settings the character was built under (`vehicleRuleset`, `matrixRuleset`,
  cyber/bioware damage toggles, …) and `books`: the enabled sourcebook ids. Foundry always derives under the WORLD's
  settings, so an import into a world whose settings differ lists the differences and **requires explicit
  acceptance** ("this character will be recomputed under this world's rules") before anything is written
  (round 1 #8). The creator likewise recomputes a Foundry export under the character's recorded ruleset only.
- **D10 Migrations** (round 1 #7, round 2 #5): pure, ordered document migrations in the system
  (`module/portable/migrations/`), dispatched on FOUR versions recorded in every bundle: the envelope `schemaVersion`,
  the system version (the system's existing migrations are reused through a **pure runner extracted from
  `module/migrations.mjs`** that keeps its semantics: every pending entry reads the SAME source, item migrations
  receive the owning actor's source, `addItems` creations, explicit settings/context instead of world reads; tested
  with several pending versions and embedded-item additions — round 3 #3), the Foundry core version (document format) and each content module's
  version. Compatibility: any version NEWER than the reader knows, or a module the reader doesn't have, makes the
  document view-only (never dropped); applied on read by both apps (never in place on the
  original: the pre-migration file is kept). The creator migrates stored documents in a DB transaction per document,
  keeping the previous revision. Historical fixtures (one per `schemaVersion`) are in the test suite before M1
  ships. A document from a NEWER system than the creator's is view-only (risk 3).
- **D5 One authority** (round 2 #4): each document's `source` is the ONLY authority for its data: play state
  (damage, ammo, Karma, nuyen) is read from and written to `source` at the owned paths. There is no separate
  `character.play` and no opaque `_foundry`; "unknown fields" are simply the source paths the creator doesn't own,
  carried unchanged. Anything the creator SHOWS beyond source (derived values) is a read-only **projection**.
- **D6** Vehicles, drones and bound spirits are their own documents in the graph (the bundle), referenced by the
  character, never embedded copies. A vehicle exported alone is a one-document bundle.
- **D11 Identity inside data** (round 2 #1): some Foundry state embeds actor identities in keys and values:
  `permKey(uuid)` / `shiftKey(uuid)` / `stateKey(uuid)` hashed flag keys, `recordEvent` keys like `permdmg:<uuid>:…`,
  effect `origin` uuids, item ids inside flags. The system's `module/portable` has a **typed reference adapter** per
  such kind (listed in one registry, each with a test): export rewrites them to portable identities, import rebuilds
  them for the new ids. A flag with no adapter is carried **opaquely** and never blocks an export (round 3 #1); only
  an import that changes identities (a new world, new ids) refuses when it would carry an unadaptable reference,
  naming it; same-id re-imports (backup/restore) pass.
  Embedded effects get a `portableId` like items. M1's fixtures re-import every complex character under NEW ids and
  compare the derived result.
- **D12 Prepared snapshot** (round 2 #2): the export also carries each document's **prepared** values (what Foundry
  derived) and the D9 context it was derived under, read-only. If a document holds an unsupported effect, the whole
  document is view-only in the creator (shown from that snapshot), never partially edited.
- **D13 Mutations** (round 2 #3): Foundry's update hooks keep state in step (shapeshifter damage buckets, healing
  revisions, permanent-damage episodes, ware lifecycle records). The manager may apply a mutation only through a
  **shared transition function** extracted to the system (`module/derive/transitions/*.mjs`, the hooks become thin
  callers, parity-tested like D2). A mutation without one is blocked on the characters it would affect (e.g. no
  damage entry on a shapeshifter until its transition exists). v1 ships transitions for damage, Karma, nuyen,
  purchases and ammo. **Importing never replays transitions** (round 3 #4): Foundry import writes the bundle's final
  source in a validated import mode (`{ sr2eImport: true }` on the writes), which the system's gameplay hooks skip
  (they already skip their own clock/receipt writes the same way), so no consequence is generated twice. Edited
  round-trip tests cover damage, ware changes and purchases.
- **D7** The schema lives in the **system** repo (`schema/*.json` + `module/portable/*.mjs` export/import + migrations),
  because Foundry must read and write it too. Round-trip tests run in the system's CI and the creator's CI against
  the same fixtures.
- **Permissions and rich text** (round 1 #12): Foundry import never restores the exported `ownership` map; the
  importing user owns the actor (GM default otherwise). Biography/notes HTML is kept raw in `source` and only ever
  displayed in the creator after sanitising (an allow-list sanitiser, server-side); exports carry the raw value.

## Content catalog

The creator reads the same `packs-src` JSON as the system and the content modules (system + 13 sourcebook modules;
adventure modules excluded) and builds one indexed catalog per book: items with their compendium UUID (so `source`
links back), plus the module's metatypes, qualities, traditions, archetypes. Book ids = module ids; the core book =
the system.

**Distribution** (round 1 #15): the Docker image ships **no book content**. The catalog is built at start-up from a
read-only content mount (`/content`, the owner's own checkouts of the repos at pinned tags), so the published image
carries only code. Catalog routes are authenticated like everything else. The U12 hook is implemented in the catalog
build (M3): every text field is tagged with its book, so a reduced-content mode is a filter, not a rewrite.

Book text (U9): the catalog includes only what the compendia hold. Descriptions longer than a summary are not
added; page references are shown everywhere.

### Citations (U19)

Every catalog entry, chargen step, rule message and alternate method shows **where it comes from**: a short badge
(`SSC p.59`, `R2 p.14–16`) with the full book title on hover. Citations survive copyright-friendly mode (U12).

Today Foundry cites pages as free text inside `notes` (e.g. "…(SSC p.59)."): 501/651 system items, 285/317 R2,
all of Shadowtech and Grimoire; only qualities have a structured `source` field. That's readable but not
dependable data. So:
- **D8** a structured `citation: { book, page }` (book = module/book id, page = string to allow ranges) on every item
  type in the **system's** item schema (blank allowed), carried in the portable JSON, shown as a badge on Foundry
  item sheets too;
- a one-off backfill script per content repo parses the existing notes, writes `citation`, and reports items with
  no page or more than one candidate; the reported gaps are filled from page renders (never pdftotext), then each
  repo's `validate` fails on a catalog item without a citation;
- one book table (id, abbreviation, full title, PDF page offset) in the system, used by both apps.
- Later, optional: "open my PDF at this page" for users who own the book (per-user PDF path + the offset table).



Step list follows the core book's chargen chapter (exact order and page refs captured from renders in M0, never
from memory or pdftotext):

1. **Start**: books (ALL toggle, core locked on), handle, government name, generation method (core Priority system;
   others from enabled books, e.g. Shadowrun Companion's alternative creation — verify which books define methods
   in M0), "from scratch" or archetype.
2. Priorities (or the alternate method's equivalent).
3. Metatype (incl. book metatypes, e.g. Companion; shapeshifters per the system's rules).
4. Magic: tradition, totem, adept powers, spells, foci, bonding.
5. Attributes.
6. Skills, specialisations, concentrations, languages, Knowledge; Skill Web shown.
7. Edges & Flaws / qualities when a book enabling them is on.
8. Resources: cyberware/bioware (grades, Essence, Body Index), weapons, armor, gear, vehicles (opens the Workshop),
   programs/decks, contacts, lifestyle. Uses the system's pricing (list price at chargen, as the system does).
9. Finish: starting nuyen from the lifestyle roll and leftover-nuyen rule (verify page), derived stats review,
   portrait, notes. "Finish creation" freezes the chargen budget (the system's `chargen.inProgress = false`).

Always visible: the **rules panel** — budget left per category, every error/warning with its page reference, coming
from the same validation functions the system's chargen uses. Steps can be revisited; later steps re-validate.

Archetypes (U4): pick one, then edit freely; validation still applies (archetypes that break the rules RAW are
flagged, not blocked).

## Manager (after creation)

v1: Karma (earn, spend on attributes/skills/initiation with the book's costs — verify pages), nuyen ledger, buy/sell
gear (reuses the system's purchase rules: street index, grades, second-hand), damage tracking, ammo, notes,
history. Every change is a ledger entry, committed in ONE transaction with the new document revision (round 1 #9):
documents carry a revision number and every write is conditional on it (optimistic concurrency: a stale tab gets
"someone changed this, reload"); every mutation carries an idempotency key, so a retried purchase never charges
twice. Undo is a **compensating change** (the inverse entry, re-validated by the rules: you can't un-spend Karma that
a later purchase relied on), never a rewrite of history. In-app dice and their log (accepted list) are part of M6.

## Vehicle Workshop

The system's `module/rules/vehicle-design.mjs`, `vehicle-custom.mjs` and the R2 module's design tables, under the
same D1 rule (import pure code; extract anything still tied to the data model). Vehicles are their own documents in
the library; "attach to character" adds a reference from the character to the vehicle document (D6), the same way
Foundry links a vehicle actor. Core vs Rigger 2 design follows the
character's `ruleset`.

## Exports

- Foundry JSON (character, vehicle) — the canonical format.
- PDF, in **several sheet styles** (U16), all drawn by a dedicated renderer from the derived character (server-side),
  never printed from the page; overflow pages for long lists. One sheet model (sections + values from the derive
  layer), one template per style:
  - **Classic**: a functional recreation of the official SR2 sheet (no FASA art or logos).
  - **Fohawk**: the 2026 Pink Fohawk sheet (`sr2e-pink-fohawk/tools/gen-sheet.mjs`, Mel Offaleater): black angled
    section bars, magenta accents, portrait header with handle / a.k.a. / priorities, big attribute row, condition
    monitor boxes, attacks with computed damage codes, Essence/Body Index. Its SVG → PDF approach (librsvg) is the
    starting point. Note: that script re-implements the attribute maths by hand ("mirrors
    CharacterData#_calculateAttributeMods") — exactly the drift D1 removes; its port reads the derive layer.
  - Later: sheets matching the app themes (terminal, cybernoir…), all from the same sheet model.
  - **Fit rule (U18), every style:** nothing is ever cut off, clipped or ellipsised. Text is measured with the
    embedded font's real metrics (fontkit/opentype) before layout. Order of fixes when it doesn't fit: wrap onto
    more lines in its box → reduce size toward a readable floor (design target 9–10 pt body; 8 pt body / 6.5 pt labels are
    emergency floors, never below) → the
    section continues on an overflow page with a "continued" marker. Fonts are embedded, never system fallbacks.
  - **Pages (U20):** multi-page is fine. Page 1 holds what's needed at the table mid-fight (attributes, pools,
    initiative, condition monitors, armor, attacks, active skills); later pages hold ware, gear, magic, contacts,
    vehicles, notes. A short character fits on one page; the layout never squeezes past the size floor to get there.
    The separate one-page table card (export) is the "one sheet at the table" option, with its own content budget.
  - **Print (U21):** players print these. Every style is designed for paper first:
    US Letter and A4 (chosen per user; layout reflows, never scaled to fit), safe margins ≥ 0.5 in / 12.7 mm for
    home printers, vector text and lines (raster only for the portrait), black-and-white legible (nothing conveyed by
    colour alone; accents also differ by weight/shape), condition-monitor boxes and tick areas large enough to mark
    in pencil, white or near-white page backgrounds. Heavy-ink styles (Fohawk's black bars) get an **ink-saver**
    variant: outlined bars, same layout. Fit test (below) runs on both paper sizes.
  - **Readable fonts (U22):** a per-user setting (also offered on each PDF export) to use a dyslexia-friendly font
    on sheets **and** the site: OpenDyslexic, Atkinson Hyperlegible or Lexend (all SIL OFL; licences re-checked when
    bundled), with slightly wider letter/line spacing. Research on which helps is mixed, so it's the user's choice,
    not one forced font. These fonts run wider, so the fit rules and the fit test apply per font: every style ×
    paper size × font must pass.
  - **Fit test** (round 1 #14): the renderer reports every text run it placed, with its box measured by the SAME font
    files and engine that draw it. CI renders every style × paper size × font for every fixture plus a stress set
    (longest real item names in the catalog, 40-char handles, maximum skills/ware/contacts, long notes) and fails if
    (a) the set of placed strings differs from the sheet model's strings (nothing omitted), (b) any glyph is missing
    from the embedded font (then a fallback font is embedded, never a tofu box), (c) a box leaves its area or a run
    is under the size floor. A single row too long for any page area is split across a continuation page. A visual
    snapshot per style/fixture is kept for review.
- Markdown / plain-text stat block; one-page **table card** (PDF, round 2 #10): the at-the-table subset named in
  GRAPHICS.md (attributes, pools, initiative, monitors, armour, attacks, active skills, key ware/spells), with an
  explicit **content budget**: the user ticks which attacks/skills/ware/spells go on it, a live fit preview shows the
  page, and an overfull selection can't be exported (untick something). Everything stays on the multipage sheet.

## Architecture

- **Server:** Node (the Active LTS line at build time, checked in M3, not assumed), Fastify. Documents stored as the portable JSON + a ledger table.
- **Delivery (U15):** one Docker image (published to GHCR by CI on release) + a `docker compose` example. Config by
  environment variables only (`DATABASE_URL`, secrets, base URL).
- **Datastore (U15):** SQLite to start, the file on a mounted volume (`/data`).
  Must be movable to **Postgres** (the user's preference) or MySQL/MariaDB later:
  - one query layer for all three (Kysely), dialect-neutral migrations, no SQLite-only SQL; JSON documents in a
    column that is `TEXT` on SQLite, `LONGTEXT` on MySQL/MariaDB (MySQL `TEXT` stops at 64 KB; round 4 #1) and `jsonb` on
    Postgres, with an application maximum document size that every dialect's CI copy test exercises, read and written only through the query layer;
  - ids are UUIDs generated in the app, not autoincrement, so rows copy across unchanged;
  - `chargen db copy` (round 1 #10) puts the app in **maintenance mode** (read-only) first, copies every table, and
    compares a canonical checksum per table (rows serialised in id order); the source DB is never modified, so
    rollback is "point `DATABASE_URL` back". Switching is then just changing `DATABASE_URL`;
  - CI runs the server test suite against SQLite, Postgres **and** MySQL (service containers) from day one;
  - **Backups** (round 2 #9: the database AND the uploaded assets, as one set with a manifest of asset checksums):
    nightly consistent snapshots (`VACUUM INTO` for SQLite, `pg_dump`/`mysqldump` otherwise) plus the asset files, written to a
    `BACKUP_DIR` that the docs require to be a DIFFERENT volume or host path; a restore test runs in CI, and the admin
    CLI has `backup verify` (restores into a scratch DB and compares checksums).
- **Client:** Vite + Svelte (small, fast; wizard + themes are mostly CSS). Shared code is plain ESM, imported by both.
- **Auth v1 (U13):** invite-only local accounts (username + password, argon2id), each user sees only their own
  library. Lifecycle (round 1 #11): an admin CLI in the image (`chargen admin`) bootstraps the first admin (prints a
  one-time setup link), creates/lists/revokes invites, disables accounts and issues single-use password-reset links
  (no email in v1). Invite redemption is atomic (one transaction, unique token). Sessions are server-side rows:
  idle expiry 7 days, absolute 30 days, all of a user's sessions revoked on password change or account disable.
  Social login (OIDC) in a later iteration replaces/joins it.
- **Themes:** CSS custom-property token sets; one layout. The readable-font setting (U22) overrides every theme's
  fonts, including the terminal and GeoCities ones. Every theme meets WCAG AA contrast and honours
  `prefers-reduced-motion`; checked by an automated contrast test.
- **Phone:** responsive viewing and play tracking; the full wizard is desktop-first but usable on a tablet.

## Security & currency (U17)

Built current and kept current; security is a requirement, not a pass at the end.

**Versions.** Every runtime, framework and library at its latest stable release when M3 starts, each confirmed
against the project's own release page at that moment (not from memory). Prefer the platform over packages
(`node:crypto`, `fetch`, `node:test` where it fits); every dependency must earn its place (logged in
`docs/DEPENDENCIES.md` with why).

**Supply chain** (the recent npm worm/compromised-maintainer attacks are the threat model):
- exact versions + committed lockfile; `npm ci` only; install scripts off (`ignore-scripts=true`, allow-list the few
  that need them);
- Renovate/Dependabot with a **minimum release age** (e.g. 7 days) so a freshly hijacked release never lands
  automatically; security fixes fast-tracked by hand after review;
- CI: `npm audit` + OSV-Scanner, CodeQL, secret scanning + push protection, Dependabot alerts on;
- GitHub Actions pinned to commit SHAs, `permissions:` least-privilege per job, no `pull_request_target`.

**Container:** small base (distroless or Alpine/Chainguard Node) pinned by digest; non-root user; read-only root
filesystem with only `/data` writable; no shell tools beyond need; image scanned (Trivy) in CI and **fails on
High/Critical**; SBOM attached; image signed (cosign, keyless via GitHub OIDC); weekly rebuild for base-image patches.

**Application** (OWASP ASVS Level 2 as the checklist; `docs/THREAT-MODEL.md` written in M3):
- auth: argon2id; invite tokens single-use and expiring; login rate limiting + lockout; sessions in HttpOnly,
  Secure, SameSite=Lax cookies, rotated on login; CSRF protection on every state-changing request;
- authorization on every document read/write (owner check in one place, tested), never by guessable id alone;
- every API input validated by schema (Fastify JSON Schema); **JSON import** is untrusted: size cap, full schema
  validation, prototype-pollution-safe parsing, unowned source fields carried unchanged and never executed;
- portrait upload: size/type caps AND a decoded pixel limit (`limitInputPixels`), re-encoded (sharp) to WebP with
  metadata stripped, in the SAME bounded, killable subprocess queue as PDF rendering (memory/time limits, per-user
  admission limits; round 5 #4), archive images included; user SVG never accepted; served only to the owner;
- denial of service (round 1 #13, round 2 #7): PDF rendering runs in a separate **killable child process** (native
  SVG/image code isn't bounded by worker-thread limits) with OS-enforced memory and CPU-time limits (`ulimit`-style
  via the container, plus a wall-clock kill), bounded input and output sizes, through a bounded
  queue (one or two at a time, per-user rate limit), with a page cap; a render that hits a limit FAILS with a clear
  message, never returns a truncated sheet;
- PDF/SVG sheets: all user text escaped for XML; the SVG renderer runs with external resources disabled (no
  user-controlled hrefs);
- strict Content-Security-Policy (no inline script, no `eval`), plus HSTS, frame-ancestors none, nosniff, Referrer-
  Policy; themes are CSS only;
- no secrets in the image or repo (env/Docker secrets); logs never contain passwords, tokens or session ids;
- TLS terminates at the user's reverse proxy; the app trusts proxy headers only from it.

**Process:** each milestone's Codex code review includes a security pass; `/security-review` before every release;
dependency and image scan results are release gates.

## Milestones

- **M0 Source capture** — render the core chargen chapter, Karma/advancement, lifestyle/starting nuyen, and every
  enabled book's alternate creation rules; write the step list and page refs into `docs/RULES-CHARGEN.md`.
- **M1 Schema + Foundry export/import** (system repo; useful on its own as character backup). Import is
  **recoverable** (round 4 #2): a preflight validates the whole bundle (schema, versions, references, assets, ruleset
  acceptance) before any write; identities are reserved; the original source of every document it will overwrite is
  journalled (`flags.sr2e.importJournal` on a world document); before EACH mutation the journal records the write's
  INTENT and its reserved ids, and recovery reconciles against the actual world state with idempotent operations (a
  create with a reserved id is detected, not repeated), so the gap between a write and its journal entry is safe
  (round 5 #2). The affected actors are **fenced** for the whole import and recovery (round 5 #1): a fence flag the
  system's gameplay writers and reconcilers (move-by-wire `reconcile`, healing clock, permanent damage, astral
  forms, …) check and skip, on every client, after draining their pending work; rollback refuses if a fenced actor
  changed outside the import. Failure-injection tests stop it before and after each journal acknowledgement.
  **Clocks** (round 5 #3): timed state stored as world-time instants (healing `dueAt`, move-by-wire `since`, …) has a
  typed timestamp adapter (D11's registry) that exports REMAINING durations and re-anchors them to the destination
  world's clock on import; fixtures import into a world whose time differs. the bundle format with
  references, assets zip, field ownership, `portableId`, D10 migrations + historical fixtures, ruleset acceptance on
  import, round-trip Quench + unit tests over all pregens AND edited round trips (edits, deletions, unknown module
  data, shared references).
- **M1b Citations** (system + content repos): the D8 `citation` field, the book table, the backfill scripts and the
  `validate` rule.
- **M2 Derive extraction** (system repo, several small releases per D2): **item preparation first** (item-data's
  ratings, costs, derived fields), then the actor derivations, all behind D9's `DeriveContext`; **module
  registration as pure adapters** (each content module exports a `register(registries)` usable outside Foundry,
  versioned with the module); the AE audit (D3); Node AND browser import tests. **Gate:** parity fixtures beyond the
  pregens — edits, item removals, repeated preparation (the derived-state-clearing trap), effects on/off, and
  module-enabled characters — must pass before M3 starts.
- **M3 Creator skeleton**: repo, Docker, auth lifecycle + admin CLI, library with revisions, catalog build from the
  content mount (with U12 source tagging), backups, one theme.
- **M4 Core build flow** (Priority system, all steps, rules panel), archetypes, JSON/zip export/import, and the
  **Shadowland banter** (U11, round 4 #3): `banter/*.json` data keyed to steps/items/metatypes/choices, an original
  starter set in our own handles, the on/off toggle, and a test that no banter text appears in any export or sheet.
- **M5 PDF + text exports** (renderer subprocess, fit test, table card with content budget).
- **M6 Manager** (Karma, nuyen ledger, purchases, damage, history/undo as compensating changes, in-app dice + log).
- **M7 Sourcebooks**: book toggles across the catalog, alternate methods, book metatypes/qualities.
- **M8 Vehicle Workshop** (round 3 #5): first extract the vehicle preparation the Workshop needs (design stats,
  `applyModEffects`/`effective*`, capacity, validation) behind the same DeriveContext and parity tests; live-play
  vehicle calculations (chase, damage) stay in the system.
- **M9 Remaining themes, portrait/token export, NPC builder.**
- Later: social login, public copies, campaigns.

Each milestone: plan section → Codex review → build → Codex code review → release, as in the system.

## Testing

- Parity tests (D2) in the system: Foundry derived state == pure derive output for every fixture.
- Round-trip tests in both repos on shared fixtures: Foundry → JSON → Foundry is identical (every document's source, under new ids too);
  creator → JSON → creator identical; creator → Foundry → creator identical.
- A "complex characters" fixture set: magician with foci and bound spirits, rigger with drones and a custom vehicle,
  cyber-heavy samurai with second-hand/grade ware and limbs, decker with a custom deck, shapeshifter.
- Rule tests for each chargen step against book examples (pages from M0).

## Risks / open questions

1. **Extraction risk to the live system** (D2): the derived-state code is the system's core and has had subtle
   ordering bugs (derived state must be cleared; schema-default traps). Mitigated by parity tests and small releases,
   but it is the biggest cost in the project.
2. **AE audit** (D3) may find character numbers that only exist as AEs; each needs a system change before v1.
3. **Version skew**: a character exported from a newer system than the creator's pinned version. Rule: refuse to
   *edit* (view only) and warn when `systemVersion` is newer than the creator's; Foundry likewise for the reverse.
4. Alternate creation methods: which books define them, and how much is rules vs. GM option — M0 decides.
5. Book-content redistribution: the image carries none (content mount); whether a friend's server may hold the
   content is the owner's call, outside this plan.

## Out of scope (v1)

Social login, public sharing, campaigns/GM layer, live sync with Foundry, NPC/critter/spirit authoring beyond the
GM NPC builder (M9), Matrix host/IC design, desktop app.
