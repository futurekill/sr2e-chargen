# Plan: milestone 2c-2 — physical adept powers (core book), and the system fix it needs (S13)
_Draft 2 (2026-11-18), after Codex plan round 1 (10 findings, all accepted; docs/PLAN-M2c-2-REVIEW-LOG.md). Rules: core
p.124–126, read on the page (PDF 135–136). Parent: docs/PLAN-M2.md, docs/PLAN-M2c.md._

## Goal
A physical adept spends Magic Rating points on the core book's powers, priced exactly as p.125–126 print them, and the
Foundry system prices them the same way. Today the system prices EVERY power as `pointCost × level` (the sheet's
Cost column, `AdeptPowerData.totalCost`, and the Used total in `CharacterData`); the pure `adeptPowerCost` is used only
by tests. Several core powers are not linear, so Foundry's numbers are wrong for them.

## The book (p.124–126)
- Power points = the adept's Magic Rating (p.124); a lost Magic point costs one point of improvements (p.126).
- **Astral Perception** 2. **Pain Resistance** .5 per point (the book discusses 10 points: no cap but the Magic
  Rating). **Improved Physical Senses** .25 per improvement.
- **Killing Hands**: (Str)L .5, (Str)M 1, (Str)S 2, (Str)D 4; an adept may hold more than one level (p.126).
- **Combat Sense** (table p.125): level 1 = 1 Combat Pool die for 2, level 2 = 2 dice for 3, level 3 = 3 dice for 4
  (the cost of the level, not per level).
- **Increased Reflexes**: +1 die 1, +2 dice 4, +3 dice 6.
- **Increased Reaction** (table "Reaction Bonus — Cost/Point"): a bonus point up to ½ the racial Reaction maximum .5,
  up to the racial maximum 1, up to 1.5 × the racial maximum 2.
- **Improved Physical Attributes** (Body, Strength, Quickness only): each +1 costs by the FINAL attribute rating against
  the racial maximum — up to ½ max .5, up to max 1, up to 1.5 × max 1.5 (Improved Attribute Costs table, p.125).
- **Improved Ability** (p.125): dice for ONE general skill, by area — Athletics .25/die, Stealth .25, Armed Combat .5,
  Unarmed .5, Throwing .5, Projectile .5, Firearms 1, Gunnery 1. Combat Skills: no more dice than the skill's rating;
  no other cap (only the Magic Rating). Only the listed areas appear in the table.

## System (S13), on branch `chargen/s-prereqs`
1. **Which power it is** comes from the item's compendium source (a `POWER_SOURCES` map of the core pack's 14 uuids →
   key, as `wareRule` identifies cyberware), or a `flags.sr2e.power` override for custom items — no schema field, so
   embedded powers in existing worlds are recognized without a migration (r1 #3). Keys: astral_perception,
   pain_resistance, improved_senses, killing_hands, combat_sense, increased_reflexes, increased_reaction,
   improved_attribute (the attribute from `attributeMods`), improved_ability. Unrecognized powers keep
   `pointCost × level`.
2. `adeptPowerCost(power, ctx)` becomes the book's function by key; `ctx = { racialMax (the race's maximums), base
   (the attribute's rating after racial modifiers, before the power), skill: { name, rating } }`. Improved Ability's
   area comes from the improved skill's NAME (the eight skills of the table; any other skill: no book price → reported,
   priced at `pointCost × level`).
3. **One derived cost map per actor** (r1 #10): `CharacterData` computes `adeptPowerCosts = { [itemId]: cost }` every
   preparation (a fresh object each time, never persisted — derived-state rule, r1 #5), and Used = its sum; Used and
   Max are reset for every actor first, so a changed magic type leaves nothing behind. All three displays read it —
   the actor sheet's Cost column, the item sheet (`item-body.hbs`) and the chat power card (`documents/item.mjs`) —
   falling back to `totalCost` for an unowned item (r1 #6).
4. **Combat Sense works**: its level's dice are added to the Combat Pool in preparation (today the pool ignores it),
   with a unit test of the pool (r1 #2). Pack: `maxLevel` 3, citation p.125.
5. **Pack data**: Pain Resistance and Improved Ability `maxLevel` raised to 10 (the Magic Rating is the real limit);
   the descriptions and notes that state other limits or costs (Improved Ability, Pain Resistance, Killing Hands (D))
   corrected to the book (r1 #1 #8). `npm run build-packs` after.
6. **Reports, never blocks**: Used above Magic (an existing adept repriced by the update shows it; the player and GM
   choose which improvement to give up, p.126 — nothing is deleted, r1 #4); an attribute or Reaction above 1.5 × the
   racial maximum; Improved Ability on an unlisted skill or with more dice than a Combat Skill's rating.
7. **Before release**: open the test world's adepts (the Tiger pregen and any others) and list each one's Used before
   and after in the release notes; the CHANGELOG says Used can change and why.
## App (M2c-2) — after the system release (the app runs the PINNED system copy, r1 #9)
- The content sync brings the released `adeptPowerCost`; `shared/rules.mjs` exports it. Until then core adept powers
  stay refused (as today).
- `addItem` accepts core adept powers. Choices: `level` (1–maxLevel); Improved Physical
  Attributes takes no other choice (the attribute is the entry's); Improved Ability takes `skill` = the item id of a
  skill on this character (required), projected to the system's `improvedSkill` as that skill's NAME (what the system
  matches), re-resolved on every rebuild; a removed skill is reported (r1 #7); Improved Physical Senses takes `senses` text naming them (level = how many).
  A power is bought once (per skill for Improved Ability).
- Cost by the system's `adeptPowerCost` with the character's context; the rules check shows power points spent /
  the adept's Magic Rating (after Essence loss), and reports: over Magic; a power on a non-adept; the caps of item 4.
- Tests: each book table row; an elf (Reaction max 6) and a troll (Reaction max 4) buying Increased Reaction 3; a human
  with Quickness 4 buying +3 (5: 1, 6: 1, 7: 1.5 → 3.5); Improved Ability Firearms 3 on Firearms 2 reported.

## Out of scope
Grimoire adept types and powers (M5), initiation, geasa.
