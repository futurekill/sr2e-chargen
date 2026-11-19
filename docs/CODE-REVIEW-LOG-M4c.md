# Code review log: M4c (damage, ammunition, cybersurgery), 2026-11-19

## Round 1 (Codex gpt-6-sol, high): 2 findings, both fixed
1. Surgery undo on a character finished before M4c left the monitor the surgery created. Fixed: the entry records
   that there was none; undo removes it (test).
2. The Successes field kept a stale number when cleared and accepted 1.5 as 1. Fixed: only a whole number 0–30 counts;
   Install is disabled with a message otherwise.

## Round 2 (medium, fix-only): APPROVED
