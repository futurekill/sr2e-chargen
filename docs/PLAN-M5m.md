# Plan: milestone 5m — the Reflex Recorder and the Toxin Exhaler (Shadowtech p.27, p.32)
_2026-11-20. Small (the system's docs/PLAN-reflex-recorder.md "The app" section and its r1 #9); built without a separate
Codex round. The system computes the +1 die in play (sr2e 0.161.0); the app records the choice._

- Offered: both sizes (rule `reflex-recorder` joins `BIOWARE_RULES_OFFERED`).
- Choice `skill` = a skill record of this character, Active only (refused otherwise; not Build/Repair, Knowledge,
  Language). The projection writes `recordedSkill` (the name) and, for the Concentration size, `recordedConcentration`
  (that skill's concentration), re-resolved every rebuild.
- validate: no skill → to-do; skill gone → error; Concentration size on a skill without a concentration → error; a
  second recorder of the same size on the same skill (and concentration) → error (not cumulative). A General plus a
  Concentration recorder on one skill is allowed (the rule's max is one die per test).
- Out of scope: showing the die on the app's sheet (Foundry rolls it).

## The Toxin Exhaler (Shadowtech p.32)
- Choice `toxin`, one of `EXHALER_TOXINS` (RULINGS R14). The projection sets `cost` = 30,000 + 100 × the dose price
  (so Foundry's own pricing agrees) and adds "Toxin: X" to the notes. validate: none → to-do; the toxin's book off → error.
- Out of scope: the immunity (double natural Body) and the attack (Quickness (4), range ½ Body): the GM's in Foundry.

## The delta grade (Cybertechnology p.44, rendered 2026-11-20)
- `CYBER_GRADES` adds `delta` (the system's table: Essence ×.5, cost ×10). It needs Cybertechnology on (not the SSC);
  a delta implant keeps that book in use. A warning, not an error: p.44 makes the clinic the GM's ("a player
  character cannot just make an appointment"). Medical fees (×200) are surgery in play: Foundry's.
