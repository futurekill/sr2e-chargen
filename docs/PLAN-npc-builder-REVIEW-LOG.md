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
