# Code review log: milestone 2b (skills)
Codex gpt-6-sol, read-only. Round 1 high; round 2 fix-only, medium. Reviewed cdcef91; fixes 0fc0e26, 2bc244b.

## Round 1 — Codex
- **P1 — Free languages can carry unpaid tiers.** [shared/creation.mjs:270](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:270): Add a language, then set `allocated: 12`, a concentration, a specialization, and `freeLanguage: "native"`. The server accepts it, records 0 Skill Points spent, and reports no Skills error, while the specialization has rating 14. **Fix:** Reject or clear allocation and tiers when a language is marked free.

- **P2 — The skill cap is checked before tier reductions.** [shared/creation.mjs:272](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:272), [Character.svelte:221](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:221): Seven points with a concentration produce general rating 6 and concentration rating 8, yet validation flags the allocation and the UI caps input at 6. The cited plan allows higher concentration ratings. **Fix:** Apply the starting cap to the resulting general rating and permit the corresponding allocation in the UI.

- **P2 — Any language can claim the free local dialect.** [shared/creation.mjs:142](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:142): A Street character can mark German as `dialect`; validation accepts it at zero cost, though the p.74 benefit is for a local dialect. **Fix:** Restrict that free choice to an explicitly identified local dialect.

- **P2 — Custom names bypass the magical-skill check.** [shared/creation.mjs:129](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:129): `addCustomSkill` with `category: "knowledge", name: "Sorcery"` creates a nonmagical Sorcery item for a mundane character; validation raises no Magic Rating error. **Fix:** Reserve the core magical skill names for catalog entries.

- **P2 — A pending add can save after the user leaves.** [Character.svelte:35](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:35): Click Add while the catalog detail request is pending, then navigate away; when it resolves, `change()` still posts the skill to the old character. **Fix:** Cancel or discard the pending add when the component is destroyed.

VERDICT: REVISE
### Response
Accepted 1, 2, 4, 5 and fixed. 2 is a reading of p.45 recorded as docs/RULINGS.md R1 (book text checked on the page). Rejected 3: the book names example dialects, not a list (RULINGS R2).

## Round 2 — Codex
- [client/src/pages/Character.svelte:185](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:185): The instructions still say skills can be bought only “from 1 to 6.” A player buying Firearms with a concentration can now legally allocate 7 points, but the page tells them otherwise. **Fix:** Explain that the general rating is capped at 6 after the concentration or specialization reduction.

The other three fixes appear correct; all 15 creation tests pass.

VERDICT: REVISE
### Response
Accepted: the help text now states the cap after the reduction (2bc244b). Text-only; not re-reviewed.
