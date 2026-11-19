# Plan: milestone 5g — the Companion's creation methods (sum-to-10, point-based design)
_Draft 2 (2026-11-19), BUILT (sum-to-10 only; point-based design is 5h). Roadmap item 5, last slice ("alternate creation methods"). Read on the page renders of
Companion p.20–21 (2026-11-19)._

## The book
- **Sum-to-10** (p.20): each priority becomes a number, A 4, B 3, C 2, D 1, E 0; the player sets the five levels freely
  (letters may repeat) as long as they add up to at most 10. Everything else reads the Master Table as usual.
- **Point-based design** (p.20–21): the GM declares a Building Point allotment (100 recommended; the GM may allow a
  small range). Costs (Building Points Table): Race metahuman 10, human 0; Magic: magician 20 (with 30 Force Points),
  physical adept 15 (no Force Points: powers use the Magic Rating, p.21); Attributes 2 per Attribute Point; Skills 1
  per Skill Point (Concentrations/Specializations add nothing — the p.70 allocation); extra Force Points 2 per Building
  Point, and a magician may sell Force Points back at 2 per Building Point; Resources by tier: 0¥ −5, 500¥ 0, 5,000¥ 5,
  90,000¥ 10, 200,000¥ 15, 400,000¥ 20, 650,000¥ 25, 1,000,000¥ 30. Rating limits are the GM's (6, as standard).
  Edges and Flaws: "in the same manner" (balance to 0), or, if the GM allows, Edges cost Building Points and Flaws add
  them (p.22–23).

## System (pure, release/0.161.0)
`creationMethodBudget({ method, system, items, buildingPoints, nuyenTier, forcePointTrade, qualitiesUseBP, table })`
in sr2e-rules.mjs, next to `chargenBudget` (which stays the priority method's). For "sumTo10" it is `chargenBudget`
with the levels check replaced (the caller passes the same table); for "points" it returns the same row shape
(`attributes`, `skills`, `resources`, `forcePoints`) plus `buildingPoints { spent, total, remaining, over, parts }`.
Unit tests on the book's worked example (Virgil, p.21: 102 points).

## App
- `creation.method`: "priority" (default) | "sumTo10" | "points"; `creation.options.buildingPoints` (default 100,
  20–300), `nuyenTier` (a tier key), `forcePointTrade` (integer; + buys, − sells), `qualitiesUseBP` (GM option).
  Op `setMethod { method }` — allowed only before anything is bought or allocated? No: allowed any time during
  creation; the rules check recomputes.
- Priorities step: per method — the letters (priority), levels with the running sum (sum-to-10), or the Building
  Points panel (points: metatype, magic, nuyen tier, Force Point trade, the BP total and each part).
- validate: the method's budget replaces `chargenBudget`'s; sum-to-10's "levels ≤ 10" replaces "each letter once";
  the metatype and magic priority checks apply only to the priority and sum-to-10 methods (points has no letters);
  a shapeshifter (own table) and the oni option need the priority method.
- finish: starting nuyen from the unspent nuyen as today (p.47).
- Sheets: the method on the header ("Point-based, 100 BP").

## Out of scope
Foundry's own creation panel for the new methods (the export, roadmap item 7, carries `creation.method`);
altered magic priorities and rating limits (GM variations, p.20–21) beyond the default 6.

## Key decisions to challenge
1. A physical adept under points gets no Force Points (book) — unlike R5's priority reading.
2. Edges/Flaws default to balancing to 0 under points; BP use is a GM option.
3. Shapeshifters and the oni option stay priority-only.

## Draft 2 — changes after round 1 (these win; folded without a round 2)
- **Scope cut**: Foundry already implements sum-to-10 (`system.chargen.priorityMethod` "standard" | "sumto10", its
  creation panel's check A=4…E=0 ≤ 10, and "no Sum-to-10 for a shapeshifter"). This slice ships **sum-to-10 only**,
  stored in that same field (r1 #8); point-based design moves to its own slice (5h) with a Foundry panel, since
  Foundry has none — its r1 findings (#1–#5, #7: option ops, BP Edges, the full spend path, the overrun error, the
  Force Point trade bounds, the Karma Pool rule) are carried into that plan.
- Op `setMethod { method: "standard" | "sumto10" }` (creation only); `setPriority` swaps only under "standard" (r1 #6);
  switching back to standard with a repeated letter leaves the "used twice" error to the rules check.
- validate: under sum-to-10, "each letter once" is replaced by "the levels add up to at most 10"; a shapeshifter can't
  use sum-to-10 (error, as Foundry's panel says).
