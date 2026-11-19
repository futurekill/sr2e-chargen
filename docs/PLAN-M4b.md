# Plan: milestone 4b — nuyen after creation (buy, sell, income and expenses)
_Draft 3 (2026-11-19), BUILT on the local branches (system f6082678, app chargen/on-0.161), after Codex plan rounds 1–2 (9 + 6 + 1 findings, round 3 folded into Draft 3; docs/PLAN-M4b-REVIEW-LOG.md; the "Draft 2" and "Draft 3" sections at the end win). The second slice of milestone 4 (docs/ROADMAP.md item 4). Rules: core p.184 (buying: list
price, Street Index, negotiation), p.188 (selling through a fence), p.46 (in play, Availability and Street Price
apply). GM rulings R6 (selling: a GM setting, fence or refund) and R7 (buying: street price shown, negotiated price
entered) in docs/RULINGS.md. Built on the local branches like M4a; surgery wounds for cyberware are M4c (damage)._

## The rules
- **Buying** (p.184, R7): the price shown is the street price, `streetPrice(list, Street Index)` — the system's own
  function, as Foundry charges in play — and the player may enter the price actually agreed (the book's ±5% per extra
  Negotiation success; legal, available gear at list). The GM checks it. Availability tests stay at the table.
- **Selling** (p.188, R6), by a GM setting `saleMode`:
  - `refund` (Foundry's default today): what was paid comes back; ammo and drugs in proportion to what's left; a
    failed second-hand part is worthless (SSC p.100) — exactly Foundry's `saleQuote`;
  - `fence`: the item's list value × the agreed percentage — 30% base, 10–50% (the player enters it; the book's ±5%
    per extra success). Ammo and drugs count what's left; a failed second-hand part is still worthless.

## System (on `release/0.161.0`)
1. **One pure sale quote**: `saleQuoteOf(item, { mode, pct })` in rules/sr2e-rules.mjs, taking a plain item
   (`{ type, system, flags }`) — `money.mjs`'s `saleQuote` becomes a thin caller (refund mode), so the refund numbers
   are unchanged (its existing Quench tests stay green). `fenceValue(listValue, pct)` clamps pct to 10–50 and rounds
   down to whole nuyen. The list value is `itemBaseCost × quantity` (ammo: its bundle value × the fraction left).
2. **The setting** `saleMode` (world, GM-only, choices refund/fence, default refund — nothing changes for an existing
   table until the GM switches). The Sell dialog in fence mode asks the percentage (30 prefilled, 10–50) and shows the
   price before confirming; the queued sale re-quotes with the same mode and percentage.
3. **The negotiated price on a purchase**: the Buy dialog after creation (`purchasePromptFields` callers) gains a
   "Price agreed" field prefilled with the street price; the charge and `flags.sr2e.paid` use it (≥ 0, whole nuyen).
   Chargen purchases are unchanged (list price, no field).
4. Tests: unit (refund mode equals the old `saleQuote` on its fixtures; fence 30% of 1,000¥ = 300; clamps; ammo half
   left); Quench: fence-mode sale pays 30% and removes the item; a purchase at an entered price charges it.

## App
### Settings
- The admin's **rules settings** (the server's `settings` table, Admin page): `saleMode` (refund/fence, default
  refund). The ops route reads it and passes it to the reducer as an input (as it does the dice), so `applyOp` stays
  pure and the client shows what the server will do (the session answer carries the setting).

### Operations (finished characters only; ledger entries, LIFO undo shared with Karma)
- `buyItem { catalogId, choices, price }`: a core-book buyable entry (the M2c types); the item is projected with
  the same `project()` as creation, gets `flags.sr2e.paid = price` (and ammo's `acquiredQuantity`), and is appended
  to `actor.items` with a fresh id; nuyen drops by `price`; refused when nuyen is short. `price` is a whole number
  0–10,000,000; the entry records the street price shown beside it.
- `sellItem { itemId, pct? }`: the quote from `saleQuoteOf` with the server's mode (`pct` required in fence mode,
  10–50); the item leaves `actor.items` (its source kept in the entry), nuyen rises.
- `nuyen { amount, note }`: income (+) or an expense (−), e.g. a run's pay or rent; refused below 0 nuyen.
- `undo`: the existing `undoKarma` becomes `undo` (any ledger entry): a buy is undone only while the item is
  unchanged (its source equal to what was bought) and the refund is exact; a sale only while the money is still
  there (nuyen ≥ the sale price); nuyen entries by their inverse, refused below 0.
- Purchases after creation never touch `creation.items` (creation is frozen); they live in `actor.items`, and the
  sheets show them like any item.

### Client
- A **Nuyen** step for finished characters: balance; income/expense form; the shop (the same search as Resources)
  with the street price and a "Price agreed" box; each bought or owned item gets **Sell** (fence mode asks the
  percentage, showing the price); the history (shared with Karma) with **Undo** on the newest entry.

