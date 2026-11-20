# Code review log: M5j, cyberlimbs

## Round 1 — Codex (gpt-6-sol, high)
- **Wrong price for rated options on partial limbs.** [shared/purchase.mjs:334](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:334) calls `chargenItemCost` without the linked limb’s type or option kind. Core Increased Strength 2 on an enhanced forearm has a 120,000¥ placement price, but `price()` returns 300,000¥. The passing [price test](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/limbs.test.mjs:50) uses a fixed-price CT option and misses this case. **Fix:** pass the resolved pricing context and authored cost through one helper used by the shop and budget.

- **In-play surgery installs limbs with no usable side.** [shared/purchase.mjs:33](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:33) omits `side` from in-play choices, while [surgeryOp](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:672) installs the spare. The app has no in-play side edit, so Foundry’s side rules and the app’s limb averages continue to skip it. **Fix:** collect and store a side before installation, or provide an in-play side edit.

- **Fence sale can value a spare limb option at zero.** [shared/creation.mjs:548](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:548) sends the raw item to `saleQuoteOf`; its `itemListValue` path lacks limb pricing context. A spare core Increased Strength 2 linked to an enhanced forearm quotes 0¥ instead of a percentage of 120,000¥. **Fix:** price limb options with their recorded placement and linked limb before calculating the fence quote.

- **An untyped limb is only a warning at creation.** [shared/creation.mjs:835](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:835) allows an imported or legacy cyberlimb with no resolved type through this check, although the plan requires an error and Foundry cannot apply its limb rules. **Fix:** use creation error severity for an unclassified limb.

VERDICT: REVISE
### Response
- #1: price() passes limbPriceCtx (the option's kind, the linked limb's type) to chargenItemCost, so itemBaseCost's own limbOptionPrice branch prices it from the authored fields; the budget keeps pricedItems (Foundry's budget reads the prepared cost). Test: core Increased Strength 2 on an adjacent forearm = 120,000¥.
- #2: the side choice is offered in play too; buyItem refuses a sided limb without one, so surgery installs a limb the side rules see. The M4c surgery test now names its side.
- #3: the sale quote (server and client) prices through pricedItems.
- #4: an untyped limb is an error at creation (a warning in play).

## Round 2 — Codex (gpt-6-sol, medium, fix-only)
The four round 1 fixes are correct and complete. The limb tests pass, and direct checks confirm the fence quote and creation error paths.

VERDICT: APPROVED