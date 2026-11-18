# Plan Review Log: milestone 2c (resources)

## Round 1 — Codex (gpt-6-sol, high)
## Findings

- [Item projection](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2c.md:20) is underspecified: the existing [helper](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:171) creates every item with `type: "skill"`, while `chargenSpend` and `derivedItemCost` require the real type. **Fix:** Create items with the catalog type and pass `{type: item.type, ...item.system}` to pricing and budget functions.

- [Ammo `quantity`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2c.md:39) cannot mean bundles in the Foundry field: the catalog stores rounds there, and [chargenItemCost](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1683) ignores it when pricing ammo. Two 10-round boxes would otherwise appear as two rounds and cost one box. **Fix:** Keep bundle count in choices; project `quantity = bundles × catalog.quantity` and `acquiredListValue = bundles × catalog.cost`.

- The proposed [eye rows](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2c.md:57) have `listValue`, but [chargenItemCost](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1691) reads `moduleListValue` on the eye; without it, installed accessories are free. **Fix:** Set the eye’s projected `moduleListValue = rowsListValue(modules)` before calling `chargenSpend`.

- [Every eye row is marked `kind: "accessory"`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2c.md:58), but the core Eye Camera is a `camera` in [eyeAccessoryKind](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/ware-rules.mjs:57). That loses the system’s camera slot rules. **Fix:** Derive each row’s kind from its catalog source with `eyeAccessoryKind`, and accept `in` only for identified eye accessories and an owned cybereye.

- The eye check covers Essence allowance but omits the system’s [1.2 Essence accessory cap](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/ware-rules.mjs:176); `.5` is the free allowance, not the maximum capacity. **Fix:** Run `eyeReports` on projected rows and report its violations.

- [Skillsoft category is client selectable](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2c.md:38): an ActiveSoft could be submitted as `language` and charged at the cheaper LinguaSoft rate by `skillsoftCost`. **Fix:** Keep `grantedSkillCategory` fixed to the catalog entry; select a skill separately if the item needs one.

- The core [DataSoft](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/catalog/catalog.json) has cost `0` and a book price of “Varies”; the system’s `skillsoftCost` supplies a generic fallback price, which is not a determined core-book purchase price. **Fix:** Require a separately approved DataSoft price or defer DataSoft purchases.

- [“1–the entry’s max”](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2c.md:38) is undefined for `costPerRating` gear such as the Jammer, whose catalog entry has no max field; the plan also promises to report ratings above 6. **Fix:** Define a concrete accepted rating range and let validation report the starting cap.

- The [focus rules](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2c.md:65) distinguish specific spell and category foci, but the catalog has only `focusType: "spell"` and the proposed choices contain no subtype; the bonding cost cannot be derived correctly. **Fix:** Add an explicit, validated focus subtype or limit this slice to an unambiguous subtype.

- The plan leaves a known [focus price conflict](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2c.md:84) unresolved: Spell Focus is 45,000¥ per Force in the catalog, while the system’s `focusCost` comment says 10,000¥; at Force 3 that is 135,000¥ versus 30,000¥. **Fix:** Verify the book price and correct the catalog or rules before enabling focus purchases.

- [Adept power cost](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2c.md:69) needs the item name and racial Reaction maximum: [adeptPowerCost](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1782) otherwise charges Increased Reflexes level 2 as 2 points instead of 4 and misprices Increased Reaction for some metatypes. **Fix:** Pass `{name: item.name, ...item.system}` and the race’s Reaction maximum.

- Unlimited duplicate adept purchases let two level-1 Increased Reflexes entries buy the level-2 effect for 2 points instead of 4. **Fix:** Allow one entry per scalable adept power and change its level through `setItem`.

- [Magic after Essence loss](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2c.md:61) needs a zero-Magic case: the existing [skill check](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:265) checks magic *type*, so a magician reduced to Essence 0 can retain Sorcery or Conjuring despite the rule requiring a Magic Rating. **Fix:** Compute current Magic before resource and skill validation, then report magical skills and purchases that require Magic when it is 0.

- The [tests](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2c.md:90) miss the interactions most likely to hide these errors. **Fix:** Add cases for two rating-3 Jammers, multiple ammo bundles, an eye camera, an adept with cyberware, a magician at Magic 0, and a spell attempted by an adept.

VERDICT: REVISE
### Claude's response
Accepted 1–4, 6–14 (draft 2). #10 resolved by reading the core price list (p.263): the catalog's prices are right, only the system comment is stale (S11). #5 deferred: the 1.2 cap and slot rules are Cybertechnology p.45's, enabled with that book in M5.
