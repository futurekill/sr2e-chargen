# Code Review Log: M5n (sourcebook adept powers; the Magic export)

## Round 1 — Codex (gpt-6-sol, high; 1.02M in / 7.5k out)
1. [shared/foundry.mjs:25](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/foundry.mjs:25) — A stored Magic value is exported unchanged after Essence falls. A finished magician with `magic.value = 6` who gains 1 Essence worth of ware has derived Magic 5 but exports 6. **Fix:** update or cap the stored rating when Essence changes, then export that effective rating.

2. [shared/derive.mjs:128](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/derive.mjs:128), [shared/creation.mjs:430](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:430) — Finished and imported characters’ stored Magic is ignored by the sheet, Mystic Armor, and the in-play power budget. An imported adept with Essence 6 and `magic.value = 3` exports 3, but derives and validates against 6. **Fix:** use the stored rating for finished characters, subject to the Essence cap.

3. [shared/purchase.mjs:95](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:95) — `checkChoices` has no fallback for the new `boostAttribute` choice. Editing the level of an older Attribute Boost record without that field is refused, even when the edit supplies a valid level. **Fix:** fall back to `defaultChoices(rec)[k]` for newly added choice fields.

4. [shared/creation.mjs:1154](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:1154), [shared/creation.mjs:447](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:447) — Sourcebook citations are wrong: a creation check reports “Mystic Armor … (Grimoire p.34)” with `cite.book = "sr2"`; in play, messages without the book’s name also default to SR2. These errors block `finishable` at creation. **Fix:** assign the citation book from the power’s source, in both validation paths.

5. [shared/purchase.mjs:286](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:286) — `offerReason` marks book powers purchasable in play, while `buyItem` refuses every adept power. For example, `offeredBy(Mystic Armor, ["grim"], "play")` is true, but the reducer rejects its purchase. **Fix:** make the play offer gate match `PLAY_GEAR`, or add a supported power purchase operation.

The targeted tests pass (11/11). The browser and server use the same reducer. Already finished characters bypass the creation `finishable` check; the Magic handling above is the finished-character regression.

VERDICT: REVISE
### Response
#1 rejected: Foundry caps a held Magic at floor(Essence) on preparation. #2 fixed (magicRating: the held value, capped). #3 fixed (checkChoices falls back to defaultChoices). #4 fixed (budgetCite, both paths). #5 rejected: core powers have the same play gate; buying in play is limited by PLAY_GEAR.

## Round 2 — fix-only (gpt-6-sol, medium; 380k in / 3.7k out)
Found two cases that need revision:

- [shared/creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:430): In play, the power budget still uses Essence-based Magic. With a held `magic.value` of 0 and one Mystic Armor power, `derive()` returns Magic 0, but validation reports Magic 6 and no power error. The new budget-report caller therefore misses this case.
- [shared/creation.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:34): `budgetCite` gives sourcebook reports without a book name in their text a core citation. Two Attribute Boost powers for Body produce a Grimoire rule error cited as `sr2 p.125`.

The creation path with no held value still derives Magic 6, and the old-record choice fallback supplies the new default in the case checked.

VERDICT: REVISE
### Response
Both fixed: one magicRating for derive and both validate paths; budgetCite maps the powers' names to their book. Tests added; 382 pass on all four databases. Folded without round 3.