## Tests
App: buy at street price and at a negotiated price; short of nuyen refused; sell in refund mode (paid back) and in
fence mode (30% of list; 10% and 50% bounds; 9% and 51% refused); undo a buy (refunds, item gone), undo a buy after the
item changed (refused), undo a sale (item back, money out), a nuyen entry and its undo; ops refused before finishing;
the server passes its setting and ignores a client-sent mode.

## Out of scope
Surgery wounds and Magic checks for cyberware bought in play (M4c, p.115–116); Availability tests; sourcebook grades
and second-hand purchases (M5); lifestyle upkeep automation (a nuyen expense covers it).

## Draft 2 — changes after round 1 (these win)
- **Trust: the history is the audit** (r1 #1, declined as a server check): the app has no GM role over a player's
  character (owner-only documents), and Foundry lets players edit their own nuyen too. Every money entry records who
  made it, the street price or 30% quote shown, and the price or percentage entered; the GM reads the history (and the
  sheet shows it). A GM-approval workflow is a later feature (needs shared campaigns, milestone 7+).
- **Bounds at the door and in the reducer** (r1 #2): `price` and the `nuyen` amount are whole numbers, price
  0–10,000,000, an entry −10,000,000…10,000,000 (not 0).
- **What money buys and sells** (r1 #3): in play, `buyItem` takes only weapon, armor, gear, ammo, cyberware and
  program entries; `sellItem` only items of those types. Spells, foci (bonding is Karma), adept powers, contacts and
  lifestyles are not bought or sold with these ops.
- **Foundry's purchase price field is deferred** (r1 #4): the in-play buy paths are several (fixed-price drops,
  surgery, weapon-focus bonding), so the negotiated price in Foundry stays what it is today — the GM or player adjusts
  nuyen by hand after a negotiation (Foundry's Nuyen edit). Foundry gets only the sale mode in this slice.
- **In-play projection** (r1 #5): bought items use their own rule, not creation's: any rating the entry allows (no
  creation cap of 6); cyberware arrives UNINSTALLED (`installed: false`, a spare) until the surgery flow exists
  (M4c), so no Essence or bonus applies yet and the sheet says "not installed".
- **The fence's list value** (r1 #6): `chargenItemCost(priceInput(item))` — the same list pricing the creation
  budget uses (ammo by its bundle value, accessory rows included, the ware context passed) — times the fraction left
  for ammo and drugs with an acquisition basis.
- **Refund parity** (r1 #7): Foundry's `saleQuote` is NOT refactored. Its logic moves unchanged into a pure
  `refundQuote(item)` (plain item: `{ type, system, flags }`), `saleQuote` calls it, and a unit test covers its whole
  case matrix (untracked → street price, ammo and drugs proportional, failed second-hand worthless, paid accessory
  rows) against the old function's outputs; consolidation and eye-accessory moves keep calling `saleQuote` (refund
  semantics) whatever the sale mode.
- **Fence steps** (r1 #8): the percentage is 10, 15, …, 50 (30 ± 5 per extra success, p.188); recorded in the entry.
- **Typed inverse records and live checks** (r1 #9): each ledger entry has a `kind` with its own inverse —
  `buy { itemId, source, price, nuyenBefore }`: undo needs the item still equal to `source`, removes it, refunds
  `price`; `sell { source, price, mode, pct }`: undo needs nuyen ≥ `price`, puts the item back (same id if free),
  takes `price`; `nuyen { amount }`: undo applies −amount if nuyen stays ≥ 0; Karma kinds as M4a. `undoKarma` becomes
  `undo`. The client sends the price it showed (`quoted`) with `sellItem`; the server recomputes with its own mode and
  refuses "the price changed — sell again" when they differ (a mode switched mid-dialog included). The setting:
  `GET/PUT /api/admin/rules` (admin-only, CSRF, audited), a field on the Admin page; `/api/session` carries
  `rules.saleMode` for the client.

## Draft 3 — changes after round 2 (these win)
- **The GM can see the history** (r2 #1): the full sheet PDF and the Markdown stat block gain a **History** section
  (every ledger entry: date, what, price or Karma, the street price or quote shown, undone or not), so the GM reads it
  from what the player prints or shares.
- **Spares don't count** (r2 #2): `validateInPlay` counts only INSTALLED cyberware for Essence, as `derive` does.
- **The fence's pricing input** (r2 #3, #4): `priceInput(item, actor.items)` with the item's compendium source kept
  (`_stats.compendiumSource`) and `drug: !!flags.sr2e.drug`, so cyberware gets its ware context and a drug pack is
  priced per pack.
- **The live mode** (r2 #5): the app's library reads `saleMode` from the settings table INSIDE the write transaction
  and passes it to the reducer; the op carries the mode the client showed (`shownMode`) and is refused when they
  differ. Foundry's queued sale re-reads the world setting inside the money queue and refuses the same way.
- **Five-point steps everywhere** (r2 #6): the request schema (`enum` 10, 15 … 50), the reducer and the Foundry
  dialog accept only those nine values; a test refuses 12. The shared `fenceValue` itself returns null for any other
  percentage (no clamping), so a preview can never show a price the server refuses (r3).
