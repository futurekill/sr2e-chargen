# Plan: vehicles bought at creation (S9)
_Draft 5 (2026-11-18), after Codex plan rounds 1–4 (9 + 2 + 2 + 3 findings; docs/PLAN-S9-vehicles-REVIEW-LOG.md; the "Draft 2"–"Draft 5" sections at the end win). System prerequisite S9 (docs/PLAN-M2c.md): Foundry vehicles are ACTORS, so no item type can
count them in the creation budget. Today a vehicle dropped on a character during creation costs nothing._

## Rules
- Core p.46: Resources buy "cyberware, gear, and extras"; gear at the listed cost (pp.254–265); vehicles and drones are
  listed on p.264 (Vehicles table, Cost column). Availability and Street Index are ignored at creation (p.46).
- The "no gear above Rating 6" rule (p.46) does not apply: vehicles have no Rating.
- Nothing in the core book limits how many vehicles a character buys.

## What exists
- `CharacterData.linkedVehicles` (array of vehicle-actor UUIDs). Dropping a vehicle on a character links it
  (actor-sheet `_onDropActor`; a compendium vehicle is imported first with `createActorViaGM`, which needs a GM or a player with the "Create New Actors" permission — there is no relay). `unlinkVehicle`
  (sheet-actions) removes it. Rigger 2 overhead (`payerOf`) and play code read the list.
- `chargenBudget({ system, items, table, vr2 })` (rules/sr2e-rules.mjs, branch `chargen/s-prereqs`), called by
  `chargenBudgetOf(actor)` (actor-sheet) and, after the release, by the standalone app.

## System (branch `chargen/s-prereqs`)
1. **Which vehicles were bought at creation**: a new `system.chargen.vehicles` (ArrayField of UUID strings, initial
   `[]`). A linked vehicle is NOT automatically a purchase (a shared team van the GM links is not the character's
   buy). The drop asks only while `chargen.inProgress` is true: "Buy at creation (list price X¥)" or "Link only".
   The character-sheet vehicle row shows a "bought at creation" tag and a toggle (owner, creation in progress), so a
   mistake can be fixed. Unlinking also removes it from `chargen.vehicles`.
2. **Pure price**: `chargenVehicleCost(v)` = `v.system.cost` + the `chargenItemCost` of each embedded item (mounted
   weapons, vehicle mods), so the list price follows what the vehicle actually carries. Input is a plain
   `{ system, items }`, so the app passes its own snapshot.
3. **Budget**: `chargenBudget({ ..., vehicles = [] })` adds `Σ chargenVehicleCost` to `resources.spent`, and the
   result gains `resources.vehicles` (the vehicle part) for the panel to show. `chargenBudgetOf` resolves
   `chargen.vehicles` with `fromUuidSync`; a UUID that no longer resolves (vehicle deleted) counts 0 and is listed as
   missing on the panel.
4. **Panel** (actor-bio.hbs budget): the Resources row's tooltip/line shows "of which vehicles: X¥".
5. **Not changed**: buying a vehicle in play (no nuyen flow exists for vehicles today); Rigger 2 overhead; the
   linking itself.

## App (after the pin includes the release)
- Catalog vehicles (kind actor, type vehicle) become buyable: `addVehicle {catalogId}` stores
  `creation.vehicles[id] = { catalogId, name, img, source, snapshot }` (the vehicle actor source as built), no choices.
  `removeVehicle {id}`. At most 20.
- The budget passes the snapshots to `chargenBudget` as `vehicles`. The actor body records nothing (no UUIDs exist
  outside Foundry); the connector (milestone 7) creates the vehicle actors and fills `linkedVehicles` and
  `chargen.vehicles`.
- Character page: a Vehicles list in Resources (name, list price, remove). Full sheet: a Vehicles block (Handling,
  Speed, Body, Armor, Signature, Pilot). Not on the table card.

## Tests
- System unit: `chargenVehicleCost` (cost only; cost + a mounted weapon), `chargenBudget` with two vehicles (spent
  and `resources.vehicles`), an empty list unchanged.
- Quench: drop a compendium vehicle during creation → "Buy" → budget rises by its cost; "Link only" → unchanged;
  toggle off → back; unlink → removed from `chargen.vehicles`; creation finished → no prompt.
- App: add/remove a vehicle, budget, the 20 cap, a refused non-vehicle catalog id.

