# Plan: milestone 2 — create a character (core Priority system)
_Draft 1 (2026-11-16). Roadmap: docs/ROADMAP.md (approved). Rules reference: docs/RULES-CHARGEN.md (M0, read from
page renders; every rule here cites it). Catalog: docs/PLAN-catalog.md._

## Goal
A signed-in user creates a Shadowrun Second Edition character with the core book's Priority system, step by step,
in the browser: priorities, metatype, magic, attributes, skills, resources (gear, cyberware, spells, foci, contacts,
lifestyle), and finishing. An always-visible rules panel shows each budget and every problem with its page
reference. The finished character is a document in the user's library. Sourcebook methods, Edges and Flaws and
shapeshifters are milestone 5; the printable sheet is milestone 3; play-time management is milestone 4.

## Measured facts (2026-11-16)
- The system's 42 `module/rules/*.mjs` modules and `module/config.mjs` (82 tables, incl. `priorities`,
  `racialModifiers`, `racialMaximums`) load in plain Node with no Foundry global and no `node:` import.
- The budget is already pure: `chargenSpend` (rules/sr2e-rules.mjs) totals attribute, skill, nuyen and Force Point
  spending; `chargenItemCost` and `itemBaseCost` price items (rating, grade, second-hand, ammo bundles);
  `skillChargenSpend` charges a skill's ALLOCATION (concentrations and specializations, core p.70).
- Some derived values are computed only inside Foundry data models: the item getter `actualEssenceCost` and the
  attribute composition in `CharacterData` (racial modifiers, ware modifiers, limb averages).

## Approach

### 1. The rules runtime (the system's code, from the project's own copy)
- The sync (Amendment A of the catalog plan) also copies, from the SYSTEM pin only: `module/rules/**`,
  `module/config.mjs` and `lang/en.json` (labels the tables name by key). Same provenance check, same pull request.
- `shared/rules.mjs` is the ONE place the app imports system code from: it re-exports what the app uses and builds a
  `labels` function from `lang/en.json`. The server imports it directly; Vite bundles it for the client.
- A test fails when `shared/rules.mjs` imports something that does not exist at the pinned commit, and when the
  copied code imports anything outside `module/rules/` and `module/config.mjs`.
- Running the system's code in the app is the design (one set of rules). That code is the owner's own repository at
  a reviewed release; a sync pull request shows its code changes like any other.

### 2. The character document
- A new library kind `character`. Its body: `{ schema: "sr2e-chargen-character", schemaVersion: 1, name, creation:
  { method: "priority", options: { moreMetahumans, allergies }, priorities: { race, magic, attributes, skills,
  resources }, finished: null | { at, leftover, rolled, karmaPool } }, actor: { name, type: "character", system,
  items: [...] }, notes }`.
- `actor` uses the Foundry system's `character` source shapes (`system.body.base`, skill items, cyberware items …),
  so the system's functions read it unchanged and the later Foundry connector (milestone 7) is a wrapper, not a
  translation. The app writes only the fields creation sets; Foundry fills its defaults on import.
- Items are COPIES of catalog entries, made by the server: `{ _id, name, type, img, system, flags, effects,
  _stats: { compendiumSource }, catalog: { id, pins } }` plus the choices the player made (rating, grade, quantity,
  Force, concentration). A character keeps working when the catalog changes; the catalog id says where it came from.
