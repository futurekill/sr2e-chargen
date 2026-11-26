# Plan: the Workshop (Vehicle Workshop part 2, roadmap item 8)
_Round 2 — revised after Codex r2; APPROVED by Codex r3 (2026-11-26)_

## Goal
A player designs a vehicle from scratch in the app with the Rigger 2 rules (R2 p.108–146), the same rules and numbers
as the Foundry system's Vehicle Workshop (`sr2e-foundryvtt/module/apps/vehicle-workshop.mjs`, engine
`module/rules/vehicle-design.mjs`). The design is a Garage vehicle (docs/PLAN-garage.md): it has cargo, notes, a
price, a character can buy it at creation or link it, and it exports to Foundry. The export is a vehicle that the
Foundry Workshop reopens and edits (`system.design.version 2`, `baseVersion 2`, design mods flagged
`flags.sr2e.designMod`), with the same Design Points and price there as here.

## Approach

### 0. System prep (sr2e-foundryvtt, one release, no behavior change)
1. Move the Workshop's pure parts out of the ApplicationV2 file into a new pure `module/rules/vehicle-workshop-rules.mjs`
   (no Foundry; imports only `vehicle-design.mjs`), each parameterized by what it reads today:
   - `blankDesign`, `vehicleTypeFor`, `chassisArt` (art + token footprint), `workshopUpdate` (its
     `foundry.utils.deepClone` becomes `structuredClone`);
   - `CHOICES_SCHEMA`: an explicit, versioned description of a v2 `choices` object — every key the Workshop writes
     (`blankDesign`'s plus the optional `tires`, `quality`, `dbwSplit`), each with its type, enum or range, and
     `markUp`'s booleans vs numbers told apart — and `checkChoices(choices, tables)` → list of problems. The Workshop
     doesn't call it (no behavior change); the app does at its trust boundary;
   - `designModOptions(design, tables, mods, catalogMod)` → `{ designable, problems, maxRating }` (the picker's
     `designable` flag, the build-dependent `modProblems`, `maxRating` evaluated when it is a formula, none when the
     mod has no authored maximum), as the Workshop's mod step computes them;
   - `engineMods(design, mods)`: the preview transformation the Workshop applies before `designVehicle` (design mods'
     `custom.choice` cleared so `design.dbwSplit` rules), and `choiceFor(design, mod)` (DBW's split at save, else the
     item's `custom.choice`);
   - `designFinished(result)`: `designVehicle` valid AND every resulting rating within its sane floor (Speed,
     Acceleration, Handling, Load, Cargo, Signature ≥ 0 / ≥ 1 as the stat needs). The engine checks maxima, not
     floors: with `speed: −10000` it returns Speed −9,925, valid, 4,000¥ (Codex r1 #3). The Workshop shows the
     floor problems too: a small behavior change, called out in the system CHANGELOG as a fix.
   - `effectiveVehicleStats(actorSource)`: the effective stats Foundry's `VehicleData.prepareDerivedData` derives
     (category, traits, transport, the `build` context with Body and Pilot, tires, DBW split, then
     `applyModEffects` and `vehicleCapacity`), moved out of the data model into this file; the data model calls it,
     so both sides construct the same context (Codex r2 #5).
   `vehicle-workshop.mjs` and the data model import them.
2. Vitest: `workshopUpdate` for two fixed designs (a car and a drone) pinned field by field; `checkChoices` accepts
   every design the Workshop can produce (each field at its edges) and refuses extras, wrong types, NaN, out-of-range;
   `designFinished` refuses negative results; the DBW preview vs save.

### 1. Content
1. `tools/content.mjs`: the three R2 files `data/design-chassis.json`, `data/design-powerplants.json`,
   `data/design-rules.json` join BOTH `WANTED` and `selectPaths`' keep list (today it drops anything but manifests,
   packs-src and the rules closure); `RULES_ENTRIES` gains `vehicle-design.mjs` and `vehicle-workshop-rules.mjs`.
2. `tools/build-catalog.mjs` writes a fourth artifact, `design-tables.json` (keyed as `registerVehicleDesignTables`
   keys them: `chassis`/`powerPlants` by `key`; `fuel`, `markUp` as is; the R2 pin's commit recorded), checksummed
   like the others; `server/catalog.mjs` loads and verifies it at start. Without Rigger 2 content there is no
   artifact: the design choice is hidden and design ops refuse.
3. Pin the step-0 system release and the current sr2e-rigger-2 release; parity fixtures carried with the usual note.
4. `GET /api/design-tables` (signed in): the artifact, `Cache-Control: private, max-age=3600`, ETag = its checksum.
5. The mod picker offers every catalog `vehicle_mod`, as Foundry does, each with `designModOptions` (disabled with
   its reasons when not designable here).

### 2. The document
1. Vehicle body schema version 2 adds `design`: `null` for a catalog vehicle (part 1), or `{ choices }` for a
   designed one. Reading a version 1 body treats `design` as `null`; no data migration.
2. A designed vehicle's `actor` stays the ONE exported authority, REBUILT by the reducer after every design op,
   deterministically:
   - always: a fixed minimal vehicle actor source (type "vehicle", the template defaults), `name`, `system.design`
     `{ version: 2, baseVersion: 2, choices }` (so a DRAFT still reopens in the Foundry Workshop), the design mod
     items and the cargo items unchanged;
   - only when both the chassis and the power plant rows exist: `workshopUpdate(choices, result, ch, pp, name)`
     applied as dotted paths;
   - whenever a chassis row exists (plant or not): `chassisArt(ch)`, derived on EVERY rebuild from the selected
     chassis, so no edit loses it (the art path points into the R2 module: Foundry resolves it there; the app shows no
     art in this part).
   Design mod items: the catalog snapshot (rule fields; prose stays out, as in every app export, with
   `_stats.compendiumSource` = the entry's uuid so Foundry can find the book text), `system.rating`,
   `system.custom.choice = choiceFor(...)`, `flags.sr2e.designMod: true`, ids from `nextItem`. `designVehicle` gets
   `{ mods: engineMods(choices, mods) }`, as the Workshop.
   The Workshop never writes `design.traits` (despite the data model's comment); neither does the app.
3. New ops (VEHICLE_OPS):
   - `POST /vehicles` gets a second accepted body shape, `{ design: true, name }` (a `oneOf` beside the part-1
     `{ catalogId, name }` shape, each with `additionalProperties: false`) → a body with `blankDesign()` choices
     (refused without tables).
   - `setDesign { design }` (field `design`, NOT the character ops' `choices`, whose route schema allows four
     primitive properties): its own route schema — an object, at most 40 properties per level, depth ≤ 3, strings
     ≤ 64, numbers only, the request body cap unchanged — as the first check; then the reducer replaces the whole
     object after `checkChoices` (own-property checks, the schema's keys
     only, types, enums, ranges; `chassisKey`/`powerPlantKey` empty or a key of the loaded tables; `markUp` features
     and multipliers only the loaded Mark-Up table's keys). `gmDP` must be 0 (no GM in the app). `dbwSplit`: three
     whole percentages summing to 10 (the Workshop's rule), only with a drive-by-wire design mod installed.
   - `addDesignMod { catalogId, rating }`, `setDesignMod { itemId, rating }`, `removeDesignMod { itemId }`: a
     catalog `vehicle_mod` for which `designModOptions` says designable with no problems; rating an integer from 1 to
     its `maxRating` evaluated for this build (`modProblems` refuses over it); a mod with no authored maximum takes
     1 to 20 (the Workshop takes any number there; 20 is only a boundary cap, logged as such in the code). Its `choice` is never sent by the client: DBW's comes from `dbwSplit`, others
     keep the catalog's. `MAX_VEHICLE_ITEMS` still holds. Every design op re-checks every installed mod (a chassis
     change can make one invalid: it stays, flagged, and the design is unfinished).
   - Part 1's `mountWeapon` refuses on a designed vehicle (out of scope).
4. Drafts may be saved. A design is "finished" only when `designFinished`; the page says why it isn't.

### 3. Price and purchase
1. `vehiclePrice(body)` for a designed vehicle: `vehicle` = the engine's `price` (Design Points × Mark-Up, rounded as
   the engine rounds, PLUS `designNuyen`, the nuyen-priced parts added after rounding), `points` = `weapons` = 0,
   `cargo` as part 1. An unfinished design has no price (shown as "Unfinished").
2. `garageOf` returns the body, not just the source and price; `buyGarageVehicle` (inside the purchase
   transaction) recomputes `designFinished` and the engine price from that body with the server's tables, refuses an
   unfinished design, and requires in the character's books (`catalogBooks`) `r2` AND every installed mod's book
   (`designBooks(body)`: r2 plus each design mod entry's `listBook`; cargo items' books likewise, which part 1 also
   missed). The receipt records `books`; `booksInUse` (shared/creation.mjs) is extended to read each vehicle
   receipt's `books`, so none of them can be turned off while the purchase stands (test: buy, then toggle r2 and a
   mod's book off: refused).
   The receipt and snapshot stay as part 1.

### 4. Client
1. Library: Kind "Vehicle" offers "Start from a core vehicle" (part 1) or "Design from scratch (Rigger 2)" when the
   tables exist.
2. `Vehicle.svelte`: a designed vehicle shows a **Design** section with the Foundry Workshop's steps as sub-sections
   (Chassis, Power plant, Design options, Modifications, Price), a live summary (DP lines with page refs, stats,
   budgets, problems) computed on the client with the same shared functions and the fetched tables; the page's stat
   list for a designed vehicle shows the EFFECTIVE stats (`applyModEffects` over the base, as Foundry's data model
   does), and the server's sheet row and stat block use the same function so they don't print base values, and one **Save
   design** button that sends `setDesign` (the working choices are local until saved, as in Foundry). Mods save
   immediately with their own ops. Plain form controls, labelled, keyboard-usable; no canvas.
3. The Foundry export needs no change: it reads `actor` (base stats; Foundry derives the effective ones).

### 5. Proof
1. App tests: designs round-trip through the reducer; a blank draft exports a reopenable v2 design; `setDesign`
   refuses each bad shape (extra key, inherited key, wrong type, NaN, out of range, unknown chassis, gmDP, bad DBW
   split); a negative-speed design is unfinished and can't be bought; a character without `r2` can't buy; the rebuilt `actor` equals `workshopUpdate` applied by hand (the parity
   with the system's own function, which the app vendors); mods add/rate/remove; cargo survives a design change;
   price = engine price (with designNuyen) + cargo; the sheet row shows effective stats.
2. All four databases.
3. Manual, in the local Foundry test world: import an exported design, open the Workshop, check its DP and price
   equal the app's, save it unchanged, and re-export (no drift).

## Key decisions & tradeoffs
- **Vendor the system's engine, don't re-implement.** One source of rules; the cost is a system release first.
- **Rebuild `actor` from the choices on every design op** instead of patching it: deterministic, no drift; the cost
  is that hand edits to a designed vehicle's stats aren't possible in the app (they aren't in Foundry's Workshop
  either: the sheet's own edits are outside it).
- **Whole-object `setDesign`** instead of one op per field: matches Foundry's "working design, then save", fewer ops;
  the cost is a heavier validator at the boundary.
- **No weapons on R2 mounts in this part.** R2 mounts (firmpoint/hardpoint/turret mods with CF) need their own
  capacity rules; part 3.
- **Drafts allowed**, buying refused: a player can save half a design.

## Risks / open questions
- Codex r1 #9 (export loses compendium prose): rejected in part. Every app export leaves book prose out by design
  (catalog text is tagged by source, PLAN-catalog); rule fields survive, and `_stats.compendiumSource` points Foundry
  to the book text. Same as part 1's mounted weapons and every character item.
- Whether `designVehicle`'s inputs from the catalog (mod formulas, table cells) are safe to evaluate on the server:
  `evalExpr` parses them; they come from pinned content, not from users, and users can't author mods here.
- Settled (Codex r1): the Foundry Workshop reopens any actor with `design.version 2` and its choices, and treats every
  `flags.sr2e.designMod` item as its own; `wsUid` only matches items it creates during a save, so the app needn't
  write it. Step 5.3 still checks it live.
- Chassis art (`chassisArt`) paths point into the R2 module (`modules/sr2e-rigger-2/...`): the export can carry them
  (Foundry resolves them when the module is installed); the app shows no art for designs in this part.

## Out of scope
Weapons on R2 mounts; customizing a production vehicle (R2 p.121+ in Foundry: requests and GM admission); R2 vehicle
list stats for catalog vehicles; the GM's Design Points; designs from other books' chassis; sharing designs.
