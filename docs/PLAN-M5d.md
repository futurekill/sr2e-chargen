# Plan: milestone 5d — Edges and Flaws (Shadowrun Companion p.22–35)
_Draft 3 (2026-11-19), BUILT after Codex plan rounds 1–2 (11 + 3 findings; docs/PLAN-M5d-REVIEW-LOG.md; the Draft 2 and 3 sections win). Built: qualities ride `addItem` (not a separate op) and Cyberpirates/Rigger 2 qualities wait for their pages. Roadmap item 5, fourth slice. The system already has `quality` items (kind, pointValue,
attribute, attributeBonus, maximumBonus, rule), applies Bonus Attribute Point / Exceptional Attribute in preparation
(`edgeAttr`/`edgeMax`, `attributeEdgeViolations`), and automates eight Rigger 2/Companion rules. Built on
`release/0.161.0` + `chargen/on-0.161`._

## The book (read 2026-11-19: prose from the text layer, every value from the p.35 table render)
- p.22–23: an optional rule (the GM's). With the Priority system a player may take "any combinations of Edges and
  Flaws whose combined point values equal zero". Edges cannot raise Attributes, skills or Spell Force beyond the
  starting limits and maximums except with the GM's approval; a quality modifying a TN never takes it below 2; Edges
  and Flaws don't combine unless noted (Pacifist and Total Pacifist). Removing a Flaw later costs 10 × its value in Good
  Karma (play; out of scope).
- Values (p.35 table): fixed values for most; ranges: High Pain Tolerance Variable, Lightning Reflexes 2/4/6, Will to
  Live 1–3, Day Job 1–3, Good Reputation 1–2, Bonus Force Point 1–3, Magic Resistance 1–4, State-of-the-Art Model
  2/4/6, Allergy −1 to −4, Infirm −1 to −5, Amnesia −2 to −5, Compulsive Variable, Phobia −1 to −4, Bad Reputation
  −1 to −4, Dependent Variable, Hunted −2/−4/−6, Addiction (components: Strongly Addictive −1, Debilitating −1,
  Incapacitating −2), Summoning Talent 3/5. Bio-Rejection −5, Blind −6, Sensitive System −3 are −2 for magically
  active characters. "Variable" = the GM sets it (any whole value, Edges 1–6, Flaws −1 to −6: "no Edge should be worth
  more than 6 points and no Flaw more than −6").
- Creation effects: **Bonus Attribute Point** (1 per point; past the original racial maximum the point costs 2 —
  `attributeEdgeViolations`); **Exceptional Attribute** (+1 racial maximum); **Bonus Skill Point** (+1 skill point per
  point, at most 5, not past the starting limits); **Bonus Force Point** (2 Force Points per point, 1–3);
  **Extra Contact** (1 additional Level 1 contact per point: one more free contact).
- Derived effects the sheets print: **Lightning Reflexes** +1 Reaction per 2 points (not Initiative dice);
  **Will to Live** +1 Damage Overflow box per point.
- Everything else is played at the table (TN modifiers, social, magic, roleplay): shown as the quality's name, value
  and notes.

## System (release/0.161.0)
1. `module/rules/quality-rules.mjs`: `QUALITY_VALUES` keyed by the Companion's compendium source (as
   `QUALITY_SOURCES`): `{ values: [..] }` or `{ variable: "edge" | "flaw" }`, `magicallyActive` for the three reduced
   Flaws; `qualityValuesFor(item, { magicallyActive })`. New rules (QUALITY_RULES, `rule` choices, blank kept):
   `bonus-skill-point`, `bonus-force-point`, `extra-contact`, `lightning-reflexes`, `will-to-live`, resolved by source
   for compendium copies.
2. `chargenBudget`: skills total + Σ bonus-skill-point values; Force Points + 2 × Σ bonus-force-point values (only for
   magicians, as Force Points are); free contacts + Σ extra-contact values (`freeContacts` from 5c). The quality list
   is read from `items`.
3. Preparation: Reaction + ⌊Σ lightning-reflexes / 2⌋ (a `mods.reaction` contribution with its named source); the
   overflow box count + Σ will-to-live.
4. Tests: unit (values per source; budget with each edge; Reaction; overflow), Quench (a character with Bonus Skill
   Point 2 shows 2 more skill points; Lightning Reflexes 4 → Reaction +2).

## App
- Qualities from turned-on books are offered on a new **Edges and Flaws** part of the Concept tab (not the shop): the
  M5a gate adds `quality` for the Companion, Cyberpirates and Rigger 2 entries. A record's choices: `points` (one of
  `qualityValuesFor`, prefilled with the item's value), `attribute` (Bonus Attribute Point / Exceptional Attribute),
  `detail` (free text ≤ 80: the skill for Aptitude/Incompetence, the substance for Allergy/Addiction, the phobia…).
  The projected item gets `pointValue` = points (signed by kind), `attributeBonus` = points for Bonus Attribute Point,
  `maximumBonus` = 1 for Exceptional Attribute.
- `validate`: the qualities' values sum to 0 (error otherwise, "Edges +5, Flaws −3: they must balance"); the
  system's `attributeEdgeViolations`; Bonus Skill Point ≤ 5; a quality not in `qualityValuesFor` refused at the door.
  The magically-active values follow the character's magic type (recomputed when it changes; a stale value is a
  validate error).
