# Plan: milestone 5j — cyberlimbs and their options (core p.247/261, Cybertechnology p.30–31, p.49–52)
_Draft 2 (2026-11-19), approved after 2 Codex plan rounds (r2 #1 folded). Roadmap item 5, the last cyberware leftover. Foundry has the whole model (limb-rules.mjs:
identity, sides, links, conflicts; limb-stats.mjs: averages, pair Body, Essence, prices; actor-data
`_limbEssenceAndModel`, `_applyLimbAverages`); the app records the choices Foundry needs and runs the same pure
functions, proved by a parity fixture._

## Today
Book limbs and every limb option are refused (`limbRole`). The core Cyberarm/Cyberleg (Full) are offered, but with
side "unknown": Foundry's side rules skip them, so no averages — parity holds, but a player can't get the book's
averages. The core Increased Strength / Built-In Smartlink / Built-In Device are refused ("arrives with Cybertechnology").

## Offered
- **Limbs** (`limbRole` "limb" with a resolved type): core Cyberarm/Cyberleg (Full); CT Cyberarm, Cyberarm Gyromount,
  Cyberleg, Cyber Forearm, Cyber Lower Leg, Cyberhand, Replacement Hand, Cyberfoot, Cybertorso, Cyberskull.
  A sided limb takes a **side** choice (left/right), written to `system.side`; at creation an unset side is an error.
