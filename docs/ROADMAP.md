# Roadmap (revised 2026-11-16) — PROPOSED, not yet approved

This roadmap replaces the milestone order in docs/PLAN.md. The user decided on 2026-11-16 that the tool is
**standalone first**: you can create and manage a character for a physical table without Foundry. Foundry is an
optional connector, not the foundation.

## What changed, and why

| Before (docs/PLAN.md) | Now |
|---|---|
| Foundry round trip (M1) is the foundation. Everything waits for it. | Foundry is an optional connector at the end. |
| Any character moves out of a live game with all in-play state (healing, addiction, combat). | Only settled characters move. A new character has no in-play state. |
| The rules engine is EXTRACTED from the live Foundry system (M2), one release per function. | The app USES the system's pure rules and tables directly. It does its own derivation for a character. |

**Evidence for the third row** (measured 2026-11-16 in sr2e-foundryvtt):
- 42 pure rules modules, about 11,400 lines, 915 exports. 40 of them do not touch Foundry at all.
- `module/config.mjs` (82 tables: priorities, racial modifiers, skills …) imports in plain Node today.
- `module/rules/sr2e-rules.mjs` (277 exports: costs, pools, Essence, Karma …) imports in plain Node today.
- The catalog is `packs-src/*.json`: one JSON file for each item (gear 112, weapons 86, spells 73, cyberware 69 …).
- The part that is NOT pure is the composition in `CharacterData` (about 1,700 lines). It mixes creation rules
  with in-play state (spent pool dice, Matrix sessions, event logs). The app does not need the in-play part.

No change to the Foundry system is necessary for milestones 1 to 5.

## Milestones

Each milestone gives something you can use. Each has a short plan, a Codex review, and tests.

1. **Catalog.** Build the item catalog from the system and the content modules at pinned versions. Browse and
   search it in the app, with page references. (This was M3b's first item.)
2. **Create a character (core book).** The Priority system, step by step: priorities, metatype, magic, attributes,
   skills, resources, contacts, lifestyle. A rules panel shows the budget and each error with its page reference.
   The app computes derived values (attributes, Essence, Reaction, Initiative, pools, armor, monitors) with the
   system's pure rules.
   - **Parity test:** the app's values for the seven pregens must equal the values Foundry computes. A small
     script exports those values from Foundry one time, as test data.
3. **Printable sheet.** PDF in the Classic style, sized for paper, with the fit rules (no text cut off).
4. **Manage a character.** Karma and advancement, nuyen, purchases, damage, ammo, history.
5. **Sourcebooks.** Book toggles, alternate creation methods, book metatypes, Edges and Flaws.
6. **Release.** Backups, image scan, signature. Then invite the group.
7. **Foundry connector (optional).** Export a character from the app and import it into Foundry as a new actor.
   Export a settled character from Foundry to the app. No in-play state.
8. **Later:** Vehicle Workshop, more themes and sheet styles, NPC builder, social login.

## What is kept from the work done so far
- The app skeleton (M3a): accounts, library, revisions, Docker, CI on four databases. All of it applies.
- The creation rules captured from the books (M0), and the banter.
- The portable bundle format and its schema (system branch `chargen/m1a-portable`). Milestone 7 uses it.

## What is parked
- The adapters that move in-play state between worlds, and the import safety machinery
  (system branch `chargen/m1a-portable`, docs/PORTABLE-BUILD-LOG.md there). Nothing is deleted.
- The derive extraction (sr2e-foundryvtt docs/PLAN-derive.md).

## Risks
- **Two compositions can drift.** Foundry and the app each put the pure rules together. The parity test on the
  pregens, plus more test characters over time, is the control.
- **A rule that exists only inside `CharacterData`.** If the app needs one, move that one function to a pure
  module in the system (a small, tested change), as the system already does for new rules.
- **Version skew.** The app pins a system version. A newer system can change a rule; the parity test finds it
  when the pin moves.
