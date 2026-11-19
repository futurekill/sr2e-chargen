# Code review log: M5h (point-based design), 2026-11-19

## Round 1 (Codex gpt-6-sol, high): 7 findings
1. Allotment bound 20–300 per the plan. Declined: the book recommends 100 and leaves it to the GM; 1–1000 is a sanity
   limit (the plan text corrected).
2. A Force Point trade stranded when leaving magician. Fixed: setMagic clears it.
3. The page's budget rows used the letters. Fixed: Building Points and point totals.
4. Finished sheets printed "?" BP. Fixed: finish stores the spend.
5. The Fohawk sheet printed priority badges under points. Fixed: none.
6. Foundry showed shapeshifter priority warnings under points. Fixed.
7. Foundry's BP row after creation. Fixed: only while creation is open.

## Round 2 (medium, fix-only): APPROVED
