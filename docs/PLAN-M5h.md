# Plan: milestone 5h — point-based design (Shadowrun Companion p.20–21)
_Draft 2 (2026-11-19), BUILT after a Codex plan round (7 findings, all accepted). The last creation method; carries M5g round 1's findings #1–#5 and #7. Values read on the
page renders of p.20–21 (2026-11-19)._

## The book
The GM declares a Building Point allotment (100 recommended; "a range" allowed). Costs: Race metahuman 10, human 0;
Magic: magician 20 (gets 30 Force Points), physical adept 15 (no Force Points: powers use the Magic Rating);
Attributes 2 BP per Attribute Point; Skills 1 BP per Skill Point (Concentrations/Specializations add nothing beyond
the p.70 allocation); extra Force Points 2 per BP, and a magician may sell Force Points at 2 per BP; Resources by tier
(0¥ −5, 500¥ 0, 5,000¥ 5, 90,000¥ 10, 200,000¥ 15, 400,000¥ 20, 650,000¥ 25, 1,000,000¥ 30). Edges and Flaws: balance
to 0 as usual, or, if the GM allows, Edges cost BP and Flaws add BP (p.22–23).

## System (release/0.161.0)
1. `chargen.priorityMethod` gains "points"; new fields `chargen.buildingPoints` (integer 1–1000, initial 100: the book only recommends 100; code review declined 20–300),
   `chargen.nuyenTier` (one of the eight tiers, initial 500), `chargen.forcePointTrade` (integer, initial 0),
   `chargen.qualitiesUseBP` (boolean, initial false). No migration (defaults).
2. `chargenBudget` keeps ONE spend path (r1 #3): its body becomes `budgetFor(system, items, allot, vr2, freeContacts)`
   (chargenSpend + vehicles, as today); the priority/sum-to-10 call builds `allot` from the table as now; the points
   call builds it from the BP choices:
   - attributes/skills: no separate cap (the allotment is what was bought): `total = spent`;
   - resources: the tier's nuyen + the allergy's nuyen bonus;
   - Force Points: 30 for a full magician + 2 × trade + the allergy's and Bonus Force Point's (r1 #5: trade allowed
     only for a full magician; the total may not go below what's already spent, nor below 0);
   - Building Points: race (10 for a metahuman — dwarf, elf, ork, troll or their variants), magic (20 / 15 / 0),
     2 × (attribute points bought − the allergy's attribute bonus, floor 0), skill points − the allergy's and Bonus
     Skill Point's (floor 0), the tier's cost, + trade, and Σ quality values when `qualitiesUseBP`;
     `buildingPoints: { spent, total, remaining, over, parts }`.
3. Foundry's creation panel: the method select gains "Point-based (Companion)"; under it the panel shows the BP fields
   and the BP row (spent / total, each part), and hides the priority letters.
4. `qualityAudit` skips only its balance check when `qualitiesUseBP` (r1 #2).
5. Tests: unit — the book's Virgil example (p.21: human 0, none 0, attributes 21 points 42, skills 54, 400,000¥ 20,
   …) totals; each part; trade bounds; Quench — the panel's BP row for a points character.

## App
- `setMethod` accepts "points" (Companion on); op `setPoints { buildingPoints, nuyenTier, forcePointTrade,
  qualitiesUseBP }` (r1 #1), bounded at the door and in the reducer.
- validate under points: the priority letters and their metatype/magic checks are skipped; a shapeshifter is refused
  ("its own table"); the BP overrun is an error (r1 #4: so finishing can't convert unspent nuyen while BP is overspent);
  Force Points over are an error as before.
- Karma Pool (r1 #7): p.47 as written — metahumans start with 2 (1 under More Metahumans) whatever the method (R12;
  the point method's race cost is the book's own balance, and p.47 doesn't depend on the method).
- Priorities step under points: the BP panel (allotment, nuyen tier, Force Point trade for a magician, the GM option for
  Edges/Flaws as BP) and the running total with its parts.
- Sheets: "Point-based, N BP" on the header.

## Out of scope
The GM's other variations (altered magic priorities, rating limits other than 6).

## Draft 2 — changes after round 1 (these win; folded without a round 2)
- Point mode's resources overrun is an error on its own (not gated on a Resources letter).
- Force Point trade: purchases unbounded by the book except the BP total; sales at most the magician's 30 (−15 BP), and
  the resulting total never below what's spent nor 0; only a full magician trades.
- `qualityAudit` skips the balance only when the method is "points" AND `qualitiesUseBP` is set.
- Magic types Foundry knows besides the core two (`shamanic_adept`, `magical_adept`, Grimoire): not priced by the
  table — refused under points ("not in the Building Points Table").
- Blank priority letters: Foundry's priority fields are plain StringFields (no choices), so "" stays valid; nothing to
  emit.
- Foundry's panel under points: the priority warnings (duplicates, sum) are hidden; a shapeshifter is reported ("its
  own table: use standard priorities").
- The app's synced system copy is re-pinned before the app work, as every slice.
