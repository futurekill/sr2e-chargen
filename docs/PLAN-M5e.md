# Plan: milestone 5e — bioware at creation (Shadowtech)
_Draft 2 (2026-11-19), BUILT after a Codex plan round (6 findings, all accepted; docs/PLAN-M5e-REVIEW-LOG.md). Roadmap item 5, fifth slice. Foundry already models bioware fully (BiowareData, Body Index,
cultured grade, `effectiveBodyCost`, `bodyIndexTotal`, `overstressPenalty`, Essence for the Awakened); this slice lets
the app BUY it at creation, for the implants whose numbers the app computes exactly as Foundry does._

## Offered (the M5a pattern: plain data only)
Bioware from Shadowtech (book `st`, turned on) when it has no ware rule (`wareRule(flags, source)` null), is not
`triggered`, and has no `damageCompensator`, `ignoresStunPenalty`, `activeSkillDice` or armor. That admits Tailored
Pheromones, Nephritic Screen, Tracheal Filter, Toxin Extractor, Platelet Factory, Pathogenic Defense, Reflex Recorder,
Toxin Exhaler, Synthacardium, Symbiotes, Extended Volume, Trauma Damper, Mnemonic Enhancer. Waiting (their own rules):
Adrenal Pump, Pain Editor, Damage Compensator, Enhanced Articulation, Synaptic Accelerator, Cerebral Booster, Muscle
Augmentation, Orthoskin, Suprathyroid Gland.

## Choices and projection
- `rating` (the rows' ratings, capped at 6 at creation as other gear) and `grade` (standard / cultured; neural bioware
  has no grade choice: always cultured, its price and Body Cost already figured, Shadowtech p.7 — the system's own
  rule). Projection copies the rating row (`bodyCost`, `cost`, `availability`, `streetIndex`) as `BiowareData`'s
  preparation does, sets `installed: true`.
- The price is the system's `chargenItemCost` (bioware is in `CHARGEN_RESOURCE_TYPES`; the grade multiplier ×4 for
  cultured is in `itemBaseCost`).

## Derived and checked
- Body Index = `bodyIndexTotal` over installed bioware (unrounded; shown rounded to 2); its maximum is the natural Body
  (base + racial + Edges, as Foundry's `_naturalAttribute("body")`).
- Essence: an Awakened character (any magic type) loses Essence equal to the Body Index (Shadowtech p.6); Magic from
  Essence as before. Validate: Essence below 0 is the existing error; the Body Index over the maximum is a WARNING
  ("overstress: +N to Body tests", `overstressPenalty`), as Foundry only displays it (the system plan's decision).
- Attribute bonuses × rating into `derive`'s mods (Tailored Pheromones' Charisma).
- Sheets: a Bioware block (name, rating, grade, Body Cost, page) and "Body Index x / y".

## Tests
Offered/refused per the gate; Body Index and the cultured 0.75×; a magician's Essence 6 − Body Index; a mundane's
unchanged; overstress warning; price parity with `chargenItemCost`; a neural item has no grade choice; Pheromones
Charisma +rating.

## Out of scope
Bioware bought after creation (surgery, M4c's pattern) and the rule-bearing implants above; bioware damage.

## Draft 2 — changes after round 1 (these win; folded without a round 2)
- Reflex Recorder (needs a skill) and Toxin Exhaler (needs a toxin and a dose surcharge) wait too.
- Neural bioware keeps the catalog's `standard` grade (no grade choice): Foundry reads `cultured` for bioware damage, and
  a neural item's price and Body Cost already include culturing.
- The Body Index's Essence loss (Awakened only) in all three app paths: creation validate, the in-play validate and
  `derive` (and so the sheets).
- The Body Index maximum is the form-aware natural Body (a shapeshifter's human form included), as Foundry's.
- Toxin Extractor, Pathogenic Defense and Mnemonic Enhancer: rating at most the unaugmented Body (their entries) —
  a validate error.
- Price parity is tested against the system's `budgetItemInput` on a prepared-shape item (rated, cultured, neural),
  not `chargenItemCost` against itself.
