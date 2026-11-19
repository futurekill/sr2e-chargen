# Plan review log: M5a (sourcebook toggles)

## Round 1 (Codex gpt-6-sol, high): 11 findings → Draft 2
1–4, 6. Drugs with effects, special-rule cyberware, armor/damage state, skillsoft chips, foci: accepted — 5a offers
   only plain weapons, armor, ammo, gear and spells from books, with no effects, special rule, drug or skillsoft.
5. Grimoire spells' source-based classification: declined — the app prints no spell damage and keeps the source, so
   Foundry classifies on import.
7. Rulesets: accepted as a statement — books set no ruleset; 5a's items don't depend on one.
8. Reducer has no manifest; finished guard: accepted.
9. Bounds; search lacks the fields: accepted — `offer` computed at catalog build.
10. Old bodies; undo restoring a disabled book's item: accepted.
11. Export claim: removed.

## Round 2 (high): 3 findings → Draft 3
1. setBooks after finishing would rebuild items: accepted (metadata op).
2. Maglocks rated 7 and 10 projected at 6: accepted (refused at creation; authored rating in play).
3. Gas-vent recoil and APDS: declined — the app computes no combat values for any weapon; fields travel unchanged.
Folded without a round 3 (two mechanical changes, pinned by tests).
