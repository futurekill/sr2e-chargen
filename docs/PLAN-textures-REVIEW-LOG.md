# Plan Review Log: textures
Started 2026-11-27. Codex gpt-6-sol.

## Round 1 — Codex
1. **The proposed CSS location breaks the existing test.** [theme-contrast.test.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/theme-contrast.test.mjs:14) treats every file in `themes/` as a theme, so adding `textures.css` there makes its token and file-list assertions fail.  
   **Fix:** Put the CSS outside `themes/`, or make the test enumerate only `THEME_KEYS`.

2. **The preference route cannot accept the proposed payload yet.** [auth.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/auth.mjs:45) rejects `textures` as an additional property, and its top-level spread would replace the entire map, losing choices saved for other themes.  
   **Fix:** Add a schema for known theme/key pairs and merge validated texture entries into the stored map inside the transaction.

3. **“First paint” is not achieved by `main.js`.** [index.html](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/index.html:15) loads the module after parsing; [main.js](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/main.js:18) sets the theme only after that bundle runs. The new texture can visibly appear late, particularly on a cold load.  
   **Fix:** Set the validated theme and texture with a small self-hosted head script before styles paint, then reconcile them with the fetched account preference.

4. **Signed-out behavior conflicts with the stated default.** [PLAN-textures.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-textures.md:23) specifies the default theme’s texture when signed out, but [App.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/App.svelte:58) leaves the previous account’s theme applied on logout. A shared device would likewise retain its texture until another session loads.  
   **Fix:** Apply the signed-out default on logout and a confirmed 401, and define how the local first-paint cache is cleared.

5. **The CSP proof would be invalid.** [a11y-scan.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:270) disables CSP for every page, so its screenshots cannot prove the inline SVG data images work under [app.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/app.mjs:35).  
   **Fix:** Run a texture rendering check with CSP enforced and fail on blocked images or CSP violations.

6. **The proposed contrast measurement does not prove worst-pixel AA.** [PLAN-textures.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-textures.md:33) discards the most extreme pixels and tests only `--muted`; page text, links, borders, and focus indicators use other colors on the textured background.  
   **Fix:** Test actual pixel extrema against every foreground token used directly on `--bg`, with the applicable text or non-text threshold.

7. **The forced-colours and reflow gates miss the new states.** The current scan checks forced-colour control borders and runs [reflow](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:291) only in the first theme; it does not verify texture suppression or the proposed Account notes at 320 px, 200% text, and increased text spacing.  
   **Fix:** Assert the root image is `none` in forced colours for every texture, and run the Account layout checks with each theme’s longest note.

8. **The performance gate cannot catch the identified mobile risk.** The plan defers fixed-background and SVG grain costs to “the scan or a phone,” but the scan is [headless with GPU disabled](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:258) and records no scroll or paint timing.  
   **Fix:** Measure scrolling on a representative low-end phone before keeping fixed attachments and filtered grain; simplify any texture that stutters.

VERDICT: REVISE
### Claude's response
All 8 accepted: CSS outside themes/; PUT schema + per-theme merge; a self-hosted head script for first paint; sign-out/401 reset to the signed-out defaults and clear the cache; texture checks with CSP enforced; true pixel extrema against every token on --bg (text 4.5, line 3); forced colours checked per texture, Account reflow in every theme; #8 resolved by dropping fixed attachment entirely (no device test possible here).

## Round 2 — Codex
VERDICT: APPROVED