- **Simple Replacement Limb** (core and CT; no type in the data): a **limb type** choice (arm or leg) written to
  `system.limbType` (Foundry's sheet sets the same field). _To check on the page: core p.247 / CT p.30._
- **Options** (`limbRole` "option"): the CT Strength/Quickness/Body Enhancements (+1…+6), core and CT Increased Strength
  (rated: `costPerRating`), Built-In Smartlink / Smartgun Link, the cyberguns, Cyberarm Taser, the coverings, External
  Mount, Magnetic System, Direct Neural Interface. Each takes an **in** choice: the limb record it is built into
  (the M5f cybereye `in` pattern), projected to `system.linkedLimbId` = that limb's item id. Unattached at creation is
  an error (Foundry's orphan).
- **Still refused:** Built-In Device (4 × the device's price: needs the device chosen), Cyberarm Cyberdeck (deck rules),
  Hydraulic Jack, Foot Anchor, Cyberlimb Signal Booster (in-limb implants with no limb type or option kind).

## Placement and price (Foundry records these when an option is attached)
- `limbSurcharge` and `limbAdjacent` from the system's `placementFacts(kind, limbId, siblings)`, where the siblings are
  the options attached EARLIER in record order (Foundry records at attach time: the second enhancement type on a limb
  pays the 10 %). Written into the projected item so Foundry keeps them.
- Price: the system's `limbOptionPrice(sys, kind, limbType)` (partial limbs: 65,000/60,000/120,000 per point, at most
  3; the surcharge ×1.1). The budget, the buy price and the sheet read it.
- Grades (SSC p.98): as any cyberware (Foundry grades limbs and options the same way).

## derive (as `_limbEssenceAndModel` + `_applyLimbAverages`)
1. `limbModel` over the installed cyberware; `limbStats(model)` for the selection; each option's `limbEssence` from the
   system's `limbEssence` (in a limb, counted, troll, torso) feeds `essenceOf` (today it passes `undefined`).
2. Pair Body (`pairBody`) adds to Body with the other ware mods.
3. After the attributes: `limbStats(model, { naturalStrength: Strength, naturalQuickness: Quickness,
   reactionExemptQuickness, naturalBody, quicknessCapBase, troll })`; when `anyCyber`, Strength and Quickness become the
   averages (capped), and Reaction's base uses `avgQuicknessReaction` (and the Rigger 2 Control Pool's too).
4. Bone lacing armor after replacements (`lacingArmor`), and the Unarmed Strike's Power = max(lacing, `handPower`).
5. The muscle discount already comes from `wareCtx` (full cyberlimbs).

## validate (the model's reasons)
Errors at creation: a limb with no side or type, overlapping limbs (conflicts), an option not in an installed limb.
Warnings: a rejected duplicate option ("only one … counts; it still costs its Essence"), a Body enhancement outside a
pair, an average over its cap.

## Proof
A parity fixture `test/fixtures/parity/limbs-v0.162.0.json`, exported from the local Foundry (the M5i recipe):
(a) a pair of CT cyberarms with Strength +3 (left), Quickness +2 (right), Body +2 (left), and Muscle Replacement 1;
(b) a troll: core Cyberarm (Full) left + Increased Strength 2 + a Cybergun (Light Pistol) + a Built-In Smartlink;
(c) right Cyberhand + right Cyber Forearm with Strength +2 (adjacent) + left Cyberleg + Bone Lacing (Plastic);
(d) Cybertorso + Cyberskull + a pair of cyberlegs with Body +1 and, on the left, Strength +2 then Quickness +1 (surcharge).
Compared: attributes, Reaction, Initiative, Essence, pools (both Control), armor, weapons, and each option's price.

## Out of scope
Built-In Device and the limb cyberdeck; in-limb implants (hydraulic jack, foot anchor); coordination and lead-with
TNs (play); enhanced articulation (bioware with a rule, refused); damage to limbs (Cybertechnology Phase 5, play).

## Draft 2 — changes after round 1 (these win)
- **Offer gate, an allow list (r1 #8):** a limb is offered only when `resolveLimbType` gives a type (field, rule or
  known source) — never by `location` alone; an option only when `resolveOptionKind` gives strength, quickness, body or
  smartlink, or its source is one of the checked "other" sources (the three coverings, External Mount, Magnetic
  Cyberlimb System, Direct Neural Interface). Everything else in a limb stays refused, with the reason.
- **Deferred (r1 #6, #7):** the cyberguns and the Cyberarm Taser (each needs its paired weapon item, linked to the
  implant), and the Simple Replacement Limb (a plain prosthetic: Foundry has no rule that keeps it out of the averages,
  pairs and muscle discount; a system change first, with the page read).
- **Placement recorded at attachment (r1 #3):** the option record keeps `placement: { limbSurcharge, limbAdjacent }`,
  computed by `placementFacts` when its limb choice is SET OR CHANGED (as Foundry's preUpdateItem hook), against the
  then-current projected cyberware: every limb (with type and side) and every other attached option (with kind and
  link). Later purchases don't change it; re-attaching recomputes it. The projection writes both fields.
- **Price context (r1 #4):** `priceInput` gives cyberware options `limbOptionKind` (resolved) and `limbType` (the linked
  limb's, resolved from its fields/flags/source), and the authored `cost`, so `chargenItemCost` → `itemBaseCost` →
  `limbOptionPrice` runs for the budget, the buy price, the sale and the sheet alike.
- **Separate choice key (r1 #5):** options take `limb` (the limb record id), not the eye accessories' `in`; the eye
  grade check stays on `in`.
- **The four inputs (r1 #2), exactly as `_applyLimbAverages`:** naturalStrength / naturalQuickness = the computed
  Strength / Quickness after every mod (ware, bioware, adept, pair Body excluded — it is Body); naturalBody = the
  natural (unaugmented) Body; quicknessCapBase = natural Quickness + bioware Quickness; troll = race (or the
  metavariant's base) troll. Pair Body is added to the Body mods before the attributes are computed. A unit test
  pins each input on fixture (a).
- **Rigger 2 Control Pool (r1 #1):** `controlRigger2` uses `avgQuicknessReaction` when `anyCyber`, else natural
  Quickness (as `rigReactionBase`); fixture (e): a VCR 1 with a left/right cyberarm pair carrying Quickness +2,
  prepared under `vehicleRuleset: "rigger2"`.
- Fixture (b) drops the cybergun (deferred).
- **Round 2 (r2 #1, folded without a round 3):** `chargenItemCost` forwards only the ware context from its item, so
  the app passes `{ limbOptionKind, limbType }` as its SECOND argument (`ctx`), which `itemBaseCost` →
  `derivedItemCost` reads; one helper builds that context for every price call (budget, buy, sale, sheet).
