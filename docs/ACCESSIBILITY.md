# Accessibility

**Target:** WCAG 2.2 level AA for every page of the app, in all four site themes, and tagged PDFs for the printable
sheets and the table card. Plan and review: docs/PLAN-a11y.md, docs/PLAN-a11y-REVIEW-LOG.md.

## What is checked automatically (CI job "Accessibility", `npm run a11y`)
The real app runs on 127.0.0.1 with its own temporary data (a character in creation and a finished one, catalog and
designed vehicles — ground, boat, aircraft, living amenities, drive-by-wire — NPCs, drafts, the trash). Every page and
Character step is opened in each theme, with its disclosures opened, a purchase started, a refused sign-in and a save.
- **axe-core 4.14** with the WCAG 2.0/2.1/2.2 A and AA rules and **target size** (2.5.8) switched on. Any violation fails.
  "Needs review" results fail until a person records a verdict in `tools/a11y-reviewed.json` (below).
- **Keyboard:** Tab reaches every control once, in order, with no trap; a radio group is one stop; the Character steps
  take ←/→/Home/End; a control that saves on change keeps focus through the save.
- **Focus:** every focused control is on screen, not covered, and shows an indicator at least 2 px wide with 3:1
  contrast — in every theme, at 1280 and 320 px wide.
- **Reflow and text:** no sideways scroll at 320 px; no clipped text at 200% text size or with the 1.4.12 text-spacing
  overrides. Wide tables sit in a labelled, focusable scroll region.
- **Motion:** with "reduce motion", no animation or transition starts, from first paint through the interactions.
- **Forced colours:** every button and field keeps a border and focus indicator (Windows High Contrast is also in the
  manual pass: emulation is not proof).
- **Titles:** each page's title is checked after every navigation, sign-in and document load.
- **PDFs** (`test/pdf-tags.test.mjs`): each sheet style and the table card are tagged (language, an H1, sections with
  H2 headings, tables with row and column headers and their scope, the condition monitors as Figures whose alt text
  gives the boxes marked, page numbers as artifacts), nothing is left untagged, and the sections read in order.

## Reviewed "needs review" results
`tools/a11y-reviewed.json` lists each one with its verdict: list rows scrolled out of the Character shop box (same
colours as the visible rows), and the purchase table's "×" remove buttons (one glyph axe can't measure; its accessible
name "Remove <item>" starts with the visible text, as 2.5.3 allows).

## The Shadowland board
The footer's banter is decoration: screen readers get the whole thread as a list (not a live region, never
interrupting); the line-by-line reveal is hidden from them, has a Pause (it lasts longer than 5 seconds, 2.2.2), never
runs with "reduce motion", and can be hidden (footer or Account). The scan checks all of it.

## Known limits
- The PDFs are tagged but **not certified PDF/UA**: pdfkit can't produce every PDF/UA requirement.
- The landing picture is decorative (no information) and is hidden from screen readers.
- Busy states are shown by disabled controls and status messages, not by `aria-busy`.
- The **manual screen-reader pass** (VoiceOver and NVDA, docs/QA-PLAN.md) is the maintainer's; roadmap item 9 is done
  only when its results are recorded and fixed.

## Reporting a problem
Tell the admin of the node you use (the repository is private), and say which page, which browser and assistive
technology, and what happened. The maintainer takes it from there.
