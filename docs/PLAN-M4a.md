# Plan: milestone 4a — Karma after creation (awards, advancement, history and undo)
_Draft 3 (2026-11-19), BUILT on the local branches (system release/0.161.0 7907ad57, app chargen/on-0.161), after Codex plan rounds 1–2 (10 + 6 + 3 findings, all accepted, round 3 folded into Draft 3; docs/PLAN-M4a-REVIEW-LOG.md; the "Draft 2" and "Draft 3" sections at the end win). The first slice of milestone 4 ("Manage a character", docs/ROADMAP.md item 4; docs/PLAN.md
"Manager"). Rules: core p.190–191 (docs/RULES-CHARGEN.md "After creation"), read on the page. Built on the local app
branch `chargen/on-0.161` and the system's `release/0.161.0` until that release; later slices: nuyen and purchases
(M4b), damage and ammo (M4c)._

## Goal
After a character is finished, the GM's Karma award is recorded, the player spends Good Karma on the book's
advancement table, every change is an entry in the character's history, and the latest entry can be undone. The
numbers are the Foundry system's: one pure function prices advancement in both places.

## The book (p.190–191)
- An award adds to **Total Karma**; 90% becomes **Good Karma**, 10% the **Karma Pool**. The system's ruling
  (`karmaPoolCapacity`): the pool is one-tenth of Total Karma, rounded UP (p.191 over p.190's "in favor of Good
  Karma"). So an award of N gives Good Karma `N − (⌈(T+N)/10⌉ − ⌈T/10⌉)`.
- **Attributes**: +1 costs the NEW rating; above the racial maximum only with GM approval, at double cost; Reaction,
  Essence and Magic are never raised with Karma.
- **Skills** (Good Karma Cost for Skills table): general skill 2 × new rating; Concentration 1.5 × new rating
  (rounded up, the book's example); Specialization 1 × new rating; Language 1 × new rating. After creation the three
  tiers improve separately. A new Concentration starts from the general rating (Firearms 4 → Pistols 5: 5 × 1.5 = 8); a
  new Specialization from the Concentration, else from the general rating; a brand-new skill at rating 1 costs 1.
  (Every number re-read on the page render before coding.)

## System (on `release/0.161.0`, before that release)
1. **`karmaAward(total, amount)`** → `{ total, good }`: the split above, from `karmaPoolCapacity`'s own rounding.
2. **`advancementCost(step)`**, pure: `step = { kind: "attribute", newRating, overMax } | { kind: "skill", tier:
   "general" | "concentration" | "specialization", category, newRating } | { kind: "newSkill" }` → the Good Karma
   cost, or null for what Karma can't buy (reaction/essence/magic).
3. Foundry's **Karma Advancement** dialog (`advanceKarma`, sheet-actions) prices through `advancementCost` and gains
   the missing rows: raise a skill's Concentration or Specialization, and add a named Concentration or Specialization
   at its starting rating. (Today it offers only attributes, general skills and languages, so Foundry's numbers and
   the app's agree only after this.) Unit tests per table row and the book's three examples; a Quench test of one
   concentration raise through the dialog's code path.

## App
### Data
- After `finish`, creation is frozen (as today). A new top-level `ledger` in the character body: entries
  `{ id, at, kind, summary, karma: { total, good } (the deltas), changes, undoneBy?, undoes? }`, newest last, at most
  1,000 (the oldest beyond are folded into a single "earlier history" line — never silently dropped).
- `finish` also sets every skill's `system.ratingsFinalized = true` (as Foundry's `finalizePendingSkills`), so the
  ratings stay as finished and Foundry won't re-derive them from `allocated`.

### Operations (finished characters only; refused before finishing)
- `awardKarma { amount 1–200, note ≤ 120 }`: `karma.total` and `karma.current` (Good Karma) by `karmaAward`.
- `spendKarma { target }`, target one of:
  - `{ attribute }` (body…willpower): +1 to `system[attr].base`; above the racial maximum needs
    `gmApproved: true` in the op (recorded in the entry), else refused with the reason (p.190);
  - `{ itemId, tier }` (a skill's general, concentration or specialization rating +1);
  - `{ newSkill: catalogId }` (a core skill, rating 1, finalized) or `{ newCustomSkill: { category, name } }`
    (Knowledge/language, as the Skills step allows);
  - `{ itemId, newConcentration: name }` / `{ itemId, newSpecialization: name }` at the starting rating.
  Cost from `advancementCost`; refused when Good Karma is short ("6 needed, 4 available"). The item and attribute
  writes go straight to `actor` (after creation the actor is the authority, PLAN.md D5) — no rebuild from records.
- `undo { entryId }`: only the LATEST entry that isn't undone (so no later change relied on it); writes the inverse
  as a new entry (`undoes`), and marks the original `undoneBy`. An award can't be undone if Good Karma would go
  below 0.
- `setName`, `setNotes`, `setCard` stay as they are.

### Derived and shown
- `derive()`'s Karma Pool becomes `karmaPoolCapacity(total, burned, poolAdjust, race, moreMetahumans)` (equal to the
  starting pool when Total is 0, so the parity fixture is unchanged).
- Character page, when finished: a **Karma** step — Total, Good Karma, Pool; an award form; an advancement picker
  listing every legal raise with its cost (disabled when unaffordable; the over-maximum rows need a "GM approved"
  tick); the history list with **Undo** on the latest entry. The sheets print Good Karma and Total.
- Every op runs through the existing revision-conditional, idempotent `/ops` write (a retried award never pays
  twice).

## Tests
- System: each table row; the three book examples (Firearms 1→2 = 4, Pistols 3→4 = 6, Beretta 5→6 = 6), Firearms 4 →
  new Pistols 5 = 8, Roomsweeper 5 = 5, Strength 5→6 = 6 and human 6→7 = 14, reaction → null; `karmaAward` from
  totals 0, 5 and 9 with awards 1, 5 and 10.
- App: award then spend then undo round-trips to the same body; undo refused on an older entry or on an award whose
  Good Karma is already spent; not affordable; over-max without approval refused; a new skill, concentration and
  specialization; ops refused before finishing; finish finalizes the skills; the idempotent replay of an award.

## Out of scope
Initiation and other Karma uses (Grimoire, M5); Team Karma; the Karma Pool's in-play spending (Foundry's dice);
the sorcery library requirement (p.191: reported later, the app doesn't track libraries); nuyen, gear, damage (M4b/M4c).

## Draft 2 — changes after round 1 (these win)
- **One shared transition** (r1 #1, PLAN.md D13): the system gains `karmaTransition(source, action)` — pure; `source`
  is `{ system, items }`, `action` one of `{ award: n }`, `{ advance: target }`, `{ revert: entry }` — returning
  `{ cost, actorChanges, itemChanges, newItem, summary }` or a refusal reason. It prices with `advancementCost` and
  checks every rule (affordability, Reaction/Essence/Magic, the over-maximum approval, the sorcery library). Foundry's
  dialog and award macro apply its result in ONE `actor.update` (embedded item changes included); the app applies it
  to the body. Parity test: the same source and action give the same changes in both.
- **Skill ratings stay put after finishing** (r1 #2, #3): manager ops edit `actor` and return BEFORE `rebuildItems`
  (a separate branch in `applyOp`, like the metadata ops). `finish` sets `ratingsFinalized: true` on every skill. No
  finished app character exists outside development (M2d is unreleased), so no migration is needed; Foundry's own
  finished characters are finalized by `finalizePendingSkills` already.
- **Rules check after finishing** (r1 #4): `validate()` on a finished character skips the creation checks (budgets,
  the racial maximum, the skill cap of 6) and reports only what stays true in play: Essence ≥ 0, an attribute above
  1.5 × the racial maximum (a warning, p.190).
- **Foundry's award macro** (r1 #5): `macros/award-karma.js` applies `karmaTransition({ award })` — today it adds
  the whole award to Good Karma as well as to Total, so the Pool's tenth is counted twice. The CHANGELOG says so.
- **Languages bought with Karma** (r1 #6): a new language item gets `chargenLanguage: false` (no creation bonus).
- **The Pool shown** (r1 #7): capacity `karmaPoolCapacity(total, burned, poolAdjust, race, mm)` and available
  `karmaPoolAvailable(capacity, spent, drawn)`, both from the source.
- **History** (r1 #8): the ledger holds every Karma change (awards, advances, reverts), with no cap and no folding
  (an entry is ~200 bytes; the document size limit is the bound). Name, notes and card edits are not Karma changes:
  the library's revisions already record them.
- **Undo** (r1 #9): `undo` applies `karmaTransition({ revert: entry })` to the CURRENT source and accepts it only if
  the result is valid (Good Karma ≥ 0, Total ≥ 0, the Pool capacity ≥ burned + spent − drawn, the item or attribute
  still at the rating the entry set). Only the latest entry that isn't undone can be undone; an undo entry itself
  can't be undone (redo = do it again).
- **Sorcery library** (r1 #10): raising Sorcery for a hermetic needs `libraryConfirmed: true` in the action ("has
  access to a sorcery library rated N or more", p.191), recorded in the entry; without it the advance is refused.

## Draft 3 — changes after round 2 (these win)
- **Foundry writes, failure-safe** (r2 #1): the rating first (`item.update`, or `createEmbeddedDocuments` for a new
  skill), checked (a falsy result = refused, nothing charged), then the Karma (`actor.update`); if the Karma write
  fails or is vetoed, the item write is reverted — EVERY field it changed (a new concentration's name AND rating),
  a created item deleted — the same pattern as the vehicle import (r3).
- **Undo order** (r2 #2): the undoable entry is the latest ORIGINAL entry (not a revert) with no `undoneBy`; reverts
  are skipped when looking. So award → spend → undo spend → undo award works, newest first.
- **Pool check** (r2 #3): a revert is valid when Good Karma ≥ 0, Total ≥ 0, and `karmaPoolCapacity(...)` (which has
  already subtracted `burned`) ≥ `spent` (personal points used this encounter; `drawn` is Team Karma, not the
  character's own, r3).
- **The rule context is an input** (r2 #4): `karmaTransition(source, action, { moreMetahumans })` — the app passes
  `creation.options.moreMetahumans`, Foundry its world setting.
- **A new skill's source is an input** (r2 #5): the caller resolves the catalog entry (the app from its catalog, the
  Foundry dialog from the skills compendium) and passes its item source in the action (`{ newSkill: source }`); the
  transition checks it is a skill and returns the item to create at rating 1.
- **Tests** (r2 #6): award → spend → undo leaves the actor's state and Karma as after the award, with both the spend
  and its revert in the ledger.
