# Plan: milestone 5n — the Grimoire's and the CSH's adept powers (sr2e 0.162.0)
_2026-11-25. The system side was Codex-reviewed (sr2e-foundryvtt docs/archive/plans/PLAN-sourcebook-adept-powers.md + its review log:
plan r1–r2, code r1–r2); this is the app's part (that plan's r1 #4), on the 0.162.0 pin._

- **Offered** with their book on: Attribute Boost, Body Control, Missile Parry, Mystic Armor, Suspended State (Grimoire
  p.34); Enhanced Perception (its three tier items) and Extended Missile Parry (CSH p.104). **Enhanced Centering** is
  refused at creation: an initiate's power (initiation comes after creation).
- **Choices**: Attribute Boost asks `boostAttribute` (Body, Quickness or Strength). Any number of Attribute Boosts may be
  added; a repeated attribute is the budget's error. The choice reaches the export (`system.boostAttribute`).
- **Prices and limits** come from the system's `adeptPowerBudget`; its reports are now shown at creation too (before,
  only "over budget" was): a choice not made, a repeat, Mystic Armor over Magic, Enhanced Perception over 1.5 × racial
  maximum Intelligence — and the core ones (a level past the table, a second power on one attribute).
- **derive**: Mystic Armor adds `min(levels, Magic)` to Impact, as Foundry's `CharacterData.mysticArmor`.
- **Found while proving parity — the export now writes the Magic Rating.** Foundry stores `magic.value` (the GM types
  it; only losses change it) and never computes it, so every magician or adept exported by the app arrived with Magic 0.
  `toFoundryActor` writes derive's Magic (Essence-based, p.45) when the character holds none; a held value is kept.
- **Proof**: `test/fixtures/parity/powers-v0.162.0.json` — an app-built adept prepared in Foundry 0.162.0: Impact 2,
  Magic 6, 4.75 power points, Enhanced Perception 5, Body Control 2, no problems; the app derives the same.
