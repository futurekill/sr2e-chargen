# Code review log: the printable sheet (milestone 3, slice 1)
Codex gpt-6-sol, read-only. Round 1 high; round 2 fix-only, medium. Reviewed 14baa32 (derive) and d395a8f (sheet).

## Round 1 — Codex
**Findings**

- **P1 — [server/sheet/render.mjs:197](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:197):** The footer never wraps or shrinks. A 120-character name of `W`s produces an A4 footer ending at x=857, beyond the safe right edge of x=559. **Fix:** Measure the complete footer and wrap, shrink, or truncate it within the safe width.

- **P1 — [server/sheet/model.mjs:65](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:65):** Notes are silently cut at 20,000 characters although the document schema accepts 100,000; a 20,001-character note loses its last character before the fit test sees it. The title has the same problem at [line 32](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:32), cutting an accepted 200-character name to 120. **Fix:** Preserve accepted text and paginate it, or reject excess text explicitly.

- **P1 — [server/sheet/render.mjs:173](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:173):** A single cyberware row with 300 module names throws `Cyberware: a row is taller than a page`; unfinished characters can hold up to 500 items, so this is a printable draft that cannot export. **Fix:** Split an oversized cell across continuation rows or pages.

- **P1 — [shared/derive.mjs:37](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/derive.mjs:37):** For an unfinished human with Body base 12, `derive` prints Body 12 while Foundry clamps the creation rating to the racial maximum of 6. **Fix:** Apply Foundry’s creation `naturalAttribute` clamp before adding item modifiers, and add that draft to parity coverage.

- **P2 — [server/sheet/index.mjs:18](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/index.mjs:18):** The queue releases a job on the child’s message or timeout, before `exit`; after a timeout, the next render can start while the killed child is still alive. **Fix:** Reap the child before releasing the queue slot, including after `SIGKILL`.

- **P2 — [server/sheet/index.mjs:34](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/index.mjs:34):** `waiting` includes the active render, so the promised four waiting jobs become only three; the fifth total request gets `busy`. **Fix:** Track active and queued jobs separately.

- **P2 — [server/routes/documents.mjs:42](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:42):** The route has a per-user rate limit but no server-wide rate limit required by draft 2; requests across many accounts can keep the renderer occupied continuously. **Fix:** Add a shared rate limit alongside the user key.

- **P2 — [server/sheet/render.mjs:20](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:20):** Draft 3 requires Source Sans 3 Condensed for standard labels, but both label and body use Source Sans 3. **Fix:** Bundle and select the condensed face for standard labels.

- **P2 — [client/src/pages/Character.svelte:106](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:106):** Draft 3 requires a server-stored readable-font site setting used as the sheet default; the client stores only a browser-local sheet choice and the route defaults to `standard`. **Fix:** Add the site preference and use it when no sheet font is requested.

The font packages are production dependencies copied into the Docker image. The sheet route uses the owned-document lookup, and its disposition filename is built from a validated UUID.

VERDICT: REVISE
### Response
Accepted 1–7 and fixed. #8 (condensed label face) and #9 (server-stored font setting): plan changed / deferred, recorded in docs/PLAN-sheet.md 'As built'.

## Round 2 — Codex
- [server/sheet/index.mjs:29](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/index.mjs:29): If the worker fails to spawn, Node emits `error` and `close` but no `exit`; the render and every queued render then hang. **Fix:** settle on `close`, which also waits until an exited child’s streams have closed.
- [server/sheet/index.mjs:21](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/index.mjs:21): If a worker sends a PDF but remains alive past 20 seconds, the timeout kills it yet the retained PDF is returned as success. **Fix:** make timeout override any earlier outcome.
- [test/sheet.test.mjs:50](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/sheet.test.mjs:50): The in-pieces check accepts `aXbYc` as complete placement of `abc`, so it can miss dropped text. **Fix:** compare each split cell’s concatenated runs with its full source text exactly.

The focused sheet and derive tests pass; these cases remain untested.

VERDICT: REVISE
### Response
All three accepted: the queue settles on 'close' (also when the worker never spawned); a timeout overrides an earlier answer; the fit test checks every table cell's runs exactly against its text (split cells included). Not re-reviewed.
