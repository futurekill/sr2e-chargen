# Code review log: site themes (roadmap item 8)
_2026-11-25/26. Codex gpt-6-sol: r1 high, r2 medium (fix-only). Themes per docs/GRAPHICS.md §3 (dark variants for
Terminal, Cyberpunk and Cybernoir; GeoCities light), token sets only (docs/PLAN-M3.md §6)._

## Round 1 — Codex
1. **Readable font fails in three themes** — [client/src/main.js:7](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/main.js:7). Cyberpunk, Cybernoir, and GeoCities load after the equally specific readable font rule in `terminal.css`, so choosing any of them replaces the readable font and heading override. **Fix:** load the readable font rule after every theme, or give it higher specificity.

2. **A failed save can leave an unsaved theme displayed** — [client/src/pages/Account.svelte:27](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Account.svelte:27). If the PUT fails before saving and the follow-up GET also fails, the new theme remains applied and stored in `localStorage`; the server still holds the old theme. **Fix:** retain the last confirmed theme and restore it when reconciliation fails.

3. **GeoCities keeps a dark browser toolbar** — [client/index.html:11](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/index.html:11). On browsers that honor `theme-color`, selecting the light GeoCities theme leaves the browser chrome at Terminal’s dark `#14110d`. **Fix:** update `theme-color` when applying a theme.

4. **Theme typography falls back on common systems** — [client/src/themes/cyberpunk.css:17](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/themes/cyberpunk.css:17). On a stock Linux installation, none of the named condensed heading fonts is typically present, so Cyberpunk renders with generic sans-serif headings; GeoCities likewise relies on unbundled Verdana and Trebuchet. **Fix:** bundle the intended fonts or choose reliably available system stacks.

The targeted account and contrast tests pass (22/22); they do not catch the font cascade or failed-save behavior.

VERDICT: REVISE

### Claude's response
- Fixed #1: the readable-font rule moved to client/src/readable-font.css, imported after every theme.
- Fixed #2: the Account page keeps the last theme the server confirmed and shows it again when a save can't be confirmed.
- Fixed #3: applyTheme sets the theme-color meta from the theme's --bg (first paint included).
- Rejected #4: every font stack ends in a generic family, as Terminal's does; bundling display fonts adds weight for
  headings only.

## Round 2 — Codex
VERDICT: APPROVED
