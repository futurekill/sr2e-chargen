# Plan: the Garage (Vehicle Workshop part 1, roadmap item 8)
_Round 2 — 2026-11-26 (revised after Codex plan r1–r2: docs/PLAN-garage-REVIEW-LOG.md)._ _Round 0: User decision (2026-11-26): "Garage first, Rigger 2 later". Part 2 (Rigger 2 design from
scratch, the system's `vehicle-design.mjs`) gets its own plan. Rules: core book p.251 (vehicles, hardpoints and
firmpoints), p.264 (Vehicle Table), p.46 (vehicles at creation); page images rendered before any number is used._

## Goal
Vehicles become their own documents in the library (PLAN.md U7: "vehicles built on their own, attachable to
characters"): pick a vehicle from the catalog, name it, write notes, mount weapons on its hardpoints and firmpoints by
the core rules, keep its gear, attach it to characters, print it, and export it to Foundry as a vehicle actor.

## Approach
1. **A third document kind, "vehicle"** (`server/library.mjs`; today: draft, character). Body (r1 #13: ONE authority,
   the Foundry shape): `{ schema: "sr2e-chargen-vehicle", schemaVersion: 1, name, notes, catalogId, actor }`, where
   `actor` is the vehicle actor source (from the catalog's `vehicles.json`) whose `items` hold the mounted weapons and
   the gear; a mounted weapon carries `flags.sr2e.mount = "hardpoint" | "firmpoint"`. Each added item gets its OWN
   16-character id from the reducer's counter (`gv…`, like the character's `cg…` ids; r1 #8), kept forever. It
   changes ONLY through operations in a shared reducer (`shared/vehicle.mjs`: `newVehicle`, `applyVehicleOp`,
   `validateVehicle`, `vehicleActor`). Same quotas, revisions, idempotency, archive/delete as every document.
   Caps (r1 #11): 30 items on one vehicle; the mounts by the printed points.
2. **Which vehicles**: the catalog's core-book vehicles (p.264), as S9 allows today. Sourcebook vehicles come with a
   book toggle later; Rigger 2 vehicles (R2 stats) with part 2.
3. **Mount points (p.251 descriptions)**: a transcribed table `MOUNT_POINTS[vehicleId] = { hardpoints, firmpoints,
   page }` for the core vehicles whose description prints them (rendered pages, a pinned test per row), in the SYSTEM
   (`module/rules/vehicle-mounts.mjs`, pure; copied by `content:sync`). No printed mount → none. Built-in weapons stay
   in the description ("may not be changed", p.251).
4. **Mount eligibility is an explicit table, not `weaponType`** (r1 #10), in the same system file:
   `HARDPOINT_WEAPONS` (heavy guns: the machine guns and assault cannons by catalog id) and `FIRMPOINT_WEAPONS` (rule:
   `weaponType: "firearm"` and not in a short exclusion list such as under-barrel attachments). Launchers and
   missiles are NOT hardpoint weapons in v1: the p.251 "Launcher" vehicle weapon (and the Autocannon and Water
   Cannon) are not in the catalog yet; adding those three (their stats read from the page renders) is a follow-up in
   the system. Each table entry is tested.
5. **Operations**: `rename`, `setNotes`, `mountWeapon { catalogId, kind }`, `unmountWeapon { itemId }`,
   `addGear { catalogId, quantity? }`, `removeGear { itemId }`. A mount needs a free point of its kind.
6. **Price** (`vehiclePrice(body)`): the vehicle's list price (p.264) + each mounted weapon at TWICE its list price
   (p.251, "Adaptation … doubles its cost") + each gear item at list price × its quantity (1–99; r2 #1). One owner per item (r1 #3): a weapon or gear item
   on the vehicle belongs to the vehicle, never also to a character, so it is paid once, in the vehicle's price.
   A RULINGS entry records that S9's "vehicle list price only" receipt still holds for catalog vehicles bought with
   `addVehicle` (they carry no items); a garage vehicle's receipt is its whole `vehiclePrice`.
7. **Characters: buying is a snapshot, linking is a soft reference** (r1 #1, #2, #4–#6):
   - `buyGarageVehicle { vehicleId }` (creation only): the server reads the vehicle (through `ownedDocument`: same
     owner, live, not archived) in the operation's transaction and passes a SNAPSHOT into the op; the reducer stores it
     in `creation.vehicles` beside today's catalog purchases as `{ garageId, garageRevision, uuid: "", source:
     vehicleActor(body), cost: vehiclePrice(body) }`. `rebuildItems` builds `system.chargen.vehicles` from ALL
     `creation.vehicles` entries (catalog and garage alike) plus `vehicleBase`, each receipt's cost from its entry
     (catalog: list price, garage: its frozen price), so nothing is lost on the next operation. The reducer refuses a
     second purchase of the same `garageId` (across the whole batch: it reads its own state). Undo / `removeVehicle`
     removes that ONE keyed entry. The character owns the snapshot: a later edit, archive or delete of the garage
     vehicle changes nothing it paid for or exports; the vehicle page shows "bought by X (revision n)".
   - `attachVehicle { vehicleId }` / `detachVehicle { vehicleId }` (any time, no money): `links: [vehicleId]` on the
     character body (max 20, no duplicates). The write checks the target through `ownedDocument`; every READ (page,
     sheet, export) resolves links again through `ownedDocument` and shows a missing, archived or other-owner target as
     "vehicle unavailable", never its contents. So a revision restore that brings back an old link is harmless.
   - The existing `addVehicle` path stays.
8. **Exports** (r1 #7, #9): the vehicle document's own `GET /:id/foundry` returns the Foundry vehicle actor BUILT from
   the document (`vehicleActor`: its name, its notes appended to `system.notes` as escaped HTML paragraphs (r2 #4), its items with their ids), the same
   download a character's creation vehicle has today (`/foundry/vehicles/:key`, which now covers garage purchases
   too). Linking actors inside Foundry stays the user's drag (as today; no `linkedVehicles` UUIDs invented). The
   Markdown stat block and the character sheet's Vehicles block list bought vehicles and live linked ones (Handling,
   Speed, Body, Armor, Signature, Pilot, mounts and weapons); a linked vehicle the character also bought is listed
   once (the purchase); the sheet fit test gains a character with 20 purchases AND 20 other links (r2 #2).
9. **Client**: Library → "New vehicle" (pick from the catalog's core vehicles, name it); a Vehicle page (stats, mounts
   with free/used counts, weapons, gear, notes, price, the characters linking or having bought it, Foundry download);
   the character's Resources: "From your garage" (buy at creation / link).
10. **Tests**: reducer unit tests (each op, each refusal, ids unique and stable, price, caps); the mount and
   eligibility tables against their pages (system Vitest); library tests on all four databases (create, ops,
   revisions, quota, archive, another owner's vehicle refused for buy AND link, a link to a deleted vehicle reads as
   unavailable, a revision restore with a stale link); creation budget with one catalog and one garage vehicle and an
   undo; a batch that buys the same vehicle twice is refused; exports (actor JSON shape, unique item ids, edited name);
   sheet fit.
11. **Docs**: README (the Garage), CHANGELOG, ROADMAP item 8, RULINGS entries (mount tables; garage receipt price).

## Key decisions & tradeoffs
- **Its own document, not part of the character** (U7, D6): a vehicle can exist without a character and serve several.
  Buying copies it into the character (a snapshot owns what was paid); linking is a soft reference resolved on every
  read. No cross-document lock or cascade is needed.
- **No character schema version bump** (r1 #12, rejected): `links` is optional and read as empty when missing; the
  server and the client ship together in one image, so no older reader meets the new field.
- **Mount points as data in the system**, not typed by the user: the book prints them; a user-typed count would let
  anyone mount anything. Cost: a transcription task (core vehicles only).
- **Core mount rules only**: no Rigger 2 mount types (fixed/turret/flex, firmpoint capacity in CF) — part 2.
- **Price frozen at purchase** (receipt), as S9 does: editing the garage vehicle later never changes what was paid.
- **Gear has no capacity check**: the core book prints none for vehicles; Rigger 2's Cargo Factor comes in part 2.

## Risks / open questions
- Does every core vehicle print its mounts? Some say "can mount" (optional, sold empty), some carry built-in weapons;
  the table records points, not built-ins. Needs the page renders.
- Foundry side: the system's core-mode attack doesn't apply the p.251 recoil rules for mounts (halved recoil on a
  hardpoint, 1 RC on a firmpoint) — only Rigger 2 mounts are modelled (`vehicleRecoil`). Out of scope here; the export
  carries the mount kind so the system can use it later.
- Buying a garage vehicle IN PLAY (after creation) is out of scope (r2 #3): the play purchase path excludes vehicles
  today; it gets its own small plan (a ledger debit of `vehiclePrice`, undo as for items).

## Out of scope
Rigger 2 design and customization (part 2); buying a garage vehicle in play; sourcebook vehicles (a later book toggle); sharing a vehicle between
users; in-play vehicle damage/condition in the app (Foundry does play); drones' own pilot programs.
