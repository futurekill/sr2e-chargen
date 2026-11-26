# Plan: buying and selling vehicles in play (Vehicle Workshop follow-up)
_Round 2 — revised after Codex r2; APPROVED by Codex r3 (2026-11-26)_

## Goal
A FINISHED character buys a vehicle with nuyen — a core-book catalog vehicle, or a finished vehicle from the player's
own garage (part 1 and part 2) — and can sell one, as money buys and sells gear in play today (docs/PLAN-M4b.md: the
street price shown, the price agreed entered by the player, R7; selling by the server's sale mode, R6). Every change is
a ledger entry with its own undo. The vehicle exports to Foundry like a vehicle bought at creation.

## Rules
- Core p.264 (rendered 2026-11-26): "Vehicles generally have an Availability equal to Cost/10,000. … Street Index is
  .75 for Costs less than 10,000¥, 1 for up to 50,000¥, and 2 for more than 50,000¥." The street price shown is list ×
  that index (p.184, as gear). A "Restricted" vehicle (no list price) can't be bought here (as at creation).
- Selling (p.188, R6): **refund** = the price PAID; **fence** = the agreed 10–50 % (steps of 5) of the LIST VALUE —
  for a vehicle its whole list value frozen at purchase (`listValue`: list price, or a garage vehicle's whole price
  with mounted weapons and cargo), never the negotiated price.
- A garage vehicle's price is its whole price (PLAN-garage 6, PLAN-workshop 3): the design or list price + mounted
  weapons + cargo; its Street Index is the core rule's by that whole price (ruling R21, added to docs/RULINGS.md).

## Approach

### 0. System (sr2e-foundryvtt, small release)
`vehicleStreetIndex(cost)` in `module/rules/sr2e-rules.mjs` (pure), pinned by a vitest at
the three bands' edges (9,999 → .75; 10,000 and 50,000 → 1; 50,001 → 2). Nothing in Foundry calls them yet. The app
pins that release, syncs it, and re-exports the helper through `shared/rules.mjs`; its tests run on the pinned copy.
(As built: only `vehicleStreetIndex`; the app doesn't need availability — R7 leaves Availability tests at the table.)

### 1. The document
1. A separate store, `b.vehicles` (NOT `creation.vehicles`): `creation.vehicles` becomes the system's chargen receipts
   (`system.chargen.vehicles`), which count against the creation budget; a vehicle bought in play must not.
   `b.vehicles[key]` = `{ catalogId | garageId, garageRevision?, source, paid, books }`, key `w` + 5 base-36 digits
   (creation's keys are `v…`), from `b.nextPlayVehicle`, never reused.
2. Ops (finished characters only; PLAY_OPS):
   - `buyVehicle { catalogId?, garageId?, price }` — exactly one of the two ids: both are OPTIONAL in the route schema
     (`OPTIONAL.buyVehicle`), and the reducer refuses none or both.
     Catalog: every `addVehicle` refusal (a core vehicle, a list price, its full source). Garage: every
     `buyGarageVehicle` refusal (in the garage = live and unarchived NOW, a finished design, a list price, every book on
     the character), read by `garageOf` in this transaction (`applyOps` adds `buyVehicle` garage ids to its lookup).
     ONE combined check over both stores (`garagePurchases(b)`: the garage ids held in `creation.vehicles` and
     `b.vehicles`): a garage vehicle held in either can't be bought again; once a play copy is SOLD it may be bought
     again. `price` = the agreed price (0–10,000,000, ≤ nuyen). Frozen in the record and the ledger: `source`,
     `garageRevision`, `listValue`, `books`, `paid`, `street`. Nuyen down by `price`; ledger kind `buyVehicle`.
   - `sellVehicle { vehicleKey, pct, shownMode, quoted }` — a play vehicle only (a creation vehicle is part of the
     character as built). The server's sale mode (read in the transaction: `applyOps` reads it for `sellVehicle` too);
     `shownMode` and `quoted` must match, as `sellItem`. Refund = `paid`; fence = `pct` % of `listValue` (the same
     percentage rule as gear, p.188). Ledger kind `sellVehicle` with the whole record.
   - Undo, as the ledger allows today (`undoable`: the LATEST original entry only): `buyVehicle` undoes while the
     vehicle record is unchanged (same JSON) — the record goes, `paid` comes back; `sellVehicle` undoes while the
     character still has the price received and every book in the record's `books` is on — the record comes back
     from the ledger snapshot at its key (keys are never reused), WITHOUT reading the garage (a later edit, archive
     or deletion of the garage vehicle changes nothing). Both kinds join `playOp`'s dispatch and `undoMoney`'s
     inverse checks.
3. MAX_VEHICLES (20) counts both stores.

### 2. Readers
- Sheet model and stat block: vehicles = creation + play (+ linked); a play vehicle shows "bought in play".
- Foundry: `/foundry/vehicles/:key` accepts `^[vw][0-9a-z]{5}$`, resolving `v…` in `creation.vehicles` and `w…` in
  `b.vehicles`; the download's file name includes the character's document id and the key (two same-name vehicles,
  on one character or two, never collide).
- `booksInUse`: a play vehicle's `books` and source citation hold their books.
- Garage: `linkedVehicles` and `usersOfVehicle` use `garagePurchases(b)` (both stores): a play-bought garage vehicle
  shows once, as bought, and its page names the play buyer.
- The catalog: `offerable=play` offers core vehicles with a list price (today it excludes every vehicle); the play
  vehicle picker asks for them.
- The character's Foundry export doesn't embed vehicles (unchanged): each downloads on its own.

### 3. Client
The character page's Money section (play) gets "Buy a vehicle": a core vehicle picker or the garage list, the street
price shown (list × the p.264 index), the agreed price field, Buy. A garage vehicle's quote comes from its document
(fetched, with the design tables for a design: `vehiclePrice`), and its purchase goes through the server-first `send()`
path (the server resolves the garage); never the optimistic local `change()`. Vehicles bought in play list with Sell (sale mode
as gear) and Download.

### 4. Proof
Tests: buy from catalog and garage (nuyen, ledger, street price by the p.264 bands), every refusal (not finished,
restricted, unfinished design, books off, already held in EITHER store, too expensive), a sold play copy bought again,
sell refund (= paid) and fence (= pct of listValue, not of the negotiated price), a mode or quote changed before the
sale, undo of both (latest only), a sale undone after the garage vehicle was edited and archived (restored from the
snapshot), chargen receipts and budget unchanged, export of a `w` key and two same-name exports, the sheet row, the
garage page's buyers, the play catalog offering vehicles. All four databases.

## Key decisions & tradeoffs
- **Separate store** (`b.vehicles`), so the creation budget and receipts never see play purchases.
- **Sell only play vehicles.** Creation vehicles are part of the character as built.
- **Garage street index by whole price** (R21), the book's rule applied to what is paid.

## Risks / open questions
- A garage vehicle edited after a play purchase: the character keeps its snapshot (as at creation).
- Foundry characters imported into the app with vehicles stay in Foundry (unchanged).

## Out of scope
Vehicles from other books (they wait for the book toggles on vehicles); financing/leasing; trading vehicles between
characters; in-play upkeep (Rigger 2 overhead lives in Foundry).