- `derive` passes the attribute Edges to `naturalAttribute` (edgeAttr, edgeMax), Lightning Reflexes to Reaction and
  Will to Live to the overflow, as preparation does; the budget gets the system's new effects for free.
- Sheets: an **Edges and Flaws** block (name, value, detail, page).

## Tests
App: balance (+2 and −2 OK, +3 alone an error); Bonus Attribute Point raises the attribute and the budget doesn't
charge it; Exceptional Attribute raises the maximum; Bonus Skill Point 2 → 2 more skill points; Bonus Force Point 2 →
4 Force Points for a magician, none for a mundane; Extra Contact 1 → three free contacts; Lightning Reflexes 4 →
Reaction +2; Will to Live 2 → overflow +2; Blind −2 for a magician, −6 otherwise; values outside the table refused;
parity with the system budget.

## Out of scope
Edges/Flaws after creation (the GM's, p.22) and buying off Flaws with Karma; table effects (TN modifiers, Toughness's
die, Magic Resistance dice, social modifiers) beyond notes; albinism's required Flaws; designing custom Edges.

## Key decisions to challenge
1. The value table lives in the system, keyed by compendium source.
2. Variable qualities accept any whole value in the book's general bounds.
3. Addiction: the table's components (−1/−1/−2, summing to −1…−4) — the text says "−1 or −2"; the plan takes the
   table (RULINGS R11, the GM may overturn).

## Draft 2 — changes after round 1 (these win)
- **Bonus Attribute Point priced per step** (r1 #1): the player chooses the GAIN (+1…); a pure
  `bonusAttributeCost({ natural, originalMax, gain })` (system) prices each +1 at 1 point up to the ORIGINAL racial
  maximum and 2 points past it (Exceptional Attribute is what makes "past it" possible). The projected item has
  `attributeBonus` = gain and `pointValue` = that cost; validate checks they agree and the gain isn't clamped away
  (the result within maximum + maximumBonus).
- **The creation cap includes Exceptional Attribute** (r1 #2): the app's attribute check uses max + Σ maximumBonus.
- **Allotments, not spend** (r1 #3): Bonus Skill Point and Bonus Force Point add to the skill and Force Point
  ALLOTMENTS; Extra Contact to the free-contact count; Attribute Points untouched.
- **Lightning Reflexes after rigging** (r1 #4): its Reaction bonus is added after the rigging branch replaces
  `reaction.mod`, in the system and in the app's derive.
- **Will to Live raises the overflow LIMIT** (r1 #5): one shared `overflowLimit(body, willToLive)` used by the death
  check, the healing clock and both sheets; stored damage and the 10-box tracks are unchanged.
- **One admission path** (r1 #6): `offerReason` gets a quality branch (Companion, Cyberpirates, Rigger 2 sources that
  `QUALITY_VALUES` maps, creation only), outside `BUYABLE`/`refusalFor`; qualities are added with a new op
  `addQuality { catalogId }` and edited with `setItem` choices.
- **Every offered source mapped** (r1 #7): `QUALITY_VALUES` covers every quality in the three books (their fixed
  values from their own pages, read on renders); an unmapped quality is not offered.
- **Attribute required** (r1 #8): Bonus Attribute Point and Exceptional Attribute need one of the six attributes;
  validate errors without it.
- **Detail → `system.notes`** (r1 #9): the detail text is projected (escaped) into `notes`, which Foundry already has;
  the sheets print it.
- **Contacts and caps** (r1 #10): the "free contacts" to-do and prices use the quality-adjusted count; Bonus Skill
  Point's 5 is checked across all its copies; Lightning Reflexes' 6 likewise.
- **One audit for both** (r1 #11): a pure `qualityAudit({ system, items })` in the system (balance, values per source
  incl. the magically-active reductions from `magic.type` — physical adepts count as magically active —, attribute
  required, the Bonus Skill Point / Lightning Reflexes caps, Bonus Attribute cost) used by the app's validate and
  shown in Foundry's creation panel beside `attributeEdgeViolations`.

## Draft 3 — changes after round 2 (these win)
- **Copies** (r2 #1, #2): "unless otherwise noted, Edges and Flaws cannot be combined" (p.23): a quality is taken
  once per character, except Bonus Attribute Point and Exceptional Attribute (once per ATTRIBUTE) and the ones the book
  takes per subject (Aptitude, Incompetence: once per skill — the detail names it; Allergy, Phobia, Compulsive,
  Addiction, Dependent: once per detail). The audit refuses a second copy, so every cap (Bonus Skill Point 5, Bonus
  Force Point 3, Will to Live 3, Lightning Reflexes 6) is a cap per character, and the Bonus Attribute cost is priced on
  the one gain per attribute.
- **Every natural-rating reader includes the attribute Edges** (r2 #3): the free languages' Intelligence, adept
  power pricing and Karma advancement use base + racial + Bonus Attribute gain (and the Exceptional maximum where a
  maximum is read), in the app and in the system's adept budget (Karma already reads `naturalInfo.raw`, which has it).
