# Plan: milestone 2c — resources (core book)
_Draft 1 (2026-11-18). A slice of docs/PLAN-M2.md (§3, §4 Resources, §7 M2c); this file settles what that plan left
open for buying things with nuyen and Force Points. Rules: docs/RULES-CHARGEN.md item 6 (p.46) and the pages cited
here, each read on the page render (not the PDF text layer)._

## Goal
A player spends the Resources priority on the core book's gear: weapons, armor, gear, ammunition, cyberware (with its
Essence), spells, foci, and a physical adept's powers. The rules check shows nuyen, Force Points, Essence and power
points, each with its page. Programs, lifestyles and contacts are M2d (they need the system release S1–S3).

## What the catalog holds (measured 2026-11-18, core book `sr2`)
weapon 64, armor 20, gear 107 (incl. skillsoft 4, cyberdeck), ammo 13, cyberware 56, spell 68, focus 5, adept_power 14,
vehicle 32. Rated items: 19 gear priced `costPerRating × rating`, 9 cyberware with `ratingStats` rows (cost and
Essence per rating), the Bow (`costPerStrengthMin`), skillsofts (`skillsoftCost`), foci (`costPerForce`). Ammo `cost`
is the price of one bundle (`quantity` rounds, usually 10). Cybereyes have `capacity` 0.5.

## Approach

### 1. Operations (added to shared/creation.mjs)
- `addItem { catalogId }` — a core (`book: "sr2"`) entry of type weapon, armor, gear, ammo, cyberware, spell, focus or
  adept_power, copied from the SERVER's catalog as a Foundry item source, exactly as `addSkill` does (deterministic id,
  `creation.items[id] = { catalogId, snapshot, choices }`). Refused: other types (skill has its own operation;
  program, lifestyle, contact wait for M2d; vehicle — see §5; race, tradition, archetype are not items a character
  buys).
- `setItem { itemId, choices }` — `choices` is an object; the reducer accepts ONLY the keys its type lists (below),
  each an integer in a stated range or a value from a stated set. Anything else is refused. The server's schema allows
  an object of at most 4 integer-or-short-string values; the reducer is the authority.
- `removeItem { itemId }` — removing a cybereye removes the accessories placed in it too.

### 2. Choices per type, and the projection to the item's `system` (shared/purchase.mjs)
`purchase.mjs` turns (snapshot, choices) into the item's `system` after every operation, the same rebuild as skills.
Only these choices exist; everything else in `system` comes from the snapshot.

| Type | Choices | Rule |
|---|---|---|
| weapon | `quantity` 1–20; Bow: `strengthMinimum` 1–6 | price by the system's `derivedItemCost` (Bow) |
| armor | `quantity` 1–5 | |
| gear | `quantity` 1–1000; `rating` when the entry has `costPerRating` or `ratingStats` (1–the entry's max, and ≤ 6 reported, p.44); skillsoft: `rating` 1–6 and `grantedSkillCategory` (the system's list) | |
| ammo | `quantity` = bundles, 1–100 | price per bundle (`chargenItemCost` takes ammo by bundle) |
| cyberware | `rating` when `ratingStats` (the rows' ratings only); cybereye accessory: `in` = a cybereye's item id or "" | grade is always standard (grades are the Street Samurai Catalog's, M5) |
| spell | `force` 1–6 (above 6 refused: "no starting spell can have a Force greater than 6", p.46) | Force Points = Force (p.46) |
| focus | `force` 1–6 (spell lock: 1 only, p.137) | nuyen via `focusCost`; Force Points = the bonding cost (§3) |
| adept_power | `level` 1–the power's `maxLevel` | power points via `adeptPowerCost` |

`quantity`, `rating` and `force` land in the system's own fields (`quantity`, `rating`, `force`, `level`,
`strengthMinimum`, `grantedSkillCategory`), so `chargenSpend` / `itemBaseCost` / `chargenItemCost` price them exactly
as Foundry's creation panel does. Prices are never stored as typed: `cost` stays the snapshot's.

### 3. Rules the check adds (shared/creation.mjs `validate`)
- **Nuyen** (p.46): `chargenSpend(...).resources` over the priority's nuyen is an error. Unspent nuyen is NOT a todo:
  it converts at finish (p.47, M2d).
- **Gear rating** (p.44): "Starting gear cannot have a rating greater than 6" — an item whose rating is above 6 is an
  error (reported, not refused: some entries list ratings above 6).
- **Essence** (p.45–46): 6 − the sum of each cyberware's Essence; below 0 is an error. Each item's Essence is its
  `ratingStats` row's `essenceCost` (else `essenceCost`), standard grade. **Cybereyes** (p.247 per the system's note;
  the page render to be re-checked): accessories placed in a cybereye cost no Essence up to the eye's `capacity` (.5);
  only the excess adds — the system's `containerEssence`. In the character, an accessory placed in an eye is NOT a
  separate item: it becomes a row of the eye's `system.modules` (the system's own shape: `{ id, name, essenceCost,
  kind: "accessory", eye: "both", cost, rating, combatTnMod, active, notes, paid: 0, listValue: cost }`), and the eye's
  price adds `rowsListValue` — as Foundry stores it.
