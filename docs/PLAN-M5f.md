# Plan: milestone 5f — sourcebook cyberware and cyberware grades
_Draft 2 (2026-11-19), BUILT after a Codex plan round (6 findings, all accepted). Roadmap item 5, sixth slice. Foundry models it all (`wareEssence`, `CYBERWARE_GRADES`,
`gradeCostMultiplier`, `itemBaseCost`); the app offers what it computes the same way._

## Book cyberware (the M5a pattern)
From a turned-on book (Cybertechnology, Street Samurai Catalog, Cyberpirates, Rigger 2, Corporate Security,
Shadowtech), cyberware is offered when it has no ware rule (`wareRule` null), no limb identity (`limbIdentity` type or
option kind), no limb option, no cranial deck, no Active Effects, is not a container (`capacity` 0), and carries none of
the fields Foundry derives special effects from that the app doesn't: `unarmedPowerBonus`, `isTacticalComputer`,
`skillwirePlus`, `accessPorts`. Cyber weapons (`isWeapon`), armor and a VCR are allowed (as for core cyberware: the
app already handles them). About 160 entries; the rest wait for the limb and ware-rule slices.

## Grades (Street Samurai Catalog p.98)
- With the SSC turned on, every cyberware purchase at creation (core and book) gets a `grade` choice: standard, alpha
  (Essence ×0.8, price ×3), beta (×0.6, ×7) — the system's `CYBERWARE_GRADES`. Delta (Cybertechnology) is not offered
  in this slice (its availability at creation needs its own page read).
- The projection writes `system.grade`; Essence comes from `wareEssence` (which already grades, with its rounding),
  price from `itemBaseCost` (grade multiplier). Eye accessories inside a cybereye take the eye's grade rule as the
  system's `containerEssence` does (accessories are rows, not graded separately).
- Without the SSC, grade stays standard (the choice is refused).
- Turning the SSC off while a non-standard grade is chosen is refused (books in use).

## Tests
A book cyberware item offered, a ruled / limb / tac computer one refused; a beta Datajack's Essence 0.12 and price ×7;
alpha without SSC refused; the Essence total with graded items equals `wareEssence`; SSC can't be turned off with an
alpha item.

## Out of scope
Cyberlimbs and limb options; ware with rules (move-by-wire, reflex enhancers, cranial decks); second-hand cyberware at
creation; delta grade; cyberware bought after creation with a grade (M4b buys standard).

## Draft 2 — changes after round 1 (these win; folded without a round 2)
- The limb gate uses the system's `limbRole` (limb or option, from fields, rule flag or `location`), not the fields.
- Installed `isWeapon` cyberware joins `derive`'s attacks (as Foundry treats it as a weapon), core and book alike.
- Skillwires (Cybertechnology) waits: Foundry grants slotted ActiveSoft skills from it.
- Shadowtech's cyberware is standard grade only (Shadowtech p.40, the system's note).
- An eye accessory placed in a cybereye takes no grade of its own (validate error if non-standard; grade the eye).
- A non-standard grade counts as using the SSC (books in use), in records and finished items.
