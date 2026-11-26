# Code Review Log: vehicles in play (docs/PLAN-play-vehicles.md)

## Round 1 — Codex (gpt-6-sol, high)

1. **Fence sales can become impossible.** [server/routes/documents.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:65) gives `sellVehicle.quoted` the generic 10,000,000¥ money limit. A reachable garage vehicle—an EFA with two 99-unit Fairlight Excalibur cargo entries—has a 34,700,000¥ whole list value and a valid 50% fence quote of 17,350,000¥. The route rejects that sale before the reducer sees it; the [sale tests](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/play-vehicles.test.mjs:55) use only a 20,000¥ vehicle. **Fix:** give `quoted` a safe bound for vehicle list-value payouts and test a quote above 10,000,000¥.

2. **Export filenames can still collide across characters.** [server/routes/documents.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:198) uses only the first eight characters of the document ID. Two characters with IDs sharing that prefix, the same vehicle name, and `w00001` receive identical filenames; the [export test](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/play-vehicles.test.mjs:115) checks only one character. **Fix:** include the full document ID in the filename.

3. **The garage picker submits purchases the server must refuse.** [Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:110) checks only whether a design is unfinished. A Restricted base vehicle with priced cargo gets a positive preview quote, and a finished Rigger 2 design can be selected while Rigger 2 is off; [the Buy button](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:503) sends either operation, while [the reducer](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:699) refuses it. **Fix:** check the base list price and required books when building the preview, and withhold Buy when either check fails.

VERDICT: REVISE
### Claude's response
All three fixed: buyVehicle.price and sellVehicle.quoted have their own 1,000,000,000 bound (route and reducer), with a test that buys at 30,000,000 and fences at 17,350,000; the export file name has the full character id; the garage preview refuses a Restricted base vehicle and a vehicle whose books are off, as the server does.

## Round 2 — Codex (medium, fix-only)

The route now accepts vehicle quotes above 10,000,000¥, and export filenames include the full character ID.

The garage picker still leaves **Buy** visible after a failed preview. In [Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:118), the Restricted-price and missing-book checks return without clearing `carBuy`. Select a valid vehicle, then an ineligible one: the earlier quote and Buy button remain. Clear the pending quote when selection starts or either check fails.

VERDICT: REVISE
### Claude's response
Fixed: quoteVehicle clears the pending quote before anything else, so a refused choice leaves no Buy. One line, built; not sent for another round.
