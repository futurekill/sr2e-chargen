# Plan Review Log: NPC builder
Started 2026-11-27. Codex gpt-6-sol, fresh session per round.

## Round 1 — Codex
- `setMagic` and `addItem` already exist in the character operation schema. Adding NPC versions to the shared map would change character requests. **Fix:** use separate operation schemas for each document kind.
- The app copies only an allowlisted set of system rule modules; `npc-rules.mjs` is absent. **Fix:** add it to `RULES_ENTRIES` and update the content pin before importing it.
- Runner catalog entries are shaped data, not full actor sources: biography text and embedded item IDs have been changed or removed. **Fix:** keep full runner sources in a checked sidecar, or specify how conversion rebuilds every field.
- NPC preparation does not apply cyberware or adept item modifiers as character preparation does. Razor and Tiger will fail the promised conversion parity test. **Fix:** bake their prepared bonuses into NPC stats, or narrow the parity claim.
- `npcDerived(system, items)` cannot alone reproduce Foundry preparation, which also uses Active Effects, parent state, spent pools and substance effects. **Fix:** define the prepared inputs and test those paths before promising equal numbers.
- Newly added armor starts unequipped, and the operations offer no way to equip it; the same problem affects other item states. **Fix:** add validated equip, install and active state operations.
- The plan says “no caps but the schema’s,” yet `setAttribute` caps values at 20 while Foundry has no upper cap; 60 years makes the Troll Bouncer’s Body 24. **Fix:** remove the arbitrary cap or state and handle experience overflow.
- A positive Threat Rating still exports an NPC with a usable Combat Pool, contrary to the quoted rule, and Foundry does not roll human Threat dice. **Fix:** implement the play behavior or describe the feature as a manual recording aid.
- `loadCatalog` compares the manifest exactly; adding `npcsSha256` will fail that check unless the loader changes. **Fix:** exclude the new checksum from the catalog comparison and verify `npcs.json` separately.

VERDICT: REVISE
### Claude's response
All 9 accepted: separate NPC_OPS and route (#1); RULES_ENTRIES + pin (#2); full sources of contact NPCs and archetypes in npcs.json (#3); archetype conversion bakes prepared values (#4); npcDerived scoped to the NPC as exported, with item transfer effects (#5); setEquipped (#6); input bounds stated, experience refused past them (#7); Threat Rating described as a recording aid (#8); npcsSha256 out of the manifest comparison (#9).

## Round 2 — Codex
- Tiger’s Combat Sense adds one Combat Pool die as a character, but NPC preparation ignores it. The promised archetype parity test will fail. Fix: support a baked NPC Combat Pool adjustment.
- All 22 contact sources omit Threat Rating, so Foundry defaults each import to 1 without a user choice. Fix: set missing ratings to 0 when creating a builder NPC.
- Four contacts have printed Reaction modifiers, but no NPC operation can edit that modifier. Fix: add a validated `setReactionMod` operation.

VERDICT: REVISE
### Claude's response
All 3 accepted: NPC field combatPoolBonus (baked from the archetype's prepared pool) + setCombatPoolBonus; every new NPC starts at Threat 0; setReactionMod.

## Round 3 — Codex
- A blank NPC cannot add skills absent from the catalog, such as the Bartender’s Rumormill. Add an operation for custom skills.
- `setMagic` cannot set a shaman’s totem, which Foundry uses for spell and conjuring dice. Add a validated totem field.
- Adding bioware cannot set an NPC’s Body Index; Foundry reads that stored value when calculating magical healing penalties. Add `setBodyIndex`.

VERDICT: REVISE
### Claude's response
All 3 accepted: addCustomSkill; setMagic takes the totem; setBodyIndex.

## Round 4 — Codex (delta)
The custom-skill and totem additions fit Foundry’s schemas. One new flaw remains: `setBodyIndex` is limited to natural Body, but Foundry accepts values above that threshold and uses them to calculate biosystem overstress. Allow nonnegative values above natural Body. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-npc-builder.md:82) · [NPC schema](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1894)

VERDICT: REVISE
### Claude's response
Accepted: setBodyIndex takes 0–99 (above natural Body = overstress). Round 5 is the checkpoint with the user.

## Round 5 — Codex (whole plan, at the user's request)
- **Body Index can be fractional.** Bioware has costs such as 0.25, but the proposed operation types have no decimal field. Fix: make `setBodyIndex` accept a finite number from 0 to 99 and preserve its fraction.
- **Book contacts can have Professional Rating ranges.** The Foundry sources store only the lower number, so showing one withdrawal point misstates contacts rated 3–4. Fix: show the printed range and have the user choose a single rating before showing a definite withdrawal point.
- **Experience is ambiguous for modified attributes.** The Bounty Hunter has Strength 5 plus a modifier of 1; applying 80% to the base gives 10 effective Strength, while applying it to the effective 6 gives 11. Fix: specify that experience scales the stored base and leaves the modifier intact, and test this case.

VERDICT: REVISE
### Claude's response
All 3 accepted: Body Index is a finite number (fractions kept); a printed Professional Rating range is shown until the user picks one; experience scales stored bases (modifiers kept), part of R22 with the Bounty Hunter as the test.
