# Code Review Log: the NPC builder
Codex gpt-6-sol. Plan: docs/PLAN-npc-builder.md.

## System part (sr2e 0.171.0) — round 1 (high)
1. **Exported NPCs with transfer effects can preview the wrong numbers.** [npcDerived](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/npc-rules.mjs:53) assumes effects are already applied and accepts no `mods`. For an exported NPC with Quickness 3 and an item granting `quickness.mod +2`, it returns Quickness 3 and Combat Pool 4; Foundry prepares Quickness 5 and Combat Pool 5. **Fix:** Apply summed transfer effects to the exported source before calling the helper, and test that result against a prepared actor.

2. **The Threat helper silently changes invalid choices.** [threatFromDifficulty](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/npc-rules.mjs:27) turns a choice of `6.9` into 6 and accepts `Infinity` for Nearly Impossible. **Fix:** Require a finite integer choice before checking the row’s range.

3. **The required actor parity test is missing.** [npc-rules.test.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/test/npc-rules.test.mjs:33) tests hand-built inputs only; it cannot catch a mismatch involving exported items, forms, armor, or Active Effects. **Fix:** Add the planned Quench comparison against prepared contact NPCs and converted archetypes.

I found no unintended change in the live NPC arithmetic for forms, projection, spent pools, or armor. Vitest could not start in this read-only workspace because it tried to write a temporary config file.

VERDICT: REVISE
Fixed: npcWithEffects applies item transfer effects (ADD on the kept keys; others listed); a Threat choice must be an integer; Quench batch sr2e.npc-derived (22 contact NPCs + an NPC with an effect, armor and a pool bonus; passed live). Archetype parity is the app part's.

## System part — round 2 (medium, fix-only)
VERDICT: APPROVED
## App part (beta.18) — round 1 (high)
- **P1 — Added catalog items lose Foundry behavior and notes.** [shared/npc.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/npc.mjs:182) replaces an item’s flags and omits its catalog text. Adding Gamma-Scopolamine, for example, drops `flags.sr2e.drug`; Foundry uses that flag to recognize a drug. **Fix:** preserve the catalog flags and restore its split text when building the item; test the exported drug.

- **P2 — Choosing a Professional Rating does not resolve a printed range.** [shared/npc.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/npc.mjs:176) leaves `prRange` active. After choosing 4 for the Bounty Hunter, [Npc.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Npc.svelte:106) still says to pick a rating; before a choice, it presents the low end’s withdrawal point as definite. **Fix:** record that a rating was chosen, hide the prompt afterward, and label the low-end withdrawal point beforehand; test both states.

- **P2 — The Team Karma helper silently saves a different Threat Rating.** [Npc.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Npc.svelte:115) shows “Use 21” for 2,100 Team Karma but sends 20. **Fix:** show that 21 exceeds the builder’s bound and prevent applying it; test the boundary.

- **P2 — Older catalog searches can replace newer results.** [Npc.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Npc.svelte:41) accepts overlapping searches without checking which response is latest. A slow first search can overwrite the second search’s picker, leading to the wrong item being added. **Fix:** use a request sequence check before updating `hits` and `pick`; test responses arriving out of order.

VERDICT: REVISE
Fixed: added items keep their catalog flags (book prose stays out, as on every export); picking a Professional Rating settles a printed range (source.prPicked), the low end is labelled before; the Team Karma helper refuses above 20 with a note; catalog searches use a sequence check. Tests added for the first two.

## App part — round 2 (medium, fix-only)
First run returned only "VERDICT: REVISE" with no finding; rerun asking for numbered findings:
1. [client/src/pages/Npc.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Npc.svelte:104): A Bounty Hunter starts with the printed range 3–4 and the selector already showing 3. A user who chooses the low end, 3, triggers no `change` event, so `source.prPicked` stays unset and the page keeps asking them to pick. **Fix:** Add a way to confirm the displayed rating that sends `setProfessionalRating` even when its value is unchanged.

The other three fixes appear correct on inspection. No files were modified.

VERDICT: REVISE
Fixed: a "Keep N" button confirms the shown rating.

## App part — round 3 (medium, fix-only)
No findings for this fix. “Keep 3” sends `setProfessionalRating` with the current rating; the reducer preserves 3, marks the range picked, and removes the prompt. The focused check passed. The broader NPC test run had one unrelated failure because the read-only environment blocked a temporary directory write.

VERDICT: APPROVED
Also before release: library/admin-counts/metavariant tests updated (npc-ops in the 404 walk, npc counts, RACE_KEYS instead of reading the racial tables). Release check: all 29 book NPCs exported and imported into Foundry 0.171.0 give the page's numbers.
