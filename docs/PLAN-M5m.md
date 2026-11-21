# Plan: milestone 5m — the Reflex Recorder (Shadowtech p.27)
_2026-11-20. Small (the system's docs/PLAN-reflex-recorder.md "The app" section and its r1 #9); built without a separate
Codex round. The system computes the +1 die in play (sr2e 0.161.0); the app records the choice._

- Offered: both sizes (rule `reflex-recorder` joins `BIOWARE_RULES_OFFERED`). The Toxin Exhaler still waits (its toxin).
- Choice `skill` = a skill record of this character, Active only (refused otherwise; not Build/Repair, Knowledge,
  Language). The projection writes `recordedSkill` (the name) and, for the Concentration size, `recordedConcentration`
  (that skill's concentration), re-resolved every rebuild.
- validate: no skill → to-do; skill gone → error; Concentration size on a skill without a concentration → error; a
  second recorder of the same size on the same skill (and concentration) → error (not cumulative). A General plus a
  Concentration recorder on one skill is allowed (the rule's max is one die per test).
- Out of scope: showing the die on the app's sheet (Foundry rolls it).
