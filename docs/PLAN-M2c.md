# Plan: milestone 2c — resources (core book)
_Draft 4 (2026-11-18), after Codex plan rounds 1–3 (14 + 4 + 3 findings; docs/PLAN-M2c-REVIEW-LOG.md). Round 3's
fixes are not re-reviewed: the code review checks them (as for docs/PLAN-M2.md). A slice of docs/PLAN-M2.md (§3, §4 Resources, §7 M2c); this file settles what that plan left
open for buying things with nuyen and Force Points. Rules: docs/RULES-CHARGEN.md item 6 (p.46) and the pages cited
here, each read on the page render (not the PDF text layer)._

## Goal
A player spends the Resources priority on the core book's gear: weapons, armor, gear, ammunition, cyberware (with its
Essence), spells, foci, and a physical adept's powers. The rules check shows nuyen, Force Points and Essence, each with its
page. **Adept powers move to a follow-up slice, M2c-2** (round 2 #3 #4): their costs depend on a chosen target (Improved
Ability's skill, p.125, .25–1 per die by skill area; Improved Physical Senses' named senses, .25 each) or on the
RESULTING rating against the racial maximum (Improved Physical Attributes, Increased Reaction: .5 / 1 / 1.5 or 2 per
point by tier, up to 1.5 × the racial maximum, p.125–126 read on the page), and Combat Sense and Killing Hands have
their own tables (p.125–126). The system's `adeptPowerCost` must be checked against those tables first (S13). Programs, lifestyles and contacts are M2d (they need the system release S1–S3).

## What the catalog holds (measured 2026-11-18, core book `sr2`)
weapon 64, armor 20, gear 107 (incl. skillsoft 4, cyberdeck), ammo 13, cyberware 56, spell 68, focus 5, adept_power 14,
vehicle 32. Rated items: 19 gear priced `costPerRating × rating`, 9 cyberware with `ratingStats` rows (cost and
Essence per rating), the Bow (`costPerStrengthMin`), skillsofts (`skillsoftCost`), foci (`costPerForce`). Ammo `cost`
is the price of one bundle (`quantity` rounds, usually 10). Cybereyes have `capacity` 0.5.

## Approach

