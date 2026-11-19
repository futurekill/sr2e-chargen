# Plan: milestone 5i — rule-bearing implants (sourcebook cyberware with a ware rule, not limbs)
_Draft 3 (2026-11-19), approved after 3 Codex plan rounds (r3 #1 folded). Roadmap item 5, a leftover of M5f: "ware with rules (move-by-wire, reflex enhancers, cranial
decks)". Cyberlimbs and limb options are their own slice (5j). Foundry computes every one of these; the app offers
only what `derive` then computes the same way, proved by a parity fixture exported from Foundry._

## Today
`offerReason` refuses book cyberware with any `wareRule` (127 entries refused, survey 2026-11-19). Core cyberware
has no gate: Foundry's `wareRule` finds some core items by source, and `derive` already treats them by their
`attributeMods`.

## Which rules are offered (by `wareRule` key, never by name)
At creation (installed, no damage, no complication log, no trigger switched off, no cyberlimb) Foundry's
`_collectItemModifiers` / `_wareCyberInteractions` reduce these to `attributeMods`, Essence, armor and the few
rule-specific steps below:
- **Reflexes:** `wired-reflexes:*`, `boosted-reflexes`, `reaction-enhancer`, `move-by-wire:*`, `reflex-trigger`.
- **Body:** `muscle-replacement` (Quickness exempt from Reaction, as the core one; the limb discount needs a full
  cyberlimb, which 5i doesn't offer), `dermal-plating`, `dermal-sheath`, `body-plating`, `body-plating-hardened`,
  bone lacing (`unarmedPowerBonus`, no rule key).
- **Headware with no derived effect:** `datajack`, `improved-datajack`, `comm-headware`, `cyberear`, `cranial-bomb`,
  `ims`, `auto-medication`, `designator-laser`.

Still refused, with their reason: CT `cybereye-pair` (a container), `encephalon` and the Rigger 2 modules (`fddm`,
`ivis-master`, `rc-*`, `protocol-emulation`, `decryption`: the Task Pool and rigger rules `derive` doesn't compute),
`tactical-computer`, skillwires, the cranial deck, the Softlink, every limb and limb option, and anything with
Active Effects. An unknown future rule key is refused (an allow list, not a deny list).

## derive (the steps Foundry takes that the app doesn't yet)
1. **Reaction Enhancers, +6 at most** (Cybertechnology p.38; Foundry `mods.reactionEnhancer > 6`): the Reaction from
   installed `reaction-enhancer` items above 6 is removed.
2. **Bone lacing** (Shadowtech p.42): the highest `unarmedPowerBonus` raises an "Unarmed Strike" weapon's damage code
   through the system's `unarmedDamageCode` (from the authored code); its armor is summed as today.
3. `derive` reads `wareRule(flags, source)` from the synced ware-rules (no names).

## validate (Foundry's warnings, as warnings)
- Move-by-wire with a reflex enhancer: Foundry's three texts (p.39, p.56–57): "not compatible with move-by-wire (still
  counted, the GM's call)", adrenal pump/suprathyroid "doesn't work with move-by-wire", synaptic accelerator Level 1.
- More than one move-by-wire system: an error (Foundry counts only the first).
- Reaction Enhancers over +6: a warning naming the excess (p.38).

## Grades and price
Unchanged: the M5f grade path (`wareEssence`, `itemBaseCost`); Shadowtech ware standard only.

## Proof
- A **parity fixture** `test/fixtures/parity/ware-v0.161.0.json`: three test actors built in the local Foundry
  (0.161.0) from the compendium items, their prepared values exported (attributes, Reaction, Initiative dice,
  Essence, pools, armor, monitors, weapons):
  (a) Wired Reflexes 2 + Reaction Enhancer +6 + Muscle Replacement 2 + Dermal Sheath 1 + Datajack (Improved);
  (b) Move-by-Wire 2 + Reaction Enhancer +3 + Bone Lacing (Titanium) + Body Plating (Hard Armor, Level 2) + an Unarmed
      Strike;
  (c) Boosted Reflexes 2 + Commlink IV + Cranial Bomb (Kink) + IMS + Automatic-Medication + Reflex Trigger +
      Cyberear Replacement + Eye Laser Designator.
  `derive` must equal each value; the actors' sources are kept beside the values.
- Unit: each refused group still refused with its reason; an alpha Wired Reflexes' Essence and price; the warnings.

## Out of scope
Cyberlimbs and options (5j), cybereyes from Cybertechnology, encephalon and rigger modules, the tactical computer,
skillwires, cranial decks, delta grade, rule-bearing bioware.

## Draft 2 — changes after round 1 (these win)
**The principle, stated (r1 #1, #2, #3, #5):** the app computes what the sheet shows at creation; the exported
character carries each item with its rule key, and Foundry runs the play-time rules on it (move-by-wire's
complication tests and its Athletics/Stealth/rigging dice, the improved datajack's rigging Perception dice, the
designator's indirect fire, bone lacing's reduced-Power physical attack). That is the M7 line ("no in-play state"),
not a gap. Hardened body plating: Foundry itself stores it as Ballistic/Impact and has no hardened-armor step for it
(the hardened rule exists only in the Rigger 2 pedestrian impact, asked of the GM); parity holds. The sheet prints
each implant's book page, so the table finds the rule.
- **Refused besides (r1 #3):** `ims` and `auto-medication` — Cybertechnology p.80: received in a cybermantic
  operation, not bought ("Comes with a cybermantic operation"); the Automatic-Medication System also has no price.
- **SSC entries without a rule key (r1 #4):** Foundry's `wareRule` maps only by flag or source, so SSC Boosted
  Reflexes have no key in Foundry either; the app's warnings read the same `wareRule` and match Foundry (a mapped-source
  gap is the system's, reported, not patched in the app). Book cyberware with `isVcr` is already offered (M5f) and
  `derive` computes the VCR and Control Pool; the core parity covers it. No other offered entry has a derived field
  `derive` ignores: the build test lists every offered cyberware entry and fails on any field from Foundry's list of
  rule-bearing fields (`isTacticalComputer`, `skillwirePlus`, `accessPorts`, `cranialDeck`, `capacity > 0`, limb
  fields, effects) — an audit kept as a test.
- **Fixtures (r1 #6), each a legal mundane human (Essence ≥ 0), from offerable items:**
  (a) Reaction Enhancer +6 + Reaction Enhancer +1 (over the cap) + Wired Reflexes 1 + Muscle Replacement 1 + Dermal
      Sheath 1 + Datajack (Improved);
  (b) Move-by-Wire 1 + Reaction Enhancer +2 + Bone Lacing (Plastic) + Body Plating (Hard Armor, Level 2) + Unarmed
      Strike;
  (c) Boosted Reflexes 2 + Wired Reflexes 1 + Reflex Trigger + Commlink IV + Cranial Bomb (Kink) + Cyberear
      Replacement + Eye Laser Designator.
  Compared: every field the core parity compares, plus Unarmed Strike's damage code, plus Foundry's
  `mbw.enhancerExcess`/`conflicts` against the app's warnings.

## Draft 3 — round 2 (these win)
- **Rigger 2's Control Pool (r2 #1).** Foundry's Rigger 2 ruleset is a WORLD setting (`vehicleRuleset`), which the app
  can't know; `derive` keeps the core Control Pool (p.84) as today. This gap is older than 5i (any VCR rigger whose
  Quickness has ware differs under Rigger 2), and move-by-wire widens it. Fix for both: `derive` also returns
  `pools.controlRigger2` = the system's `rigBonuses({ vcr, mbw: move-by-wire level, reaction: reactionBase(natural
  Quickness, Intelligence, 0) }).controlPool` (Rigger 2 p.16–18; the synced vehicle-r2-rules), and when the
  character has the Rigger 2 book turned on and the two differ, the sheet prints "Control Pool X (Rigger 2 rules: Y)".
  A fourth fixture (d), exported from a world with `vehicleRuleset: "rigger2"`: Move-by-Wire 1 + a Level 1 VCR;
  Foundry's Control Pool must equal `controlRigger2`, and fixture (a)–(c) (core ruleset) must equal `control`.
- **Round 3 (r3 #1, accepted without a round 4):** the sheet prints "Control Pool X (Rigger 2 rules: Y)" whenever the
  two differ, whatever the books; a sheet-model test covers the line.