- A strict JSON Schema for the body (the server's, shared with the client): known keys only, size limits, item
  count ≤ 500. Book text from the catalog is NOT copied into the character (it stays in the catalog, looked up by id).

### 3. Changes are operations, applied by the server
- The client never sends a whole character. It sends OPERATIONS: `setPriorities`, `setOption`, `setMetatype`,
  `setTradition`, `setAttribute`, `addSkill` / `setSkill` / `removeSkill`, `addItem { catalogId, rating, grade,
  quantity, force }` / `setItem` / `removeItem`, `addContact`, `setLifestyle { catalogId, months }`, `setName`,
  `setNotes`, `finish`.
- `shared/creation.mjs` `applyOp(character, op, catalog)` is a PURE reducer: it returns the new character or a
  refusal with a reason and a page. The server applies it inside the library's idempotent, revision-conditional write
  (`POST /api/documents/:id/ops`, one or more operations per request); the client applies the same reducer at once
  for a fast screen and replaces its copy with the server's answer.
- `addItem` copies the entry from the SERVER's catalog: a client can't put data into a character that isn't in the
  catalog. An item type that is not for characters (vehicle modification, race, tradition, archetype) is refused.
- Operations are refused only when they are impossible (an unknown catalog id, a rating outside the item's range, a
  skill rating below 1 or above 12). Rules a player may break while building (over budget, an attribute over the
  racial maximum) are allowed and REPORTED by the validator — the player fixes them in any order. `finish` is the
  only operation that requires a clean report.

### 4. Validation: the rules panel
`shared/validate.mjs` `validate(character, catalog)` → `{ budgets, problems: [{ step, severity: error|warning,
text, cite: { book, page } }] }`, pure, run on every change on both sides. Each rule cites RULES-CHARGEN.md's page.
- Priorities: each of A–E used once (p.44).
- Metatype: dwarf/elf/ork/troll needs Race A, or C under More Metahumans (p.44, p.46).
- Magic: full magician human A / metahuman B; adept human B / metahuman C; More Metahumans: A full, B adept (p.45–46);
  a tradition for a magician; a totem for a shaman (p.44).
- Attributes: each base ≥ 1; after racial modifiers ≤ the racial maximum and ≥ 1 (p.43, p.45); spending = the
  priority's points (p.45) — via `chargenSpend`.
- Skills: rating 1–6 at creation unless a concentration/specialization (p.45, p.70); Sorcery and Conjuring need a
  Magic Rating; spending = the priority's points via `chargenSpend`; the native language free at Intelligence + 2
  (p.74); a Street lifestyle's local dialect free at ½ Intelligence (p.74).
- Resources: nuyen ≤ the priority's via `chargenSpend` (list price, `chargenItemCost`, p.46); no gear rating above 6
  (p.43); Essence ≥ 0 (p.46); Force Points ≤ the priority's (magicians only); spell Force ≤ 6 (p.46); adept power
  points ≤ Magic (p.124).
- Contacts: two free; each further contact 5,000¥; one buddy at most (p.43, p.46).
- Lifestyle: one, or Street (p.46).
- Allergies (metahumans, p.46): one bonus category each for the allergy and the severity.
- **Finish** (p.47) needs zero errors. It converts unspent Resource nuyen at 10:1, adds 3D6 × 1,000¥ rolled ONCE by the
  server (`crypto.randomInt`, recorded with the dice in `finished`, never re-rolled on a retry), sets the Karma Pool
  (human 1, metahuman 2, More Metahumans 1, p.47) and freezes creation (later changes are milestone 4's).

### 5. Derived values (what the sheet shows)
`shared/derive.mjs` computes, for the rules panel and a summary: attributes after racial modifiers, Reaction
((Quickness + Intelligence) ÷ 2, p.45), Essence (6 − cyberware), Magic (= Essence rounded down for the Awakened,
p.45), Initiative, Combat and Magic Pools, the condition monitors.
- It composes the system's pure functions. Where a value is computed ONLY inside a Foundry data model (today:
  `actualEssenceCost`, ware attribute modifiers), that one function moves to `module/rules/` in a small system release
  — AFTER the Friday game, never before — and the app shows that value as "not yet computed" until the pin includes it.
- **Parity test**: a script run once in Foundry exports, for each of the seven pregens, the derived values Foundry
  computes (`test/fixtures/parity/*.json`, regenerated when the system pin moves). The app's `derive` must equal them,
  value by value. A difference fails CI and names the value.

### 6. The client
- A Character page per document: the steps in order (Concept, Priorities, Metatype, Magic, Attributes, Skills,
  Resources, Contacts & Lifestyle, Finish), each a section the player can revisit; the rules panel beside it (below it
  on a phone), each problem linking to its step.
- Resources use the catalog search (milestone 1) with an "Add" button and the item's choices (rating, grade,
  quantity, Force). The running nuyen total and Essence are in the panel.
- Banter (U11) appears at the steps that have it; never on a sheet or an export.
- The library's "New" offers "Character" beside "Draft".

## Key decisions & tradeoffs
- **Foundry's own source shapes as the character model**: the system's functions apply without an adapter, and the
  Foundry connector stays small. Cost: the model carries Foundry's field names.
- **Operations, not whole documents**: the server stays the authority on what a character may contain (catalog
  copies only), and the history of a character is a list of meaningful changes. Cost: an operation set to maintain.
- **Rules a player may break are reported, not refused**: building is iterative. Only `finish` enforces.
- **No duplicate rule code**: when a value can't be computed from pure system code, the system changes; the app waits.

## Risks / open questions
- The pinned system's rules may not cover a creation rule (for example the free-contact count, allergies): such a rule
  lives in `shared/validate.mjs`, cites its page, and is a candidate to move into the system later.
- Two compositions (Foundry's and the app's) can drift: the parity test is the control.
- Running copied code in the browser: the client bundle grows by the rules modules the app imports (tree-shaken).

## Out of scope
Sourcebook creation methods, Edges and Flaws, shapeshifters (M5); the PDF sheet (M3); Karma advancement and play
(M4); vehicles beyond buying a catalog vehicle; the Foundry connector (M7); archetype-based creation (a later
addition to this milestone's flow).