- **Magic Rating** (p.45): a magician's or adept's Magic = Essence rounded down; shown in the panel.
- **Force Points** (p.46): spells' Force + foci bonding costs over the priority's Force Points is an error; a mundane
  character or a physical adept buying a spell is an error (only magicians receive Force Points). Spell Force > 6 is
  refused (p.46). Unspent Force Points are a warning (they are lost: confirm on the page during the build).
- **Focus bonding cost** (p.137, Focus Bonding Table, checked on the render): specific spell focus = Rating; spell
  category focus 3 × Rating; spirit 2 × Rating; power 5 × Rating; spell lock 1; weapon focus small 4 × / large 5 ×
  Rating. The system stores `bondingCost` as an authored number and does not derive it from Force, so the app derives
  it in `purchase.mjs` from `focusType` and Force (weapon foci: see §5) and writes it to `system.bondingCost`.
- **Adept power points** (p.124): the sum of `adeptPowerCost` over powers ≤ the adept's Magic Rating; physical adepts
  only (a magician buying a power is an error).
- **Rating availability**: core character creation has no availability limit (the Companion's are M5).

### 4. Client
A Resources step: the catalog search (milestone 1's) filtered to the buyable core types, an Add button, and a list of
bought items with their choices, price and Essence; cybereye accessories show a "In: (eye)" select. The rules check
gains Nuyen, Essence, Magic, Force Points and power points rows.

### 5. Gaps found, for the system release (added to PLAN-M2 §0)
- **S9. Vehicles** are not in `CHARGEN_RESOURCE_TYPES`, so Foundry's own creation panel does not charge for a vehicle
  bought at creation (p.46 lets Resources buy any gear; vehicles are on the gear list, p.264). Until the system counts
  them, the app refuses vehicles at creation (it would show a total Foundry disagrees with).
- **S10. Focus bonding cost** is authored, not derived from Force (p.137). The system should derive it (one pure
  function in rules/, the data model calling it); the app uses that function once the pin includes it.
- **S11. Focus prices**: the system's `focusCost` comment and the catalog's `costPerForce` (45,000 for the spell focus)
  disagree; check the core price list (gear chapter) on the render and fix whichever is wrong. Until then the app uses
  the catalog's numbers (what Foundry charges today).
- **S12. Weapon foci** price off the bonded weapon's Reach (`weaponFocusCost`, p.126) and need a weapon to bond to;
  the app refuses weapon foci until it has a bond choice (M2c follow-up).

### 6. Tests
- Per type: the projection (choices → `system`), refusals for every unlisted choice key and every out-of-range value,
  and the price against a hand-computed value from the page (`costPerRating`, a ratingStats row, a bundle of ammo, a
  focus at Force 3).
- Essence: wired reflexes + cybereyes with Low-Light (.2) and Thermographic (.2) inside = .2 eyes only; a third
  accessory pushing past .5 adds only the excess; Essence below 0 reported; Magic follows Essence.
- Force Points: a spell at Force 6 + a power focus Force 2 (10) against Priority C's 25.
- Adept: Improved Reflexes levels by `adeptPowerCost`; over Magic reported.
- Server: an addItem of a non-core, vehicle or program entry refused; choices with an extra key refused.

## Key decisions
- **The reducer is the authority on choices**, not the request schema (one list per type in `purchase.mjs`).
- **Accessories become rows of their eye**, as Foundry stores them, so the connector (M7) needs no translation.
- **Gaps the system has are not papered over in the app** (vehicles, bonding, focus prices): either the app derives
  the book's rule and the system follows (S10), or the app refuses until the system is fixed (S9, S12).

## Out of scope
Cyberware grades and second-hand ware (SSC, M5), bioware (Shadowtech, M5), Cybertechnology rules (single eyes,
cyberlimb options, surgery), programs, lifestyles, contacts (M2d), the finish (M2d).
