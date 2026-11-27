# Plan: the NPC builder (roadmap item 8)
_Round 1 — revised after Codex r1 (docs/PLAN-npc-builder-REVIEW-LOG.md), 2026-11-27._ User decisions (2026-11-27): every user builds NPCs in their own
library (no GM role); the first release has all four core p.187 tools — start from a book NPC, the experience formula,
the Threat Rating helper, the Professional Rating. Rules: core p.187 (rendered 2026-11-27), p.68 Skill Success Table
(rendered), p.190 Team Karma; p.203–213 contact stat blocks (the system's `contact-npcs` pack).

## Goal
A user builds a non-player character for the gamemaster's story (p.187: "tailored to the story, not to a creation
system"): start from a book NPC (one of the 22 core contacts, p.203–213, or one of the 7 archetypes) or from a blank
one, edit it freely (no budget; input bounds only, below), apply p.187's experience formula, set a Threat Rating with
p.187's two helpers and a Professional Rating (1–4) — and download it as a Foundry **NPC** actor that Foundry prepares
to the same numbers the app shows.

## Rules (core p.187, rendered)
- **Experience**: "for every two years of experience the NPC has, increase the Attribute, Skill, or Resource values by
  10 percent"; past 10 years, "by 10 percent for every 4 years beyond 10". Worked example: 25 years = +50% (first 10)
  + 30% (next 15 years, "not quite 16 … so not 40") = +80%. So `pct(years) = 10·min(⌊y/2⌋, 5) + 10·⌊max(0, y−10)/4⌋`.
  The GM chooses which values grow (Attributes, Skills, Resources = nuyen); the book gives no rounding — ruling
  **R22**: each value × (1 + pct/100), rounded to the nearest whole number, halves up (p.68 "Taking the Time" rounds
  fractions to the nearest whole unit — the only rounding rule near it). The formula is applied ONCE as an operation
  (a preview first); after that the values are plain values the user can edit.
- **Threat Rating**: dice that "do not refresh", "available for multiple tests within a Combat Phase"; not added to
  Initiative; treated as Combat Pool dice for a clean miss; "if using Threat Ratings, do not use standard Dice Pools for
  that NPC". Two helpers: (1) a difficulty from the Skill Success Table, p.68 (Simple 2, Routine 3, Average 4,
  Challenging 5, Difficult 6–7, Strenuous 8, Extreme 9, Nearly Impossible 10+) → its target number; Difficult offers
  6 or 7, Nearly Impossible starts at 10 and the user may raise it; (2) the team's total Team Karma (p.190), 1 point
  per 100: `⌊karma/100⌋`. Either helper only fills the field; the user may type any whole number 0–20 (20 bounds the
  input: shortcut, the book prints no maximum).
  **The builder records the Threat Rating; it doesn't make it work in play** (r1 #8): Foundry rolls Threat dice only for
  robots and always gives an NPC a Combat Pool. The page and the exported biography say so in one line ("Threat
  Rating N: roll these dice by hand; p.187 says this NPC uses no Dice Pools"). Play support is a system follow-up.
- **Professional Rating** 1–4 (Average, Semi-Trained, Trained, Professional) with its withdrawal point shown: Light,
  Moderate, Serious wound, never (the GM "may" call a Willpower (4) Test at 1–3). Foundry's schema allows 0–6; the
  builder offers the book's 1–4 and keeps a book NPC's printed value as it is.

## Approach

### 0. System (sr2e-foundryvtt, small release)
1. `npcExperiencePct(years)`, `threatFromDifficulty(key, choice)`, `threatFromTeamKarma(k)`, `PROFESSIONAL_RATINGS`
   (rating → name, withdrawal wound) in `module/rules/npc-rules.mjs` (pure), vitests pinning p.187's 25-year example
   (80), 2/9/10/11/14 years, every p.68 row, and 0/99/100/1,950 Karma.
2. `npcDerived({ system, items, mods })` (pure) — the numbers `NPCData.prepareDerivedData` computes, for an NPC AS
   EXPORTED (r1 #5): fresh (no damage, no spent pools, not projecting, no substances), `mods` = the summed changes of
   its items' TRANSFER effects on the keys the pipeline keeps (`system.<attr>.mod`, `reaction.mod`, `initiative.mod`,
   `armor.ballistic/impact`; any other key → the page says "set in Foundry"). Out: attribute values (base + mod, floor
   1), Reaction, Initiative (base, dice), Combat Pool, Astral Combat Pool when Awakened, walk/run, armor (base + worn
   items, p.242), monitors. `NPCData` calls the same function for those numbers (spent pools, projection and
   substances stay in NPCData, around it), so Foundry and the app share ONE engine. Existing NPC Quench + vitests stay
   green; a Quench test compares `npcDerived` with the prepared actor for every contact NPC and converted archetype.
3. The Professional Rating's names and withdrawal wound on the Foundry NPC sheet (localized) — a read-only line.
   Nothing else changes in Foundry play (Threat dice for people stay manual, as today: see Risks).
The app adds `module/rules/npc-rules.mjs` to `tools/content.mjs` RULES_ENTRIES (r1 #2), pins this release, syncs it
and re-exports the helpers through `shared/rules.mjs`.

### 1. Catalog
`selected()` takes `npc` actors from the `contact-npcs` pack as `actor` entries (type `npc`). The FULL actor sources of
the 22 contact NPCs AND the 7 archetypes (r1 #3: a catalog entry is shaped data — text split out, item ids changed)
go in a checksummed `npcs.json` beside `vehicles.json`: `manifest.npcsSha256`, removed from the manifest comparison
like the other sidecar checksums (r1 #9), each source's id/name/type checked against its catalog entry. `offeredBy`: NPCs and archetypes
are never offered to a character (only the NPC picker asks for them).

### 2. The document
A fourth kind, **"npc"** (`server/library.mjs`; quotas, revisions, idempotency, archive/delete, admin counts as
every kind). Body `{ schema: "sr2e-chargen-npc", schemaVersion: 1, name, notes, source: { catalogId | null },
nextItem, actor, experience: [] }` where `actor` is the Foundry NPC actor source — the ONE authority, as the Garage.
`shared/npc.mjs`: `newNpc(entry | null, name)`, `applyNpcOp`, `npcActor(body)`, `npcBooks(body)`.
- **From a contact NPC**: its actor source as printed.
- **From an archetype** (a `character` actor, from `npcs.json`): converted ONCE by `archetypeToNpc`, which BAKES the
  prepared numbers (r1 #4: NPC preparation applies no cyberware/bioware/adept item modifiers): each attribute's NPC
  `base` = the archetype's prepared value from the app's derive (parity-tested with Foundry's character preparation),
  less any transfer-effect `mod` that the NPC will get again from the same item (none in today's packs: 0 transfer
  effects in `runners` and `contact-npcs`; a test pins that); `reaction.mod` = prepared Reaction − ⌊(Q+I)/2⌋;
  `initiative.dice` = prepared dice; armor base 0 with the worn armor items kept `equipped`; Essence (value and max),
  Magic, race, nuyen, biography as prepared/printed; every item copied (fresh `gn…` ids). The Quench test compares the
  imported NPC's prepared attributes, Reaction, Initiative, Combat Pool and armor with the archetype character's.
- **Blank**: Foundry's NPC defaults (human, every attribute 3, PR 1, Threat 0).
- **Ops** — their OWN map `NPC_OPS` and route `POST /api/documents/:id/npc-ops` (r1 #1: `setMagic`/`addItem` exist in
  the character's OPS; the two schemas never mix), field types as `VEHICLE_OPS`: `setName`, `setNotes`, `setRace` (the system's race
  keys), `setAttribute {attr, base}` (1–99), `setEssence`, `setMagic {value, tradition, type}`, `setArmor {ballistic,
  impact}`, `setInitiativeDice` (1–5), `setNuyen` (0–1e9), `setProfessionalRating` (1–4), `setThreatRating` (0–20),
  `addItem {catalogId, rating?}` (any catalog item type an NPC can hold in Foundry, every book — the GM's NPC needs no
  book toggle; the items keep their citation), `setItemRating {itemId, rating}` (skills, rated gear), `setEquipped {itemId, equipped}` (armor and weapons — the
  only item states NPC preparation reads; r1 #6), `removeItem`,
  `applyExperience {years, attributes: bool, skills: bool, resources: bool}` (1–60 years; at least one target; records
  `{years, pct, targets, at}` in `experience`). Item ids `gn…` from `nextItem`, as `gv…`. Caps: 200 items.
- **Bounds** (r1 #7): Foundry sets no attribute maximum; the app's bounds are input bounds only (shortcut: 1–99
  attributes, 0–99 skills, 0–20 Threat; raise them if a book prints more). Experience that would pass a bound is
  refused with the value named, before anything changes.
- **Threat Rating and pools**: setting a Threat Rating > 0 shows p.187's rule ("do not use standard Dice Pools") on
  the page; the app does not change Foundry's pools (Risks).

### 3. Readers
- `GET /api/documents/:id/foundry` for an npc returns `npcActor(body)` (notes appended to `system.biography` as escaped
  paragraphs; the token name follows a rename), file name `fvtt-Actor-<name>-<doc id>.json`.
- The page shows the derived block from `npcDerived` (the system's engine): attributes, Reaction, Initiative, Combat
  and Astral pools, armor, monitors, Threat, Professional Rating and its withdrawal point, skills, items.
- Not linked to characters, never in a character's money.

### 4. Client
Library: "NPC" in the kind picker (a book-NPC picker grouped Contacts / Archetypes, or Blank). The NPC page: the
fields above, the item picker (the catalog search, every type), "Experience…" (years, three checkboxes, a preview
table of every value that changes, Apply), "Threat Rating…" (difficulty or Team Karma, fills the field), Download for
Foundry. Plain accessible forms (labels, field errors), as the Garage.

### 5. Proof
Vitests (system): the rules helpers and `npcDerived` against today's NPCData numbers. App tests: every op and refusal,
experience on a book NPC (p.187's 25 years → +80%, rounding halves up, only the chosen targets), the Threat helpers,
archetype conversion (natural values, items, effects), the export, quotas and admin counts, npcs.json checks. Quench:
the converted archetypes prepare like the originals; an exported contact NPC imports unchanged. All four databases.

## Key decisions & tradeoffs
- **Foundry NPC actor as the one authority** (as the Garage), not a new stat format.
- **One derive engine** (`npcDerived` extracted from NPCData) rather than app-side copies of the NPC math.
- **Experience applied once, then plain values** — no living "+80%" overlay to reconcile with later edits.
- **R22 rounding** (nearest, halves up) — the book prints none.
- **No book toggles on NPCs** — the GM's NPC isn't a player character; citations stay on every item.
- **Archetypes converted, not referenced** — a stat block needs no link to its origin.

## Risks / open questions
- Foundry's NPCs always get a Combat Pool and default to Threat Rating 1; p.187 says an NPC using Threat dice uses no
  Dice Pools, and Threat dice for people aren't rolled by Foundry (only robots'). Changing that is a system follow-up
  with its own plan (it touches every existing NPC); this plan only stores the numbers and shows the rule.
- Archetype conversion parity depends on the app's derive matching Foundry's character preparation (already parity-
  tested for characters); the Quench comparison is the proof.

## Out of scope
A printable NPC sheet or card (later; the Markdown stat block first); critters, spirits and IC; the "Prime runner"
grades (Companion p.84–85); Enemies (p.71–72); NPC groups; sharing NPCs with players.
