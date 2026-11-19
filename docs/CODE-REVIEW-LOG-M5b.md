# Code review log: M5b (metavariants), 2026-11-19

System commits aaf6da08 + 932769f4 (release/0.161.0); app chargen/on-0.161.

## Round 1 (Codex gpt-6-sol, high): 4 findings
1. Foundry read racial maximums from the table in four places. Fixed: all through `racialProfile` (values unchanged:
   variants keep base maxima).
2. Move the Cyclops +2 into `testTnModifiers`. Declined: it is an attack modifier, added in both weapon branches
   (thrown weapons take the melee one) and listed on the attack card; the pure `cyclopsRangedTN` is unit-tested.
3. The app picker hid a variant's notes until picked. Fixed: each option shows its notes.
4. Foundry's notes were only in a tooltip. Fixed: visible text under the race.

## Round 2 (medium, fix-only): APPROVED
