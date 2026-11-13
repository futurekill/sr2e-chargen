# Plan: SR2E Character Generator & Manager (standalone)
_Draft 1, 2026-11-12, by Claude. Not yet Codex-reviewed. Supersedes the 2026-07-17 design doc
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
directly, pinned to a system version (git dependency on a release tag). Rejected: copying the math (drifts — this
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

## Portable character JSON (the interchange)

Keeps the 2026-07-17 design: `schema: "shadowrun2e-character"`, `schemaVersion`, `systemVersion`, `exportedBy`,
`character` (authored values only, never derived), `items[]` (each with stable `portableId`, `type`, `name`,
authored `system`, `source` compendium UUID), `metadata` (created/modified, portrait, warnings), and `_foundry`
(opaque side channel: actor/item ids, flags, AEs, token, ownership — the creator never edits it, always returns it).

Additions:
- **D4** `ruleset`: the optional-rule settings the character was built under (`vehicleRuleset`, `matrixRuleset`,
  cyber/bioware damage toggles, …) and `books`: the enabled sourcebook ids. Import into a world with different
  settings shows a warning listing the differences; it never silently recomputes.
- **D5** Play state (current damage, ammo loaded, sustained spells, drug states, bound spirits' services) round-trips
  through `_foundry` when the creator doesn't model it, and through `character.play` for what it does model (v1:
  Physical/Stun damage, Karma pool, nuyen, ammo counts).
- **D6** Vehicles are a sibling document (`schema: "shadowrun2e-vehicle"`) using the same envelope; a character
  embeds owned vehicles by value with their own `portableId`, matching how the system stores rigger-owned vehicles
  (to verify in M1).
- **D7** The schema lives in the **system** repo (`schema/*.json` + `module/portable/*.mjs` export/import + migrations),
  because Foundry must read and write it too. Round-trip tests run in the system's CI and the creator's CI against
  the same fixtures.
- Compendium content: on import into Foundry, items relink to the live compendium entry by `source` when installed
  (as in the original plan); otherwise the embedded `system` is kept and a warning added.

## Content catalog

The creator reads the same `packs-src` JSON as the system and the content modules (system + 13 sourcebook modules;
adventure modules excluded). A build step (`npm run catalog`) pins each repo at a release tag and produces one
indexed catalog per book: items with their compendium UUID (so `source` links back), plus the module's metatypes,
qualities, traditions, archetypes (`runners`, `csh-archetypes`). Book ids = module ids; the core book = the system.

Book text (U9): the catalog includes only what the compendia hold. Descriptions longer than a summary are not
added; page references are shown everywhere.

## The build flow (creator)

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
history. Every change is a ledger entry → history/undo and snapshots for free.

## Vehicle Workshop

The system's `module/rules/vehicle-design.mjs`, `vehicle-custom.mjs` and the R2 module's design tables, under the
same D1 rule (import pure code; extract anything still tied to the data model). Vehicles are their own documents in
the library; "attach to character" copies them into the character (D6). Core vs Rigger 2 design follows the
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
- Markdown / plain-text stat block; one-page table card (PDF).

## Architecture

- **Server:** Node 22, Fastify. Documents stored as the portable JSON + a ledger table.
- **Delivery (U15):** one Docker image (published to GHCR by CI on release) + a `docker compose` example. Config by
  environment variables only (`DATABASE_URL`, secrets, base URL).
- **Datastore (U15):** SQLite to start, the file on a mounted volume (`/data`), nightly backup to the same volume.
  Must be movable to **Postgres** (the user's preference) or MySQL/MariaDB later:
  - one query layer for all three (Kysely), dialect-neutral migrations, no SQLite-only SQL; JSON documents in a
    column that is `TEXT` on SQLite/MySQL and `jsonb` on Postgres, read and written only through the query layer;
  - ids are UUIDs generated in the app, not autoincrement, so rows copy across unchanged;
  - `chargen db copy --from sqlite:///data/chargen.db --to postgres://…` copies every table in a transaction and
    checks row counts and a checksum per table; switching is then just changing `DATABASE_URL`;
  - CI runs the server test suite against SQLite and Postgres (service container) from day one, so the second
    dialect never rots.
- **Client:** Vite + Svelte (small, fast; wizard + themes are mostly CSS). Shared code is plain ESM, imported by both.
- **Auth v1 (U13):** invite-only local accounts (username + password, argon2), each user sees only their own library.
  Social login (OIDC) in a later iteration replaces/joins it.
- **Themes:** CSS custom-property token sets; one layout. Every theme meets WCAG AA contrast and honours
  `prefers-reduced-motion`; checked by an automated contrast test.
- **Phone:** responsive viewing and play tracking; the full wizard is desktop-first but usable on a tablet.

## Milestones

- **M0 Source capture** — render the core chargen chapter, Karma/advancement, lifestyle/starting nuyen, and every
  enabled book's alternate creation rules; write the step list and page refs into `docs/RULES-CHARGEN.md`.
- **M1 Schema + Foundry export/import** (system repo; useful on its own as character backup): portable schema,
  `exportCharacter`/`importCharacter`, migrations, round-trip Quench + unit tests over all pregens.
- **M2 Derive extraction** (system repo, several small releases per D2) + AE audit (D3).
- **M3 Creator skeleton**: repo, Docker, auth, library, catalog build, one theme.
- **M4 Core build flow** (Priority system, all steps, rules panel), archetypes, JSON export/import.
- **M5 PDF + text exports.**
- **M6 Manager** (Karma, nuyen ledger, purchases, damage, history/undo).
- **M7 Sourcebooks**: book toggles across the catalog, alternate methods, book metatypes/qualities.
- **M8 Vehicle Workshop.**
- **M9 Remaining themes, portrait/token export, NPC builder.**
- Later: social login, public copies, campaigns.

Each milestone: plan section → Codex review → build → Codex code review → release, as in the system.

## Testing

- Parity tests (D2) in the system: Foundry derived state == pure derive output for every fixture.
- Round-trip tests in both repos on shared fixtures: Foundry → JSON → Foundry is identical (`_source` + `_foundry`);
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
5. GitHub repo creation (private) when 1Password is unlocked.

## Out of scope (v1)

Social login, public sharing, campaigns/GM layer, live sync with Foundry, NPC/critter/spirit authoring beyond the
GM NPC builder (M9), Matrix host/IC design, desktop app.
