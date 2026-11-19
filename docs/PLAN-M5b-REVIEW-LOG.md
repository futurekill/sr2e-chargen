# Plan review log: M5b (metavariants)

## Round 1 (Codex gpt-6-sol, high): 10 findings → Draft 2
1–2. Identify variants by book and raceKey, not modifiers (Oni). Accepted.
3. Field schema and race mismatch. Accepted (base key; profile ignores a mismatched variant).
4. karma-advance reads maxima. Accepted.
5. App's TABLES lack abilities; sync. Accepted.
6. booksInUse misses the variant. Accepted.
7. Oni priorities underspecified. Accepted: Race B with Resources A, Magic C, physical adept, GM option.
8. NPC troll variants. Declined: NPC stat blocks are authored; out of scope.
9. Cyclops ranged needs a weapon signal. Accepted: tnContext.ranged.
10. Foundry sheet header. Accepted.

## Round 2 (high): 1 finding → Draft 3
1. The client Attributes tab reads the base tables. Accepted (+ a grep test). Folded without a round 3.
