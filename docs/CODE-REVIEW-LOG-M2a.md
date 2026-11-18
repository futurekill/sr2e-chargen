# Code review log: milestone 2a (rules runtime, character kind, first steps)
Codex gpt-6-sol, read-only. Round 1 high effort; rounds 2–4 fix-only, medium. Commits 93582ac, fb4a8e4 (reviewed); fixes 34166c9, 3d50510, 0023c19.

## Round 1 — Codex
- **Import closure misses valid dependencies** — [tools/content.mjs:34](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content.mjs:34). `importsOf` returns nothing for `import "./dependency.mjs"` or `export{foo}from"./dependency.mjs"`, so `selectPaths` omits a module the copied code uses. **Fix:** Parse every static import and re-export form, including side-effect imports.

- **Forbidden-code check can be bypassed** — [tools/content.mjs:29](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content.mjs:29). The valid source `const a="/*"; eval("1"); const b="*/";` passes `forbiddenIn` because its comment-removal regex deletes the `eval` call; `globalThis["pwned"]=true` also passes. **Fix:** Inspect JavaScript syntax rather than stripping comments and matching source text.

- **A non-core totem is accepted** — [shared/creation.mjs:104](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:104). `setTotem("mouse")` succeeds and the client offers Mouse, although the pinned table itself says Mouse is not described in the core book. **Fix:** Restrict M2a to an explicit set of core totems.

- **Magic Priority A permits an adept** — [shared/creation.mjs:119](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:119). With More Metahumans enabled, a human physical adept at Magic A has no validation error, while RULES-CHARGEN.md assigns A to full magicians and B to adepts. **Fix:** Validate magic type against the rule’s assigned priority.

- **A stale write lets later queued operations change a different character state** — [client/src/pages/Character.svelte:28](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:28). If another tab advances revision 1, then this tab queues “Troll” followed by “Body 6,” the first operation fails stale, but the second is sent against the refreshed human revision and saves Body 6. **Fix:** On a stale response, stop and discard pending operations, then reload for the user to retry.

VERDICT: REVISE
### Response
All five accepted and fixed in 34166c9: acorn parses copied modules (imports + forbidden constructs); core totems only; magic priority = the table's exact type; a failed save drops queued changes.

## Round 2 — Codex
**VERDICT: REVISE**

1. **Imports — [tools/content.mjs:60](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content.mjs:60):** The original failing case, `import "./x.mjs"; export{foo}from"./y.mjs"`, now includes both files. No remaining defect found; no fix needed.

2. **Forbidden constructs — [tools/content.mjs:48](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content.mjs:48):** `globalThis.fetch("/x")` returns `[]`, bypassing the forbidden-call check. Fix: inspect calls through `globalThis` member expressions.

   **[tools/content.mjs:49](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content.mjs:49):** `import { process as p } from "./x.mjs"` is rejected even though `process` is an imported name, not a global. Fix: distinguish identifier references from import and export names.

   **[tools/content.mjs:55](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content.mjs:55):** `const x = globalThis["x"]` is rejected as a write. Fix: flag computed members when they are assignment targets, not on every read.

3. **Mouse totem — [shared/creation.mjs:106](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:106):** The original `setTotem("mouse")` case is now refused and Mouse is absent from the choices. No remaining defect found; no fix needed.

4. **Magic priority — [shared/creation.mjs:123](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:123):** Human Magic A with `physical_adept` now fails validation; the other table entries checked match. No remaining defect found; no fix needed.

5. **Save queue — [Character.svelte:30](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:30):** If a save fails, a new change made while the recovery `get()` is pending receives the new epoch, is applied to the rejected optimistic body, and is later sent against the refreshed server body. A priority swap can therefore save a different result from the one shown. Fix: prevent new changes until recovery finishes and the local body has been reset to the fetched version.
### Response
Accepted (a) globalThis.fetch and (b) import names; fixed. (c) computed globalThis reads: kept refused ON PURPOSE (a computed key can reach any banned name), test documents it. Client: changes blocked (page inert) while a failed save reloads.

## Round 3 — Codex
[tools/content.mjs:50](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content.mjs:50): `forbiddenIn('globalThis.globalThis.fetch("/x")')` returns `[]`; the second property lookup reaches the banned global `fetch`. Fix: refuse `globalThis.globalThis` as an alias to the global object.

VERDICT: REVISE
### Response
Accepted: globalThis.globalThis and self/global refused. top/parent/frames left out (common local names, e.g. vr2-options uses `top`); shortcut comment records the limit.

## Round 4 — Codex
The fix rejects `globalThis.globalThis.fetch(...)`, `self.fetch(...)`, and `global.fetch(...)`. Focused tests pass, and the current copied rules remain accepted. I found no defect introduced by this commit.

VERDICT: APPROVED
### Response
Approved.