### 1. Operations (added to shared/creation.mjs)
- `addItem { catalogId }` — a core (`book: "sr2"`) entry of type weapon, armor, gear, ammo, cyberware, spell or focus, copied from the SERVER's catalog as a Foundry item source, exactly as `addSkill` does (deterministic id,
  `creation.items[id] = { catalogId, snapshot, choices }`), with the entry's own `type` (the shared item helper takes
  the type; it is not "skill" for everything — r1 #1). Every price and budget call gets `{ type, name, ...system }`.
  Also refused (round 2 #1 #2): an entry with no fixed core price — its projected `itemBaseCost` is 0 (measured: the
  personal computers, Telecom, Data Display Unit, Display Headset and Heads-Up Display, whose price is per Mp of
  memory; Computer Memory; the internal Smartgun System, priced as its weapon; DataSoft; Unarmed Strike) — and any
  cyberlimb option (`limbOption`: Built-In Device, Built-In Smartlink, Increased Strength), which needs a limb (M5).
  Each refusal names the reason; pricing them is a follow-up. Refused: other types (skill has its own operation;
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
| gear | `quantity` 1–1000; `rating` 1–6 when the entry has `costPerRating`, or one of its `ratingStats` rows' ratings that is ≤ 6 (p.44: no starting gear above 6, so higher is refused, not reported — r1 #8); skillsoft: `rating` 1–6 and `skill` (the name of the skill on the chip, 1–60 characters, projected to `grantedSkill`; required — a chip without one does nothing, r3 #3); its `grantedSkillCategory` is the ENTRY's, never a choice (r1 #6) | DataSoft is refused: its price "Varies" (catalog cost 0), so no core price exists (r1 #7) |
| ammo | `bundles` 1–100 | projected `quantity = bundles × entry.quantity` (rounds) and `flags.sr2e.acquiredListValue = bundles × entry.cost` (where Foundry keeps it); the price call gets it at the TOP level, `acquiredListValue`, as `chargenBudgetOf` passes it to `chargenItemCost` (r1 #2, r3 #1) |
| cyberware | `rating`: one of the `ratingStats` rows' ratings; an eye accessory: `in` = the item id of a cybereye on this character, or "" | grade is always standard (grades are the Street Samurai Catalog's, M5) |
| spell | `force` 1–6 (above 6 refused: "no starting spell can have a Force greater than 6", p.46) | Force Points = Force (p.46) |
| focus | `force` 1–6 (spell lock: none, its price is flat, p.137); specific spell focus: `spell` = the item id of a spell on this character, required (projected `spellSubtype: "specific"`, `boundSpellId`) | nuyen via `derivedItemCost` (`costPerForce` × Force); Force Points = the bonding cost (§3); projected `bonded: true` — creation pays the bonding (p.46), so the focus works from the first session (r3 #2). A spell lock stays `bonded: false`: it is bonded when a spell is locked (p.138). Removing the spell clears the focus's bond, which the check reports |

`quantity`, `rating` and `force` land in the system's own fields (`quantity`, `rating`, `force`, `level`,
`strengthMinimum`, `grantedSkillCategory`), so `chargenSpend` / `itemBaseCost` / `chargenItemCost` price them exactly
as Foundry's creation panel does. Prices are never stored as typed: `cost` stays the snapshot's.

### 3. Rules the check adds (shared/creation.mjs `validate`)
- **Nuyen** (p.46): `chargenSpend(...).resources` over the priority's nuyen is an error. Unspent nuyen is NOT a todo:
  it converts at finish (p.47, M2d).
- **Gear rating** (p.44): "Starting gear cannot have a rating greater than 6" — an item whose rating is above 6 is an
  error (reported, not refused: some entries list ratings above 6).
- **Essence** (p.45–46): 6 − the sum of each cyberware's Essence; below 0 is an error. Each item's Essence is its
  `ratingStats` row's `essenceCost` (else `essenceCost`), standard grade. **Cybereyes** (core p.247, read on the page:
  "Cybereyes will accept additional vision enhancements up to .5 Essence Cost without further Essence loss"):
  accessories placed in a cybereye cost no Essence up to the eye's `capacity` (.5); only the excess adds — the system's
  `containerEssence`. Only an entry the system knows as an eye accessory (`eyeAccessoryKind(flags, source)` not null)
  may be placed in an eye. In the character an accessory placed in an eye is NOT a separate item: it becomes a row of
  the eye's `system.modules` in the system's own shape (`{ id, name, essenceCost, kind: eyeAccessoryKind(…), eye:
  "both", cost, rating, combatTnMod, active: true, notes: "", paid: 0, listValue: cost }` — the Eye Camera's kind is
  `camera`, r1 #4), and every price call gets the eye's `moduleListValue = rowsListValue(modules)`, the field
  `chargenItemCost` adds (r1 #3). The 1.2-Essence accessory cap and the weapon/camera slot rules (`eyeReports`) are
  Cybertechnology p.45's: they arrive with that book in M5 (r1 #5, deferred).
- **Magic Rating** (p.45): a magician's or adept's Magic = Essence rounded down; shown in the panel. It is computed
  BEFORE the other checks: Sorcery and Conjuring need Magic ≥ 1 (not only a magic type — a magician at Essence 0.9
  has none, r1 #13), and so do spells, foci bonding and adept powers.
- **Force Points** (p.46): spells' Force + foci bonding costs over the priority's Force Points is an error; a mundane
  character or a physical adept buying a spell is an error (only magicians receive Force Points). Spell Force > 6 is
  refused (p.46). Unspent Force Points are a warning (they are lost: confirm on the page during the build).
- **Focus bonding cost** (p.137, Focus Bonding Table, checked on the render): specific spell focus = Rating; spell
  category focus 3 × Rating; spirit 2 × Rating; power 5 × Rating; spell lock 1; weapon focus small 4 × / large 5 ×
  Rating. The system stores `bondingCost` as an authored number and does not derive it from Force, so the app derives
  it in `purchase.mjs` from `focusType` and Force and writes it to `system.bondingCost`. The core catalog's spell focus
  is the SPECIFIC spell focus (the system implements only that subtype; its price, 45,000¥ × Rating, is the price
  list's "Specific Spell Focus", core p.263): bonding = Rating. A spell category ("Spell
  Type") focus (75,000¥ × Rating, 3 × Rating) is not in the catalog and not offered (r1 #9). Weapon foci: §5.
- **Adept power points**: M2c-2 (above).
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
- **S11. Focus price comment**: the core price list (p.263, read 2026-11-18) gives Specific Spell Focus
  45,000¥ × Rating, Spell Type Focus 75,000¥ × Rating, Spirit Focus 60,000¥ × Rating, Power Focus 105,000¥ × Rating,
  Spell Lock 45,000¥ — the catalog's `costPerForce` values are RIGHT; only `focusCost`'s comment (10,000 / 20,000 /
  5,000) is stale. Fix the comment (r1 #10: resolved, no price changes).
- **S13. Adept power costs**: check `adeptPowerCost` against p.125–126 (Improved Physical Attributes and Increased
  Reaction tier by the RESULTING rating; Combat Sense 2/3/4; Killing Hands .5/1/2/4 per level held; Improved Ability by
  skill area with its Combat Skill cap; Improved Physical Senses per sense) and fix it in the system; M2c-2 uses it.
- **S12. Weapon foci** price off the bonded weapon's Reach (`weaponFocusCost`, p.126) and need a weapon to bond to;
  the app refuses weapon foci until it has a bond choice (M2c follow-up).

### 6. Tests
- Per type: the projection (choices → `system`), refusals for every unlisted choice key and every out-of-range value,
  and the price against a hand-computed value from the page (`costPerRating`, a ratingStats row, a bundle of ammo, a
  focus at Force 3). And the interactions (r1 #14): two Rating 3 Jammers (quantity × rated price), three ammo bundles
  (rounds and price), an Eye Camera in cybereyes (kind camera), an adept with cyberware (Magic falls), a magician at
  Essence 0.9 (Magic 0: Sorcery, spells and foci reported), a spell on an adept (reported: no Force Points), and every
  refused entry class above (no fixed price, limb option, adept power, vehicle, program).
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
