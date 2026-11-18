# Plan: milestone 2c-2 — physical adept powers (core book), and the system fix it needs (S13)
_Draft 1 (2026-11-18). Rules: core p.124–126, read on the page (PDF 135–136). Parent: docs/PLAN-M2.md, docs/PLAN-M2c.md._

## Goal
A physical adept spends Magic Rating points on the core book's powers, priced exactly as p.125–126 print them, and the
Foundry system prices them the same way. Today the system prices EVERY power as `pointCost × level` (the sheet's
Cost column, `AdeptPowerData.totalCost`, and the Used total in `CharacterData`); the pure `adeptPowerCost` is used only
by tests. Several core powers are not linear, so Foundry's numbers are wrong for them.

## The book (p.124–126)
- Power points = the adept's Magic Rating (p.124); a lost Magic point costs one point of improvements (p.126).
- **Astral Perception** 2. **Pain Resistance** .5 per point. **Improved Physical Senses** .25 per improvement.
- **Killing Hands**: (Str)L .5, (Str)M 1, (Str)S 2, (Str)D 4; an adept may hold more than one level (p.126).
- **Combat Sense** (table p.125): level 1 = 1 Combat Pool die for 2, level 2 = 2 dice for 3, level 3 = 3 dice for 4
  (the cost of the level, not per level).
- **Increased Reflexes**: +1 die 1, +2 dice 4, +3 dice 6.
- **Increased Reaction** (table "Reaction Bonus — Cost/Point"): a bonus point up to ½ the racial Reaction maximum .5,
  up to the racial maximum 1, up to 1.5 × the racial maximum 2.
- **Improved Physical Attributes** (Body, Strength, Quickness only): each +1 costs by the FINAL attribute rating against
  the racial maximum — up to ½ max .5, up to max 1, up to 1.5 × max 1.5 (Improved Attribute Costs table, p.125).
- **Improved Ability** (p.125): dice for ONE general skill, by area — Athletics .25/die, Stealth .25, Armed Combat .5,
  Unarmed .5, Throwing .5, Projectile .5, Firearms 1, Gunnery 1. Combat Skills: no more dice than the skill's rating.
  Only the listed areas appear in the table.

## System (S13), on branch `chargen/s-prereqs`
1. `adeptPowerCost(power, ctx)` becomes the book's function, by a power KEY (not the name): `ctx = { race maximums,
   the attribute's base rating after racial modifiers, the improved skill's category and rating }`. Keys:
   astral_perception, pain_resistance, improved_senses, killing_hands (level from the entry), combat_sense,
   increased_reflexes, increased_reaction, improved_attribute (+ which attribute), improved_ability. The key is a new
   `system.power` field, filled for the core pack's 14 entries (packs-src + build-packs); entries without a key keep
   `pointCost × level` (custom powers, sourcebook powers until keyed).
2. `CharacterData` computes each power's cost with the actor's context ONCE per preparation and stores it on the item
   (`system.cost`, derived, cleared first — derived-state rule), and Used sums those; the sheet's Cost column reads it.
   `totalCost` stays as the context-free fallback.
3. Combat Sense's pack entry: `maxLevel` 3 (today 1), citation p.125 (today p.86).
4. Validation the sheet reports (never blocks): an attribute or Reaction above 1.5 × the racial maximum; Improved
   Ability on a skill outside the table's areas, or with more dice than a Combat Skill's rating.
5. Changelog: adepts' Used points can change on update (that is the fix); the release notes say so.

## App (M2c-2)
- `addItem` accepts core adept powers (no longer refused). Choices: `level` (1–maxLevel); Improved Physical
  Attributes takes no other choice (the attribute is the entry's); Improved Ability takes `skill` = the item id of a
  skill on this character (required); Improved Physical Senses takes `senses` text naming them (level = how many).
  A power is bought once (per skill for Improved Ability).
- Cost by the system's `adeptPowerCost` with the character's context; the rules check shows power points spent /
  the adept's Magic Rating (after Essence loss), and reports: over Magic; a power on a non-adept; the caps of item 4.
- Tests: each book table row; an elf (Reaction max 6) and a troll (Reaction max 4) buying Increased Reaction 3; a human
  with Quickness 4 buying +3 (5: 1, 6: 1, 7: 1.5 → 3.5); Improved Ability Firearms 3 on Firearms 2 reported.

## Out of scope
Grimoire adept types and powers (M5), initiation, geasa.
