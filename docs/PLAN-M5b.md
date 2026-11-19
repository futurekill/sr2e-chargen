# Plan: milestone 5b — metavariants (Shadowrun Companion p.39–44)
_Draft 3 (2026-11-19), BUILT (system aaf6da08 on release/0.161.0; app chargen/on-0.161) after Codex plan rounds 1–2 (10 + 1 findings; docs/PLAN-M5b-REVIEW-LOG.md; the "Draft 2" and "Draft 3" sections win). Roadmap item 5, second slice. Needs a system change (Foundry ignores a metavariant today), so
it is built on the system branch `release/0.161.0` (unreleased; released after the Friday game) and the app branch
`chargen/on-0.161`. Shapeshifter characters (Companion p.36–38, their own creation table) are 5c; Edges and Flaws 5d._

## The book (read on the page renders, 2026-11-19)
- p.39 "Metahuman Variants": each variant "receive[s] the standard <base> racial modifications" with listed
  exceptions; no priority change is stated (it is the base metatype's Race priority). Every variant gets a **Hostile**
  reaction in initial social contacts with other metahumans (Social Skill Table, core p.182).
- The exceptions (each checked against the catalog's Shadowrun Companion race items — all 14 match):
  Cyclops (troll) +6 Str (max 10), no Dermal Armor, +2 TN on ranged attacks (no depth perception); Fomori (troll)
  +4 Body +3 Str, no Dermal Armor, no Charisma penalty; Giants (troll) +5 Str, no Dermal Armor; Minotaurs (troll)
  Body +4, Str +3, Cha −1, Int −1; Koborokuru (dwarf) no Quickness penalty; Menehune (dwarf) +2 Body; Gnomes (dwarf)
  +2 Willpower; Hobgoblin (ork) +2 Body, no Intelligence penalty; Ogre (ork) no Charisma penalty; Oni (ork) standard
  ork — and, at the GM's discretion, a MAGICAL oni may take Resources A, Race B, Magic C; Satyr (ork) −1 Quickness,
  +1 Willpower; Wakyambi (elf) +1 Willpower, no Quickness bonus; Dryads (elf) −1 Str, −1 Body, +3 Cha, a Mild allergy
  to urban areas, a limited Animal Empathy edge (birds and small tree-living animals); Night Ones (elf) +2 Quickness,
  a Mild allergy to sunlight.
- Racial MAXIMUMS stay the base metatype's (the only maximum the book names, the Cyclops' Strength 10, is the troll's).

## System (release/0.161.0)
1. **Data**: `CharacterData.metavariant` = `{ name: "", source: null, attributeMods: {6 attributes, 0},
   abilities: [] }` (empty name = none). Dropping a race item: a core race item (citation book sr2, or no
   `attributeMods` differing from the table) clears it; a sourcebook race item whose `raceKey` is dwarf/elf/ork/troll
   writes it from the item (`name`, compendium source, `attributeMods`, `specialAbilities`) in the same update as
   `system.race`. Shapeshifter items unchanged.
2. **One pure profile** `racialProfile(sys, tables)` (sr2e-rules.mjs) → `{ mods, maxes, abilities }`: mods = the
   variant's `attributeMods` when it has a name, else `tables.racialModifiers[race]`; maxes = always the base
   metatype's; abilities = the variant's when named, else the table's.
3. Every reader moves to it: `CharacterData` racial mods (line ~1262), maximums (~1413, ~1450, ~1478, adept budget
   ~610), sheet-actions racial maxima (~4621), and `dermalDice` (troll +1 only while `dermal_armor` is among the
   abilities — Cyclops, Fomori and Giants get none). Race-keyed rules that stay with the base metatype: run
   multiplier, the metahuman allergy bonus, a troll cyberlimb's base Strength 8 (Cybertechnology p.51).
4. The Cyclops' +2 ranged TN: `testTnModifiers` for ranged weapon attacks when the actor's metavariant source is the
   Cyclops item (by compendium source, as other rules tables). The innate Mild allergies (Dryads: urban areas; Night
   Ones: sunlight) and the Hostile social reaction are shown on the sheet as the variant's notes (not automated: the
   allergy system is the chargen allergy-for-points; the GM applies these).
5. Tests: unit (profile for each variant vs the book list above, maxima unchanged, dermalDice 0 for a Cyclops);
   Quench: drop Cyclops → Strength racial +6, no dermal die, a human race item afterwards clears it.

## App
- `setMetatype { race, variant? }` (`variant`: a catalog race id): needs the Shadowrun Companion turned on (M5a
  books), the entry's `raceKey` equal to `race`, not a shapeshifter. Writes `sys.metavariant` exactly as Foundry's drop
  does (the same shape, from the same entry). Changing `race` clears it.
- `derive`, `validate`, `withRacial` and every racial-maximum read in shared/creation.mjs use `racialProfile`.
- Metatype step: with the Companion on, each base metatype lists its variants (name, modifiers, notes, page).
- Oni's alternative priorities: a magical oni MAY have Race B (not A) — the rules check accepts Race B for an oni with
  Magic C and Resources A when the GM option "Oni priority (Companion p.42)" is on (a `creation.options` flag, off by
  default, shown only with the Companion on).
- Sheets: "Troll (Cyclops)" and the variant's notes (Hostile reaction; Cyclops ranged +2 TN; Dryad/Night One allergy).

## Tests
App: a Cyclops' Strength racial +6 and troll maxima; a Koborokuru's Quickness 0; changing race clears the variant;
refused without the Companion; refused when the variant's base differs; the oni option; the sheet line. A parity test:
for every variant, the app's `derive` attributes equal the system's `racialProfile` application.

## Out of scope
Shapeshifters (5c), Edges and Flaws (5d) — the Dryad's limited Animal Empathy is noted, not an Edge item yet;
albinism (needs Flaws).

## Key decisions to challenge
1. Store the variant's data on the actor (from the race item) rather than a new rules table.
2. Maxima stay the base metatype's.
3. Allergies and the Hostile reaction are notes, not automation.

## Draft 2 — changes after round 1 (these win)
- **Identifying a variant** (r1 #1, #2): a race item is a metavariant when its citation book is NOT the core book and
  its `raceKey` is dwarf, elf, ork or troll — never by comparing modifiers (an Oni's equal the ork's). The app takes
  only such a catalog race entry, from a turned-on book, whose `raceKey` equals the chosen metatype.
- **The field** (r1 #3): `metavariant: SchemaField { name: String (blank), source: String (blank, the compendium
  source or ""), book: String (blank), base: String (blank: the raceKey it belongs to), attributeMods: SchemaField of
  six integers (initial 0), abilities: ArrayField(String) }`. No migration (the defaults are "none"). `racialProfile`
  treats the variant as absent unless `name` is set AND `base === race`, so a direct `system.race` change can never
  leave its modifiers on the wrong metatype; the race drop and the app's `setMetatype` clear it whenever the race
  changes.
- **Every reader** (r1 #4): also `module/karma-advance.mjs` (advancement thresholds) — a test raises a Cyclops'
  Strength past the base maximum path.
- **The app's copy** (r1 #5): `shared/rules.mjs` exposes `racialAbilities` and `racialProfile`; the system commit is
  synced into the app (`content:sync` with the local tag re-pointed) before the app work and its parity test.
- **Books in use** (r1 #6): `booksInUse` counts `sys.metavariant.book`.
- **The oni priorities** (r1 #7): Companion p.42 — "players creating magical oni characters may select Resources as
  Priority A, Race as Priority B and Magic as Priority C". Magic C buys a metahuman ADEPT (core p.45), so the GM option
  `oniPriority` (off by default; shown with the Companion on) lets an Oni take Race B exactly when Resources is A,
  Magic is C and the magic type is physical adept; any other Race-B oni is the usual "metahumans need Race A" error.
  Foundry's priority display labels Race B "Human, or an Oni with the Companion option" when the actor is an oni.
- **NPCs** (r1 #8, declined): NPC stat blocks are authored and take no race drop; a variant NPC is the GM's sheet
  edit. Out of scope.
- **Cyclops ranged +2 TN** (r1 #9): the weapon roll's `tnContext` gains `ranged: weaponType !== "melee"` (firearms,
  launchers, bows and thrown weapons — all lack depth perception); `testTnModifiers` adds +2 "no depth perception
  (Companion p.39)" when the actor's variant source is the Cyclops item. Tests: firearm +2, thrown +2, melee 0.
- **Foundry's sheet** (r1 #10): the header shows "Troll (Cyclops)" and the variant's notes (Hostile reaction, the
  Cyclops' ranged TN, Dryad/Night One allergies) under the race.

## Draft 3 — changes after round 2 (these win)
- The client's Attributes tab (and any other client read of `TABLES.racialModifiers`/`racialMaximums`) uses
  `racialProfile` too; a grep test fails on a direct table read outside `racialProfile`.
