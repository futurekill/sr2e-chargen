# Review log: the landing / sign-in page (roadmap item 8, user request 2026-11-26)
_Codex gpt-6-sol: art generation (low; prompt in docs/art/landing-prompt.txt, three variants, A chosen), design review
r1 high with screenshots, r2 medium (fix-only). Original art: the SR2 cover's mood only (a mixed-metatype team, neon,
rain, Seattle), no copy of its composition, no artist named in the prompt._

## Round 1 — Codex
- [SignIn.svelte:44](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/SignIn.svelte:44), [54](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/SignIn.svelte:54): Just below 56rem, the layout stacks a nearly full width 16:9 image above the form. Around 895px wide on a 768px tall screen, the submit button falls below the fold. **Fix:** Use a shallower image ratio in the intermediate width range.

- [SignIn.svelte:20](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/SignIn.svelte:20): Above the shell’s 72rem cap, `60vw` keeps growing while the image stays about 42rem wide. At 1920px and 1× density, the browser can choose the 257KB image where the 116KB variant suffices, slowing the image’s LCP. **Fix:** Cap the wide-screen `sizes` value at the plate’s actual width.

- [SignIn.svelte:47](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/SignIn.svelte:47), [59](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/SignIn.svelte:59): In GeoCities, both fades end in white, bleaching the dark artwork at the card edge and, on narrow screens, across the runners’ lower bodies. **Fix:** Disable the fade for the light theme and use the existing card edge as the boundary.

- [SignIn.svelte:18](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/SignIn.svelte:18): The empty image alt hides the image, but the uncaptioned `<figure>` can remain an unnamed figure in a screen reader’s reading order. **Fix:** Add `aria-hidden="true"` to the decorative figure.

VERDICT: REVISE

### Claude's response
All four fixed: a 3:1 banner between 36rem and 56rem (the button stays above the fold at 895x768); `sizes` capped at the
plate's real width (42rem) above 72rem; the gradient fades removed (the card edge is the boundary; GeoCities no longer
bleaches the art); `aria-hidden` on the decorative figure.

## Round 2 — Codex
VERDICT: APPROVED