## Out of scope
Rigger 2 Workshop designs and customization pricing at creation (the table doesn't use Rigger 2); in-play vehicle
purchases; Street Index for vehicles.

## Draft 2 — changes after round 1 (these win)
- **A purchase receipt, not a UUID** (r1 #4, #5, #6): `system.chargen.vehicles` is an ArrayField of
  `{ name, source, cost }` — the vehicle's name, its compendium source UUID (or `""` for a vehicle made in the world),
  and the LIST price paid (`system.cost` read at the moment of purchase). The budget sums the receipts' `cost`; nothing
  is resolved at budget time, so deleting, editing, copying or re-linking the vehicle never changes what was spent.
  No world or token UUID is stored, so the portable bundle has nothing to remap (a compendium UUID is the same in
  every world). The field's `initial: []` fills old actor sources on load (no migration; schema-default rule).
- **Vehicle price only** (r1 #2, #3): a receipt is `system.cost`, the p.264 list price. Embedded items are not
  priced: core vehicles carry none, and gear a character buys for a vehicle is bought as the character's own item
  (already counted). Rigger 2 customization stays out of scope.
- **The drop** (r1 #1, #9): while `chargen.inProgress`, the dialog asks "Buy at creation (X¥)" / "Link only" /
  Cancel BEFORE any import. Then the existing import (same permission rule; a refusal changes nothing), then ONE
  update writing `linkedVehicles` and, for Buy, the receipt — both arrays re-read just before the update. If the
  update fails after an import, the imported actor is deleted. Concurrent edits to the same character's arrays from
  two clients are not guarded (shortcut, as the existing link code; one player edits their own character).
- **Undo**: the Resources budget line lists the receipts with a remove button (owner, creation in progress) — the
  refund; unlinking a vehicle does NOT remove its receipt (the line still shows it, so the player decides).
- **Budget** (r1 #2): `chargenBudget` gains no new input — it reads `system.chargen.vehicles` itself and adds
  `Σ cost` to `resources.spent`; the result gains `resources.vehicles`. So the panel and the app get it with no
  caller change.
- **App** (r1 #7, #8): the app writes the same receipts into the actor body (`system.chargen.vehicles`) from the
  catalog entry (`name`, `source` = the entry's compendium UUID, `cost` = `system.cost`); its `validate()` moves from
  `chargenSpend` to `chargenBudget` when the pin includes the release (the M2d switch). The connector creates the
  vehicle actors from the receipts' `source` UUIDs (the compendium holds the full source; the catalog snapshot is not
  used to rebuild an actor).
- **Tests** replace the list above where they differ: unit — two receipts add to `resources.spent` and
  `resources.vehicles`, an old source without the field is 0; Quench — Buy/Link only/Cancel (Cancel imports nothing),
  a player without "Create New Actors" is refused with no receipt, a failed update deletes the imported actor, the
  receipt survives deleting the vehicle, remove-receipt refunds.

## Draft 3 — changes after round 2 (these win)
- **No list price, no purchase** (r2 #1): p.264 prints "Restricted" for some vehicles (the data holds `cost: 0`, e.g.
  the GMC Banshee and the Federated-Boeing Eagle). "Buy at creation" is offered only when `system.cost` is a number
  above 0; otherwise the dialog says why and offers "Link only". The app refuses such a vehicle with the same reason.
  The pure `chargenBudget` also ignores (and reports in `resources.vehicleProblems`) a receipt whose cost is not a
  positive number, so a hand-edited receipt can't make a vehicle free silently... it counts nothing and is flagged.
- **The app keeps the whole vehicle** (r2 #2): `creation.vehicles[id] = { catalogId, source }`, where `source` is the
  complete vehicle actor source from the app's pinned content copy (`content/.../packs-src`, the same files the
  catalog is built from), stored when bought; the receipt in the actor body is derived from it. The connector creates
  the actor from that stored source (the UUID is provenance only), so a changed or missing compendium in the
  destination world doesn't matter.

## Draft 4 — changes after round 3 (these win)
- **Bad receipts are errors** (r3 #1): the Foundry panel shows each `resources.vehicleProblems` entry under the
  Resources row (red, like an over-budget row); the app turns each into a Resources validation error, so creation
  can't finish with one.
- **The raw sources ship** (r3 #2): `npm run build:catalog` also writes `vehicles.json` (catalog id → the complete
  vehicle actor source from the pinned content), with its checksum in the catalog manifest; the Docker image copies it
  beside `catalog.json`, and `loadCatalog` loads and checks it. `addVehicle` stores that source in
  `creation.vehicles[id]`; an id missing from `vehicles.json` is refused.

## Draft 5 — changes after round 4 (these win)
- **Foundry finishing stays advisory** (r4 #1, declined): Foundry's panel never blocks unticking "Creation in
  progress", not even over budget — the GM approves a character. A bad receipt is shown red like any over-budget row;
  blocking only this case would be inconsistent. The app, which does block finishing, treats it as an error (Draft 4).
- **The browser gets the source** (r4 #2): `GET /api/catalog/entries/:id` adds `actorSource` for a vehicle entry
  (from the checked `vehicles.json`); the client's `lookup` therefore has it, and `addVehicle` refuses an entry
  without it on both client and server (the server's lookup reads the same loaded file).
- **Checksums** (r4 #3): `vehicles.json` gets its own `vehiclesSha256` in the manifest, verified on its own; the
  existing catalog-metadata comparison excludes that key.
