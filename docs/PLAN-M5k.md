# Plan: milestone 5k — bioware with its own rules (Shadowtech; Cybertechnology p.56–57)
_Draft 2 (2026-11-19), approved after 2 Codex plan rounds (r2 #1 folded). Roadmap item 5, the leftover of M5e. Foundry computes all of these
(`_collectItemModifiers` bioware block, `_wareCyberInteractions`, `_applyArticulation`, `_calculateArmor`,
`BiowareData.actualBodyCost`); the app offers what `derive` then computes the same way, proved by a parity fixture._

## Today
`offerReason` refuses bioware with a ware rule, `triggered`, `damageCompensator`, `ignoresStunPenalty`,
`activeSkillDice`, armor, or one of the two choice-waiting entries: Synaptic Accelerator, Muscle Augmentation,
Orthoskin, Suprathyroid Gland, Adrenal Pump, Enhanced Articulation, Cerebral Booster, Damage Compensator, Pain Editor,
Reflex Recorder, Toxin Exhaler (11 of 22).

## Offered
All of them except the Reflex Recorder (it needs its skill chosen) and the Toxin Exhaler (its toxin): 9 entries.
The gate becomes an allow list of rule keys / fields, as M5i's.

## derive (as Foundry, at creation: undamaged, no drugs, nothing triggered on)
1. **Triggered implants** (Adrenal Pump, Pain Editor) are off at creation (`active` false): Body Index only — as today.
2. **Efficiency** (Cybertechnology p.56–57): an adrenal pump's / suprathyroid's attribute bonus is
   `floor(value × rating × eff)` with the system's `pumpEfficiency(physical limb model, { enhancer, mbw })` (`major`
   for the suprathyroid); eff 1 leaves the plain product. The pump is triggered (off) at creation, so only the
   suprathyroid shows it.
3. **Muscle Augmentation beside full cyberlimbs** (p.57): Body Cost `ceil2(bodyCost × muscleFactor(n))` before
   culturing, as `actualBodyCost`; its price through `wareCtx` (already).
4. **Enhanced Articulation** (p.56): its Reaction joins only if no cyberlimb raises Reaction and at most two limb
   positions are cyber (`cyberPositions`); its +1 skill die (`activeSkillDice`) is shown on the sheet as a line.
5. **Orthoskin**: its rating row's Ballistic/Impact add to armor (as cyber implant armor).
6. **`noReactionBonus` bioware Quickness** is exempt from Reaction (Foundry's flag; the Adrenal Pump's).
7. Cerebral Booster: its Intelligence counts (plain mods); the Rigger 2 Task Pool isn't on the app's sheet.
8. Damage Compensator and Pain Editor change wound penalties in play only (Foundry): offered, nothing derived.

## validate
- The synaptic accelerator's Level 1 with move-by-wire: the M5i warning already reads bioware.
- Adrenal pump / suprathyroid with move-by-wire: the M5i warning ("doesn't work").

## Proof
Parity fixture `test/fixtures/parity/bioware-v0.161.0.json`, built by the app's ops and prepared by the local Foundry:
(a) Synaptic Accelerator 2 + Muscle Augmentation 2 (cultured) + Orthoskin 2 + Cerebral Booster 1;
(b) a pair of cyberarms + Muscle Augmentation 1 + Suprathyroid Gland + Enhanced Articulation (lost: limbs);
(c) Enhanced Articulation alone (kept) + Adrenal Pump 1 (off) + Damage Compensator 2 + Pain Editor (off);
(d) a magician with Muscle Augmentation 1 (Body Index in Essence).
Compared as M5j (attributes, Reaction, Initiative, Essence, Body Index, pools, armor).

## Out of scope
Reflex Recorder and Toxin Exhaler (their choices), the Task Pool, wound penalties, bioware damage, triggering in play.

## Draft 2 — changes after round 1 (these win)
Pages read 2026-11-19: Shadowtech p.28 (prose: the synaptic accelerator "is incompatible with boosted or wired
reflexes, and cannot be combined with either to produce greater effects"); Cybertechnology p.57 (rendered: the
suprathyroid is made useless only by "major-scale bodyware/cyberlimb replacements" — the book, so `major` is RAW; it
and the pump are incompatible with move-by-wire; a synaptic accelerator combines with move-by-wire only at Level 1,
"triple the normal cost", implanted simultaneously).
- **Bioware price context (r1 #1):** `priceInput` adds `wareCtx` for bioware too (as `budgetItemInput`), so Muscle
  Augmentation beside full cyberlimbs is priced with the muscle factor; a test against the system's budget input.
- **One Body Cost (r1 #2):** `bodyCostOf(item, items)` = `ceil2(bodyCost × muscleFactor(n))` for muscle bioware beside
  `n` full cyberlimbs, then the cultured multiplier (`effectiveBodyCost`) — used by derive's Body Index, validate's
  Body Index/overstress/Essence, and the page's Body Cost.
- **Task Pool (r1 #3):** `derive` returns `pools.taskRigger2` = the system's `taskPoolDice({ encephalon: 0,
  cerebralBooster })` (Rigger 2 only, a world setting; the sheet shows it when > 0 as "Task pool N (Rigger 2 rules)").
  A Level 2 booster in the fixture, prepared under rigger2.
- **Articulation after the averages (r1 #4):** lost when the limbs' exemption-free average raises the Reaction base
  over the pre-average one, or when more than two KNOWN limb positions hold cyber parts (`cyberPositions` on the
  physical model); fixtures: kept (no limbs), lost by a gain (two arms with Quickness +2), lost by three positions,
  kept with two positions and no gain.
- **What is compared (r1 #5):** also `activeSkillDice`, each bioware item's Body Cost and list price, Orthoskin with a
  worn armor, a suprathyroid beside a cyberhand (partial: no effect) and beside a full arm.
- **Synaptic accelerator (r1 #6, RAW):** with wired or boosted reflexes (Foundry's rule keys, or the SSC/core entries'
  names? no: rule keys and the known core/SSC sources) → an error at creation (Shadowtech p.28). With move-by-wire:
  Level 2 → an error; Level 1 → priced ×3 (Cybertechnology p.57; at creation both go in together). Foundry warns but
  doesn't triple the price: a ruling on the wiki's Rulings page (R13), and a system change proposed separately.
- **Suprathyroid `major` (r1 #7):** the book's (p.57), not only a ruling — noted in the code comment.
- **Round 2 (r2 #1, folded without a round 3):** the Task Pool takes the highest working `encephalon` cyberware too
  (the core one is offered), as `_calculateDicePools`; a fixture with both at Level 2.
