# Plan: milestone 4c — damage, ammunition and cybersurgery after creation
_Draft 3 (2026-11-19), BUILT on the local app branch after Codex plan rounds 1–2 (8 + 2 findings, docs/PLAN-M4c-REVIEW-LOG.md; the "Draft 2" and "Draft 3" sections win). The wound rules are on core p.111 (the plan said p.112). The third slice of milestone 4 ("Manage a character", docs/ROADMAP.md item 4). Built on the local
branches like M4a/M4b (app `chargen/on-0.161`, system `release/0.161.0`). Rules come from the Foundry system's pure
functions, already checked against the book there: `damageUpdateFor`, `totalWoundPenalty`, `woundLevel` (core
p.112–113), `surgeryCategory` (elective surgery, core p.114, with Cybertechnology p.53's fees), `surgeryEssencePct`,
`surgeonTN`, `surgicalEssence` (Cybertechnology p.53). No new rules math in the app._

## Goal
Between sessions a player keeps the character current: the wounds it carries, the rounds it has left, and the spare
cyberware it had put in. Combat itself stays at the table (Foundry or dice): the app records results, it doesn't roll
attacks.

## 1. Damage (finished characters)
- Stored where Foundry stores it: `actor.system.conditionMonitor.{physical,stun}.value` and
  `conditionMonitor.overflow` (so the Foundry export carries the wounds).
- Op `damage { track: "physical"|"stun", boxes: 1–20 }`: `damageUpdateFor` (Stun past 10 rolls into Physical; Physical
  past 10 into overflow, p.112). Op `heal { track: "physical"|"stun", boxes: 1–20 }`: Stun or Physical boxes off,
  never below 0; Physical heals the overflow first (it's the worst damage).
- Shown on a **Condition** step (finished characters): two 10-box monitors, the overflow against Body (`derive`'s
  `monitors.overflow`), the wound level and the injury modifier (`totalWoundPenalty`). Past the overflow the page says
  the character is dead (p.112). The sheets print the boxes filled.
- Not ledger entries: damage isn't money or Karma and has no "undo" — healing is the inverse. The document revision
  history keeps every change.

## 2. Ammunition
- Op `useAmmo { itemId, rounds: 1–1000 }` on an `ammo` item: its `system.quantity` drops (refused below 0). Not a ledger
  entry (the sale quote already prices what's left from `acquiredQuantity`, M4b). More ammunition is bought with the
  Nuyen step's shop. A weapon's loaded rounds are not tracked (the table does that).

## 3. Cybersurgery: installing a spare
- Cyberware bought in play is a spare (`installed: false`, M4b). Op `installWare { itemId, successes: 0–30, fee:
  boolean, wound: boolean }`:
  - `pct = surgeryEssencePct(successes)`; the item's Essence after surgery `surgicalEssence(essenceOf(item), pct)`;
    `end = current Essence − that`. Refused when `end < 0` ("the surgery would leave the character below 0 Essence",
    Cybertechnology p.53). The surgeon's TN shown before confirming: `surgeonTN(current − essenceOf(item))`.
  - The item gets `installed: true` and `surgeryEssencePct: pct` (Foundry's field; Foundry's `actualEssenceCost`
    applies it, so the export agrees). The app's `essenceOf` applies `surgicalEssence` to installed items with a pct,
    for `derive`, `validateInPlay` and the sheets.
  - `fee` (default on): the category's fee (`surgeryCategory(itemEssence).fee`) charged from nuyen; refused when short.
  - `wound` (default on): the category's wound boxes applied to Physical through `damageUpdateFor`.
  - A **ledger** entry `surgery { itemId, pct, fee, before: { item, conditionMonitor } }` (it moves money). Undo: only
    while the item is unchanged since (equal to the after-state) and the monitors are unchanged since: the item goes
    back to spare, the fee is refunded, the monitors restored exactly. Otherwise refused, as M4b.
  - Notes on the page (as Foundry's card): an alpha/beta/delta clinic multiplies hospital fees (not reachable: the app
    sells standard grade only); a Drastic procedure makes a magician check for Magic loss (p.114) — shown, not rolled.
- The Nuyen step's owned list marks spares and offers **Install…** with the successes, fee and wound controls and a
  preview (category, wound, fee, Essence before/after, the surgeon's TN).
- Removing cyberware (surgery out) is not in this slice.

## Tests
App: damage Stun 12 → Stun 10 + Physical 2; Physical 12 with Body 4 → Physical 10 + overflow 2; heal overflow first;
bounds refused; ops refused before finishing. Ammo: 50 → 40; below 0 refused; a non-ammo item refused. Surgery: a
spare Datajack (0.2) with 2 successes installs at 0.2, Minor Invasive, M wound (3 boxes), 5,000¥; 0 successes → +15%
(0.23); 4 successes → −10% (0.18); below 0 Essence refused; short nuyen refused; undo restores exactly; undo refused
after the wound healed or the item changed; `derive` Essence uses the pct. Foundry export: the monitors and
`surgeryEssencePct` carry over.

## Out of scope
Rolling damage or healing tests (natural healing times, first aid) — the table does that; removing cyberware; grades
above standard; a weapon's clip; the Magic-loss roll.

## Key decisions to challenge
1. Damage and ammo are NOT ledger entries (no undo) — the revision history is the audit. Surgery IS (money).
2. Healing as a plain box count, overflow first.
3. Using Cybertechnology p.53's success table with a default of 2 successes (= 0% change, the core book's result).

## Draft 2 — changes after round 1 (these win)
- **One Essence function, Foundry's** (r1 #2, #3): the app's `essenceOf` is replaced by `itemEssence(item, items)` =
  the system's `wareEssence` (S5) over the item's system plus the actor markers Foundry sets in preparation: `wareRule`
  and, for muscle replacement/augmentation, `limbDiscount = muscleFactor(fullCyberlimbs(physicalLimbs(sourcesOf(
  the actor's items))))` when > 0 (Cybertechnology p.57; core sells Cyberarm/Cyberleg (Full) and Muscle Replacement).
  `limbEssence` stays unset (the app sells no limb options). `derive`, `validate`, `validateInPlay`, the sheets and the
  surgery all use it, so creation picks up the same muscle discount Foundry already applies (a CHANGELOG line).
- **Surgery numbers from the whole inventory** (r1 #1, #2): `total(items)` = Σ `itemEssence` over installed
  cyberware. With the candidate installed at the surgeon's pct: `cost` = the candidate's own `itemEssence`;
  `category = surgeryCategory(cost)` (the ADJUSTED cost, as Foundry); `end = 6 − total(after)` (so a limb changing a
  muscle's Essence is counted); TN = `surgeonTN(6 − total(after, pct 0))` (Foundry's `now − plain`: the test's own result can't move its TN). Refused
  when `end < 0`.
- **Monitors exist** (r1 #4): `finish` writes `conditionMonitor = { physical: {value 0, max 10, overflow 0}, stun:
  {value 0, max 10, overflow 0}, overflow: 0 }` (Foundry's schema); the damage/heal/surgery ops create it when missing
  (finished characters from before M4c, development only).
- **Exact undo** (r1 #5): the surgery entry stores `{ itemId, fee, before: { item, conditionMonitor }, after: { item,
  conditionMonitor } }` (full JSON snapshots). Undo needs the item AND the monitor equal to `after`;
  it writes `before` back for both and refunds `fee`.
- **Selling installed cyberware is refused** (r1 #6) until removal surgery exists ("that's surgery, not a sale").
- **Sheets print the wounds** (r1 #7): the sheet model passes `conditionMonitor` values beside the capacities; the PDF
  fills that many boxes and the Markdown block writes "Physical 3/10, Stun 0/10, overflow 0/4".
- **Bounds** (r1 #8): request schema per op — damage/heal `boxes` 1–20, `track` enum; useAmmo `rounds` 1–1000;
  installWare `successes` 0–30 integer, `fee`/`wound` OPTIONAL booleans (default true). The reducer checks the same.

## Draft 3 — changes after round 2 (these win)
- `sourcesOf` reads `_source.system`: the limb count goes through purchase.mjs's existing `asDocs` adapter.
- `wareEssence` reads the prepared `capacityUsed`: `itemEssence` computes it from the item's module rows (the same sum
  `essenceOf` uses today) before calling it. A parity test pins a cybereye with modules over its allowance and muscle
  replacement beside a full cyberarm.
