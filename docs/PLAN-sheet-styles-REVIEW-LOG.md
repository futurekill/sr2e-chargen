# Plan review log: more sheet styles
Started 2026-11-26. Codex gpt-6-sol high, read-only; a fresh session each round.

## Round 1 — Codex
**The plan needs revision.** The main risk is its assumption that Classic’s fit behavior carries over unchanged. The proposed fonts and ornaments change what must be measured.

1. **The layout switch is incomplete.** Changing only `if (!fohawk)` leaves `fohawk = style !== "classic"` controlling table weights, monitor spacing, and other drawing for Printout and Dossier in [render.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:55).  
   Fix: Derive `fohawk` from the style’s `layout` and use that value throughout the renderer.

2. **Heading families are confused with user font choices.** Adding `mono` and `serif` to `FONT_SETS` makes them valid whole-sheet fonts and expands the test loop, while [segments, wrap, and draw](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:65) currently take only the user-selected font.  
   Fix: Keep heading families separate and pass the chosen family through measurement and drawing for headings only.

3. **The existing fit assertion will fail for both new styles.** [strings()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/sheet.test.mjs:37) expects Classic fields only for `style === "classic"`; it will expect Fohawk fields from Printout and Dossier output.  
   Fix: Select expected strings by layout, then run the full-sheet matrix.

4. **An 18 pt bar is not guaranteed.** [block()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:106) still draws multiple lines if a heading exceeds `maxLines` at its size floor; Dossier tracking also adds width that today’s `widthOfString` checks omit.  
   Fix: Measure tracking and actual bar height, and advance pagination by the height drawn.

5. **The proposed ornaments escape fit verification.** The current [fit test](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/sheet.test.mjs:57) checks text against text and shapes against page bounds, but not rules or frames against text; a Dossier frame around the [header text starting at its left edge](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:218) can touch glyphs.  
   Fix: Give framed text measured padding and test ornament bounds and intersections.

6. **Card coverage is narrower than claimed.** [Card tests](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/sheet.test.mjs:180) loop style × paper only; they omit both font choices, overflow cases for the new styles, and pdf.js text extraction.  
   Fix: Test card fit, refusal, and extracted text across style × paper × user font.

7. **A missing themed font can pass silently.** [facesFor()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:26) skips absent WOFF files and accepts Noto Sans fallback as a nonempty result, so a wrong Fontsource filename or weight could produce an unthemed PDF. Fontsource distributes [subset-specific font files](https://github.com/fontsource/google-font-metadata/blob/main/README.md).  
   Fix: Pin the production packages and assert that each primary face has the required 400/700 Latin WOFF files and licence.

8. **The proposed face test cannot inspect a face.** [Runs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:101) record text and geometry, not face names; pdf.js text equality also cannot prove the intended font was embedded.  
   Fix: Record face names per drawn segment or inspect embedded PDF fonts, including the readable override.

9. **The ink decision contradicts the stated look.** [The plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-sheet-styles.md:27) calls Printout “black only” while filling half of every table with green; a three-row motif test gives no evidence about ink use or grayscale legibility.  
   Fix: Use a very light neutral motif or specify an ink-saving variant, and review representative dense pages in grayscale.

A simpler implementation is to keep `standard` and `readable` as the only public font sets, add two internal heading-face choices, and measure each decoration where it is drawn.

VERDICT: REVISE

### Claude's response
All nine accepted (the plan's Approach was rewritten): layout drives every fohawk test (#1); heading faces are a
separate map, measured in the face they draw (#2); strings() by layout (#3); bars return the height drawn, no tracking
(#4); no header frame, rules recorded and tested against text (#5); card tests over font sets with the text check
(#6); a font-files test (#7); runs record their set (#8); grey bands instead of green (#9).

## Round 2 — Codex
The revision addresses most round 1 findings, but three gaps remain:

- **New — the header can miss the heading face.** The main title and header line are ordinary `text` runs in [render.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:218), so the planned `title` run assertion would pass even if those hooks are omitted on both sheets and cards. Fix: tag and assert both header runs’ selected faces in every style and font.
- **Round 1 #8 remains:** recording a run’s requested `set` cannot prove which face its segments actually used. Fix: record each drawn segment’s face name or inspect the PDF’s embedded fonts.
- **Round 1 #6 remains:** the [plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-sheet-styles.md) extends fitting card tests, but does not require overflow and header refusal across style × paper × font. Fix: run both refusal cases across that matrix and check pdf.js text for fitting cards.

VERDICT: REVISE

### Claude's response
All three accepted: header runs tagged "head" and asserted; runs record the faces actually drawn; both card refusals
across style × paper × font.

## Round 3 — Codex
(The first answer was a bare REVISE; the findings came on asking in the same session.)
- [Plan:46](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-sheet-styles.md:46): The face test checks only runs already tagged `head`. If the title or header line remains tagged `text`, the test can pass without checking its face. **Fix:** Assert that both header fields produce identified `head` runs on each sheet and card before checking their faces.
- [Plan:27](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-sheet-styles.md:27): Changing those runs to `head` makes the existing [fit test’s `text`-only collection](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/sheet.test.mjs:49) omit the title and header, so fitting cases fail the required-string check. **Fix:** Include `head` runs in that collection.

VERDICT: REVISE

### Claude's response
Both accepted: the header runs must exist as "head" before their faces are checked; the fit test collects "head" runs.

## Round 4 — Codex
Both round 3 fixes confirmed; no new problem.

VERDICT: APPROVED
