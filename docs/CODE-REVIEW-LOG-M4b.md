# Code review log: M4b (nuyen after creation)
Codex gpt-6-sol, read-only. System release/0.161.0 (f6082678, 0ae83f05); app chargen/on-0.161 (local).

## Round 1 — Codex (high)
**Findings**

1. [shared/creation.mjs:455](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:455) — `buyItem` skips `refusalFor`. I reproduced buying the core DataSoft for 0¥ even though creation rejects it because its price varies. **Fix:** apply the existing buyability check before projecting an in-play purchase.

2. `f6082678:module/rules/sr2e-rules.mjs:1913` — Fence value can exceed the stock’s acquisition value. Ammo with a 100¥ bundle basis, 10 acquired rounds, and quantity edited to 20 produces a 200¥ list value and a 60¥ fence payout at 30%. **Fix:** cap the remaining fraction at 1, as the proportional refund does.

3. `f6082678:module/rules/sr2e-rules.mjs:1950` — Failed secondhand ware returns 0 before validating `pct`. A fence quote at the forbidden 12% succeeds in the pure rule, contrary to Draft 3’s five-point rule. **Fix:** validate the fence percentage before the failed-ware branch.

4. `f6082678:module/rules/sr2e-rules.mjs:1950` — That branch also discards accessory value. A failed 5,000¥ implant with a usable 3,000¥ accessory row gets 0¥ at a fence, although Draft 2 includes accessory rows in list value. **Fix:** value the remaining accessory rows when the failed implant itself is worthless.

5. [server/routes/documents.mjs:40](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:40) — The schema requires `pct` for every `sellItem`. A refund-mode request with `itemId`, `shownMode`, and `quoted` but no percentage gets a 400, despite the approved `pct?` contract. **Fix:** make it optional in the schema and require it in the reducer only for fence mode.

6. [client/src/pages/Character.svelte:98](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:98) — The client reads `saleMode` only once. If the GM switches modes while a character page stays open, every subsequent sale is refused and the page keeps offering the stale mode even after recovery. **Fix:** refresh session rules after a mode-mismatch refusal and when returning to the page.

7. [shared/creation.mjs:390](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:390) and [server/sheet/model.mjs:85](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:85) — Money entries never record who made them, so the printed History cannot provide Draft 2’s stated audit trail. **Fix:** pass the authenticated user into ledger creation and print that identity in History.

8. [server/sheet/model.mjs:72](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:72) — A cyberware spare bought in play prints as ordinary cyberware, with no “not installed” label; Draft 2 explicitly requires that label. **Fix:** mark uninstalled cyberware in the sheet model and cover it with a sheet test.

9. [client/src/pages/Character.svelte:101](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:101) — The Nuyen shop never runs its initial search, and overlapping searches have no response-order guard. It opens empty; a slow old search can later replace results for a newer query. **Fix:** start the search on mount and retain only the latest response, as Resources does.

The new tests omit the failing stock-inflation, failed-ware percentage, excluded-catalog, mode-change, and printed-spare cases. I found no refund-parity change in Foundry’s extracted `refundQuote` logic.

VERDICT: REVISE
### Response
All nine fixed (system: percentage first, accessory rows of a failed part, stock fraction capped; app: refusalFor in play, pct optional for refunds, the sale mode re-read, who made each entry recorded and printed, the spare label, the shop search). Tests added for each.

## Round 2 — Codex (medium, fix-only)
1. [shared/creation.mjs:459](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:459) — Buying a DataSoft with no fixed price is now refused. **Fix:** `buyItem` calls `refusalFor`; complete.
2. [sr2e-rules.mjs:1914](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1914) — Raising an acquired box of 10 rounds to 20 no longer raises its fence list value above the acquisition basis. **Fix:** cap the remaining fraction at one; complete.
3. [sr2e-rules.mjs:1951](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1951) — A failed secondhand part offered at 12% now gets a null quote. **Fix:** validate the percentage before the failed-part branch; complete.
4. [sr2e-rules.mjs:1953](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:1953) — A failed part with a 3,000¥ accessory row now quotes 1,500¥ at 50%. **Fix:** price its accessory rows separately; complete.
5. [documents.mjs:41](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:41) — A refund sale without `pct` now passes the request schema; a fence sale without it is refused by the reducer. **Fix:** make `pct` optional in the schema and require it for fence sales; complete.
6. [Character.svelte:98](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:98) — **Still failing:** an initial `/api/session` request can return `refund` after a newer refusal-triggered request returns `fence`, restoring the stale mode. **Fix:** give rule requests sequence numbers and apply only the latest response.
7. [creation.mjs:394](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:394) — A signed-in user’s money or Karma operation now records their handle, which reaches the sheet history. **Fix:** pass the session handle into each ledger entry; complete.
8. [model.mjs:72](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:72) — Cyberware bought in play now prints “spare, not installed.” **Fix:** label uninstalled cyberware on the sheet; complete.
9. [Character.svelte:106](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:106) — The Nuyen shop now searches on open and ignores an older search response after a newer query. **Fix:** start the search and guard responses by sequence; complete.

The app’s `money.test.mjs` passes (6 tests). No files were changed.

VERDICT: REVISE
### Response
#6 fixed: rule reads carry a sequence number; only the latest answer applies. Stopped here.
