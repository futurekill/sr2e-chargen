# Code Review Log: background textures (1.2.0)
Codex gpt-6-sol. Plan: docs/PLAN-textures.md (2 plan rounds, approved).

## Round 1
1. **A 401 during an active session leaves the previous look cached.** If a session expires while the Account page is open, a preference request returns 401, but [request()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/lib/api.js:8) only throws; `resetLook()` runs when `/api/session` is checked or the user signs out. **Fix:** Handle confirmed `no-session` responses centrally by clearing the remembered look and session state.

2. **Some invalid cached themes break first paint.** With `localStorage.theme = "constructor"`, [boot.js](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/public/boot.js:7) treats an inherited property as a known theme, then throws before setting either attribute. I reproduced this with `constructor`, `toString`, and `__proto__`. **Fix:** Generate an own-property check for `known` and fall back to the default theme.

3. **A failed Background save can leave the control showing the wrong choice.** If both the PUT and recovery GET fail, [Account.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Account.svelte:47) restores the old background from `prefs.textures`, while the select can retain the newly chosen option because its derived value has not changed. **Fix:** Keep an explicit select value and reset it to the saved choice on failure.

4. **The texture scan can pass with a broken SVG layer.** [textureChecks()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:343) resolves `Image.onerror` as success. For Neon wash, its gradients can still make the screenshot nonflat when the grain SVG fails, so the render check passes. **Fix:** Fail on image load errors and verify each URL layer loads.

The generated-file checks and lint pass. I found no Docker copy-order issue: `client` is copied before the Vite build. A signed-out page load does call `resetLook()`; clearing the old cache there matches the stated behavior.

VERDICT: REVISE
## Round 2
1. [Account.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Account.svelte:59): If a Background save gets `401 no-session`, App resets the look, but the save handler continues after its recovery GET and calls `applyTheme(theme, prefs.textures)`. With Terminal selected, that restores Terminal and its cached texture after sign-out. `saveTheme()` can do the same. **Fix:** Stop these save handlers after the lost-session callback signs the app out, before either can reapply a look.

The boot guard and per-URL image failure check address their Round 1 findings; the four texture tests pass. I found no further issue in the specified axe handling.

VERDICT: REVISE
## Round 3
VERDICT: APPROVED
Fixed: r1 — a 401 no-session anywhere signs the app out and resets the look; boot.js own-property check (tested); the Account Background menu resets to the saved choice; the scan fails a url() layer that doesn't load. r2 — Account save handlers stop after a lost session. Also while building: six textures toned down so --line stays ≥ 3:1 and GeoCities graph keeps --danger ≥ 4.5:1 at the worst pixel; axe's colour-contrast incompletes tagged bgImage/bgGradient/shortTextContent are answered by the scan's pixel check while a texture is on (docs/ACCESSIBILITY.md).
