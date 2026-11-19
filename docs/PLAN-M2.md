# Plan: milestone 2 — create a character (core Priority system)
_Draft 4 (2026-11-18), after Codex rounds 1–3 (13 + 4 + 3 findings, all accepted; round 3's fixes are not re-reviewed —
the code review checks them; docs/PLAN-M2-REVIEW-LOG.md). Roadmap: docs/ROADMAP.md (approved). Rules reference: docs/RULES-CHARGEN.md (M0, read from
page renders; every rule here cites it). Catalog: docs/PLAN-catalog.md._

## Status (2026-11-18)
| Slice | State |
|---|---|
| M2a model, priorities, metatype, magic, attributes | done, pushed (docs/CODE-REVIEW-LOG-M2a.md) |
| M2b skills | done, pushed (docs/CODE-REVIEW-LOG-M2b.md) |
| M2c resources | done, pushed; its own plan docs/PLAN-M2c.md (docs/CODE-REVIEW-LOG-M2c.md) |
| M2c-2 adept powers | BUILT 2026-11-19 on the local app branch `chargen/on-0.161` (content pinned to the system's unreleased release/0.161.0 via the local tag v0.160.99); code review docs/CODE-REVIEW-LOG-M2c-2.md. Pushed after the system release (re-sync to v0.161.0 first) |
| M2d contacts, lifestyle, allergy, derived values, parity, finish | waits for the system release |
| System prerequisites (§0) | S1–S4, S6–S8 (+ S10, S11 from PLAN-M2c) and S13 built on sr2e-foundryvtt branch `chargen/s-prereqs` (local, not pushed), unit-tested, Codex-reviewed (docs/CODE-REVIEW-LOG-chargen-prereqs.md there), checked in the test world; CHANGELOG Unreleased written. NOT released — after the Friday game. S5 built on the branch 2026-11-18 (`wareEssence`, 98 cyberware Quench tests pass). S12 built in the app (weapon foci, no system change). S9 vehicles: system side built on the branch 2026-11-18 (plan docs/PLAN-S9-vehicles.md approved by the GM after 4 Codex rounds; code review log docs/CODE-REVIEW-LOG-chargen-s9.md there); the app side (vehicles.json, addVehicle) waits for the release. |

## As built (where the code differs from the text below — the code wins)
- **Priorities live on the actor**, `actor.system.chargen.priorities` (Foundry's own field), not `creation.priorities`;
  an unassigned category is `""`. `creation.options` holds `moreMetahumans`.
- **One operation per letter**: `setPriority { category, letter }` (taking a held letter swaps the two), not
  `setPriorities`. Also `setMagic`, `setTradition`, `setTotem`, `setAttribute`; skills `addSkill`, `addCustomSkill`,
  `setSkill`, `removeSkill`; resources `addItem`, `setItem { itemId, choices }`, `removeItem`.
- **Validation is in `shared/creation.mjs`** (`validate(body)`), not `shared/validate.mjs`; purchase rules in
  `shared/purchase.mjs`. Severities are `error`, `todo` (not done yet) and `warning` (legal, but probably not meant);
  finishing needs no error and no todo.
- **Records**: `creation.items[id] = { type, name, img, source, flags, catalogId, snapshot, choices }`; `actor.items` is
  regenerated from them after every operation (ids are a fixed-width counter, `cg…`, the same on server and client);
  cybereye accessories become rows of their eye.
- **The system now has `chargenBudget`** (branch): one pure whole-budget function that Foundry's panel calls. M2d
  should call it instead of the app's own mapping, so the app and Foundry agree by construction.
- **Rulings** where the book is unclear: docs/RULINGS.md.

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

### 0. System prerequisites — ONE small system release, AFTER the Friday game (round 1 #1 #2 #3 #4)
Reading the system's budget code against the book found creation rules it gets wrong or lacks. They are fixed in the
SYSTEM (one set of rules; Foundry's own creation panel is wrong in the same way today), in pure functions with tests
citing the page:
- S1. **Programs** count against Resources (`CHARGEN_RESOURCE_TYPES` lacks `program`; p.46 incidentals).
- S2. **Lifestyles** cost `monthlyCost × monthsPaid` (`chargenItemCost` reads `cost`/`quantity`, which lifestyles
  don't have, so they are free today; p.46).
- S3. **Extras** (p.43, p.46): `chargenExtrasCost(contacts, extras)` — two contacts free, each further contact
  5,000¥, one buddy 10,000¥, a gang or tribe 50,000¥, followers 200,000¥.
- S4. **Allergies** (p.46, metahumans only): the Allergy and Severity Table as `allergyBonus({ rarity, severity,
  rarityBonus, severityBonus })` → `{ attributes, skills, forcePoints, nuyen }`, added to the allotments.
- S5. Any derived value §5 needs that lives only in a Foundry data model (today `actualEssenceCost`) moves to
  `module/rules/`, the data model calling it.
- S6. **Foundry's own panel uses them** (round 2 #1): `chargenBudgetOf` (sheets/actor-sheet.mjs) passes each program's
  `multiplier`, rating AND `category` (a persona program is priced higher from rating 4, round 3 #1), each lifestyle's `monthlyCost` and `monthsPaid`, and the contact items, and its allotments
  add the allergy bonus; a test drives the WHOLE panel calculation from an actor source (program, lifestyle, three
  contacts, a buddy, an allergy, a rating-4+ persona program).
- S7. **Extras the model can hold** (round 2 #3): `ContactData.contactType` gains `gang` (a gang or tribe, core p.44);
  `buddy` and `follower` exist. A `members` number on contacts holds a gang's 2D6 members, and `archetypes` (a list of
  strings) a follower group's FIVE archetypes; the validator requires five distinct, non-blank names (round 3 #3).
- S8. **The allergy lives on the actor** (round 3 #2): `system.chargen.allergy = { substance, rarity, severity,
  rarityBonus, severityBonus }` (choice fields with `blank: true`, so existing actors stay valid); `chargenBudgetOf`
  adds `allergyBonus` from it. The app writes the player's choice THERE (not only in `creation.options`), so the
  Foundry connector carries it unchanged.
The system work is done on a branch NOW and released after Friday. The app is built in slices (§7) that compile and
pass against the CURRENT pin; a slice that imports an S-function starts only once the pin includes that release.

### 1. The rules runtime (the system's code, from the project's own copy)
- The sync (Amendment A of the catalog plan) also copies, from the SYSTEM pin only, the **dependency closure** of the
  modules the app uses (round 1 #13): starting from a short list of entry modules (`module/rules/sr2e-rules.mjs`,
  `module/rules/ware-rules.mjs`, `module/config.mjs`, …), the static imports are followed and only those files are
  copied; plus `lang/en.json` (labels the tables name by key). Same provenance check, same pull request.
- **Executable code is reviewed as code** (#13): the sync refuses a copied module that uses `import(`, `eval`,
  `Function(`, `fetch(`, `XMLHttpRequest`, `process`, `require(`, or writes to `globalThis`; and when any copied
  `.mjs` changes, the pull request is titled "Content + RULES CODE: …" and lists each changed module, so it is never
  merged as data.
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
- `actor.items[]` are plain Foundry item SOURCES (round 1 #11): `{ _id, name, type, img, system, flags, effects,
  _stats: { compendiumSource } }` — no app field inside them. The app's own record of each item is beside them:
  `creation.items: { <itemId>: { catalogId, snapshot, choices } }`, where `snapshot` is the catalog entry's
  (text-free) `system` at the time it was added and `choices` the player's (rating, grade, quantity, Force, months).
  The item's `system` is REBUILT from `snapshot` + `choices` by `shared/purchase.mjs` after every operation (#7): no
  stored price or rule field can be edited directly.
- **Book text and images** (#11): a character carries no book text (the catalog has it, by id) and keeps the
  catalog's Foundry image paths as data; the app shows no item art in milestone 2. The Foundry connector (milestone 7)
  restores text from the compendium source on import.
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
- **Core book only in milestone 2** (#5): every catalog-backed operation is refused unless the entry's `book` is the
  core book (`sr2`); milestone 5 opens the sourcebooks through the book toggles.
- **Per-type purchase projections** (#6): `shared/purchase.mjs` turns (catalog snapshot, choices, the character)
  into the item's `system` for each type — rating within the entry's range, a cyberware grade, a program's
  `multiplier` and rating, a skillsoft's category, a focus's Force and bonding cost, ammo bundles, a lifestyle's
  months — and prices it with the system's `itemBaseCost` / `chargenItemCost` and `wareCtx`, as Foundry's creation
  panel does. Only the choices listed for that type are accepted (#7).
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
- **Finish** (p.47) needs zero errors. It converts unspent Resource nuyen at 10:1, adds 3D6 × 1,000¥, sets the Karma
  Pool (human 1, metahuman 2, More Metahumans 1, p.47) and freezes creation (later changes are milestone 4's).
  - **The roll** (#10): `applyOp` stays pure — `finish` takes the dice as an INPUT. The server validates the character,
    and only then rolls 3D6 with `crypto.randomInt`, inside the library's idempotent, revision-conditional write: the
    roll is stored with the result, and a replayed request returns that stored result — never a second roll. A second
    `finish` on a finished character is refused.
  - **Playable money and state** (#9): in the same write, `actor.system.nuyen` = leftover ÷ 10 + the roll, and
    `actor.system.chargen.inProgress` = false; `creation.finished` keeps the breakdown (leftover, dice, Karma Pool).
- **Allergies** (#4): `creation.options.allergy = { substance, rarity: uncommon|common, severity:
  nuisance|mild|moderate|severe, rarityBonus, severityBonus }` (each bonus one of attributes / skills / force / nuyen);
  the system's `allergyBonus` (S4) adds to the allotments before the budgets are checked; metahumans only.
- **Extras** (#3, round 2 #3): each extra is a `contact` item in the system's own shape — a contact
  `contactType: contact`, a buddy `buddy` (an archetype at ratings 4, p.43), a gang or tribe `gang` with its 2D6
  `members` rolled once by the server when bought (as the finish roll is), followers `follower` (five archetypes named
  in the item, p.44). The system's `chargenExtrasCost` (S3) prices them; one buddy at most.
- **Lifestyle** (round 2 #2): `setLifestyle` writes the lifestyle item AND `actor.system.lifestyle` in the same
  operation; with none bought the character is on the Streets (`actor.system.lifestyle = "streets"`, p.46), never the
  system's default `low`.

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

### 5b. Every existing library route respects characters (round 1 #8)
- `PUT /api/documents/:id` (whole-body edit) is for DRAFTS only: a character changes only through `/ops`.
- Restoring a revision of a character is allowed only while it is unfinished and only to an unfinished revision
  (a restore never undoes a finish; undo after creation is milestone 4's).
- Delete and undelete work as for any document.

### 5c. Tests beyond parity (round 1 #12)
- Rule fixtures per check in §4, each with the book's own example where it has one (Firearms 5 → Firearms 3, Pistols
  5, Ares Predator 7; 15,000¥ left → 1,500¥; the Master Creation Table rows).
- Operation tests: every operation's refusals; a client trying to set a price, a cost, `allocated`,
  `freeLanguage` or a non-core item through any operation.
- Finish: the stored roll on a replay, two concurrent finishes (one wins), a finish with an error refused, the money
  and `chargen.inProgress` written in the same revision.
- Parity snapshots are reviewed when regenerated: the regeneration script prints every changed value, and the commit
  that updates them says why.

### 6. The client
- A Character page per document: the steps in order (Concept, Priorities, Metatype, Magic, Attributes, Skills,
  Resources, Contacts & Lifestyle, Finish), each a section the player can revisit; the rules panel beside it (below it
  on a phone), each problem linking to its step.
- Resources use the catalog search (milestone 1) with an "Add" button and the item's choices (rating, grade,
  quantity, Force). The running nuyen total and Essence are in the panel.
- Banter (U11) appears at the steps that have it; never on a sheet or an export.
- The library's "New" offers "Character" beside "Draft".

### 7. Slices (round 2 #4)
Each slice is a release of this app that builds, passes and works on its own, against the pin it names.
- **M2a — the model and the first steps** (current pin, v0.160.0): the rules runtime (§1, the closure copy and its
  checks), the `character` kind, its schema, the operation route and reducer, priorities, metatype, magic and
  tradition, attributes; their validation; the client's first steps. Uses only functions that exist today
  (`chargenSpend` for attributes, the tables).
- **M2b — skills** (current pin): skills, concentrations and specializations, languages; `skillChargenSpend`.
- **M2c — resources without the gaps** (current pin): buying weapons, armor, gear, cyberware (Essence), ammo, spells,
  foci through `chargenItemCost`/`wareCtx` — core book only, so no grades and no bioware (those are sourcebooks, M5).
  Details and refusals: docs/PLAN-M2c.md. Adept powers moved to M2c-2.
- **M2d — the S release** (pin moved to the post-Friday system release): programs, lifestyles, contacts and extras,
  allergies, derived values (S5) and the parity test; then finish (§4) — finishing needs every budget, so it lands last.

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
