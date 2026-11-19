# Plan: milestone 5c — shapeshifter characters (Shadowrun Companion p.36–38)
_Draft 3 (2026-11-19), BUILT (system 4472f6a4; app chargen/on-0.161) after Codex plan rounds 1–2 (11 + 3 findings; docs/PLAN-M5c-REVIEW-LOG.md; the Draft 2 and 3 sections win). Roadmap item 5, third slice. Foundry already plays shapeshifters (docs/archive/plans/
PLAN-shapeshifters.md in the system: race "shapeshifter" + species, form modifiers after the base cap, the
Shapeshifter Character Creation Table `SHAPESHIFTER_PRIORITIES`, regeneration, silver, cyberware rejection). This
slice lets the app CREATE one, and fixes one creation gap in the system._

## The book (p.36–38, as the system's plan read it from page renders)
- All shapeshifter characters assign Priority **A to Race**; A buys nothing else. Magic B = magician, C = adept;
  Attributes/Skills/Resources rows as the core table one letter down (the system's `SHAPESHIFTER_PRIORITIES`).
- Base attributes are bought per standard rules, **not above 6**; the species' Human Form / Animal Form modifiers
  apply after, uncapped.
- **No free contacts** at creation: every starting contact is bought with Resources (p.38).
- They cannot accept cyberware (p.38); Severe Allergy and Vulnerability to silver (innate, no creation points).

## System (release/0.161.0)
1. `chargenExtrasCost(contacts, freeContacts = 2)`; `chargenSpend` takes `ctx.freeContacts`; `chargenBudget` passes 0
   for a shapeshifter (`shapeshifterOf`), 2 otherwise. Unit test: a shapeshifter's first contact costs 5,000¥;
   Foundry's creation panel shows it (Quench: the chargen-budget batch gains the case).

## App
- `shared/rules.mjs` exposes the system's `SHAPESHIFTER_PRIORITIES`, `formModifiers`, `SHAPESHIFTER_SPECIES`
  (`module/rules/shapeshift-rules.mjs` and its import `claim-rules.mjs` join the synced rules closure).
- `setMetatype { race: "shapeshifter", variant }`: the variant is required — a Shadowrun Companion race entry with
  `raceKey` "shapeshifter" (its `species`), the Companion turned on. Writes `race`, `shapeshifter.species`,
  `shapeshifter.form = "human"`, clears the metavariant and the allergy-for-points.
- The priority table is `SHAPESHIFTER_PRIORITIES` for a shapeshifter everywhere the app reads one (validate, the
  budget, the Priorities step's labels). Race must be A ("a shapeshifter needs Priority A in Race"); Magic B buys a
  full magician, C a physical adept (the table's own `magic` values).
- `derive` adds the human form's modifiers after the cap (as `_naturalAttribute`); the Attributes tab shows Human Form
  and Animal Form columns; the sheets print both forms.
- Contacts: no "two free contacts" to-do; every contact priced 5,000¥ (buddy etc. unchanged) in the Resources list.
- Cyberware: `addItem` of cyberware is refused for a shapeshifter ("rejects all cyberware, Companion p.38"); after
  creation `installWare` is refused the same way (buying a spare stays possible: it's property).
- Allergy-for-points refused (metahumans only, p.46); the sheet notes the innate silver allergy/vulnerability.

## Tests
App: a wolf shapeshifter with Race A, Magic B magician valid; Race B an error; human-form attributes include the
species modifiers past 6 (a bear's Body); contacts all paid; cyberware refused; the Companion can't be turned off;
parity with the system budget (the app's budget for the shapeshifter equals `chargenBudget` with the shapeshifter
table). System: unit + Quench as above.

## Out of scope
Playing a shapeshifter in the app after creation (form changes, regeneration, silver damage) — Foundry does that;
the app's Condition step records boxes only.

## Key decisions to challenge
1. Buying (not installing) cyberware stays allowed for a shapeshifter after creation.
2. The app shows human form as the character's attributes.

## Draft 2 — changes after round 1 (these win)
- **Magic values** (r1 #1): the shapeshifter table says `"adept"` for C; the app maps it to `physical_adept` (the
  system's own meaning) through one helper used by validate and the budget.
- **More Metahumans never applies** (r1 #2): for a shapeshifter, Race must be A and Magic B/C buy magician/adept
  whatever the option.
- **The cap is on the BASE** (r1 #3): base ≤ 6 is the check ("Base Attribute Ratings may not exceed 6"); the form
  modifiers then apply uncapped, with Foundry's floor of 1. The "after racial modifiers" maximum check is skipped for a
  shapeshifter.
- **A species is required** (r1 #4): validate errors when a shapeshifter has no Companion species; `setMetatype` to
  any other race clears `shapeshifter.species` and sets `form` "human".
- **Books in use** (r1 #5): a shapeshifter counts as using the Companion.
- **Cyberware** (r1 #6): validate reports any cyberware on a shapeshifter during creation as an error (an imported
  item included), besides refusing `addItem`; Essence 6 and Magic ≤ 6 then hold.
- **Karma Pool** (r1 #7; RULINGS R10, the GM may overturn): core p.47 gives the second starting point to METAHUMANS
  (and takes it back under More Metahumans); a shapeshifter is not a metahuman (governments deny them metahuman status,
  Companion p.38) and the Companion adds nothing, so it starts with the **standard 1 point**, with or without More
  Metahumans. System: `startingKarmaPool("shapeshifter")` = 1; CHANGELOG notes the change (it was 2).
- **Contacts everywhere** (r1 #8): the budget (system), the app's Resources prices and the "two free contacts" to-do
  all use 0 free contacts for a shapeshifter.
- **Both forms** (r1 #9, #10): `derive` returns `forms: { human, animal }` (attributes from the capped base + each
  form's modifiers, floor 1; animal form's extra Initiative dice and Reach) beside the human-form values it already
  returns; the sheet model carries both and the PDF, table card and Markdown block print a "Human form / Animal form"
  attribute pair.
- **Closure** (r1 #11): `module/rules/shapeshift-rules.mjs` joins `RULES_ENTRIES` (its import `claim-rules.mjs`
  follows); the client build is checked to resolve it.

## Draft 3 — changes after round 2 (these win)
- The free native language and dialect ratings use the HUMAN-form Intelligence (a fox's +1 counts).
- The base cap applies only during creation (after finishing, Karma may raise a base past 6, as derive already does).
- Animal form carries its dermal dice (a bear's +2 Body for damage resistance) on the sheets.
