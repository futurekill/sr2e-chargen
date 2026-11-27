# Plan: the accessibility pass (roadmap item 9)
_Built as 1.0.0 (2026-11-27). Round 5 — revised after Codex r1–r5; build approved by the user after round 5 (docs/PLAN-a11y-REVIEW-LOG.md), 2026-11-27._ User (2026-11-26): "a full audit and fixes, the maintainer's call on
the means"; WCAG 2.2 AA as the bar; automated checks (axe) in CI plus a manual screen-reader pass. User (2026-11-27):
do it now, social login waits.

## Goal
Every page of the app usable by keyboard alone, by a screen reader, at 200% and 400% zoom, with reduced motion and in
Windows high-contrast mode, in all four themes; form errors tied to their fields; the PDF sheets and table card as
tagged PDFs with a reading order and real text. Proven by an automated check in CI that fails on any regression, plus
a written manual screen-reader checklist.

## What is there today (read 2026-11-27)
`<html lang="en">`, one `<main>`, labelled form controls almost everywhere, `:focus-visible` outlines (accent colour),
`role="alert"` / `role="status"` notices, transitions and the landing animation only under `prefers-reduced-motion:
no-preference`, theme contrast pairs tested (test/theme-contrast.test.mjs), the Character page's steps as an ARIA
tablist. Gaps known before measuring: no skip link; `document.title` never changes by page; focus stays on the old
control after a route change; field errors are page-level only; the PDFs are untagged (`new PDFDocument` without
`tagged`); 10 Svelte a11y warnings (`section` with `role="tabpanel"`); no automated page-level check at all.

## Approach

### 1. The harness first (it finds the work)
`tools/a11y-scan.mjs` (dev only), run by `npm run a11y` and a new CI job:
- CI builds what the app serves first (`npm run build`, `npm run build:catalog`; r1 #12). The harness starts the real
  app in-process (`buildApp` + `listen` on **127.0.0.1 only**, a free port, a temp SQLite database deleted at the end,
  the real catalog; r1 #13), seeds through the library functions with credentials generated in memory for this run
  (never written to a file): an admin and a user; a character in
  creation, a finished character with vehicles, a catalog vehicle, a designed vehicle, an NPC, a draft, an item in the
  trash. Signs the browser in by setting the session cookie the test created.
- Drives **puppeteer-core** against the system Chrome (CI: `ubuntu-24.04` ships Google Chrome; locally the installed
  Chrome; `CHROME_PATH` overrides) — no browser download, no Playwright.
- Visits every route (sign-in, redeem/reset with a fake fragment, library, catalog, account, admin, each document kind,
  every Character tab in creation and in play) in each of the four themes and runs **axe-core** with the
  `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22a, wcag22aa` tags AND `target-size` enabled explicitly (it is off by
  default; the run asserts it ran; r1 #1). Any violation fails, with the rule, the page and the node. **Incomplete**
  results (axe's "needs review") are written to the report and each is reviewed by hand once, its verdict recorded in
  docs/ACCESSIBILITY.md; a new incomplete fails until reviewed (r1 #2).
- **Every conditional branch** (r2 #1, r3 #1): the seed holds designs chosen so that EACH conditional control of
  VehicleDesign renders at least once — a ground vehicle, a non-skiff boat on a non-sail plant (Hydrofoil shown), a
  fixed-wing aircraft (Takeoff shown), a design with living amenities (Occupants shown) and one with drive-by-wire
  installed (its split shown; r4), and the other conditions the component tests — and the harness
  asserts a list of those controls (by label) appeared in some scan; the same list covers the other conditional
  controls (r5 #2): Character's totem select (a shaman in creation) and an item's choice fields (a purchase started),
  Library's vehicle model and NPC "Start from" selects, and the NPC experience preview table (years entered); a magician and an adept NPC (the totem select),
  a character in creation at each method (priority, sum-to-10, points) and one finished.
- **States, not just pages** (r1 #2, r3 #2): each page is also scanned after the harness activates every collapsed
  disclosure — `<details>` and any button with `aria-expanded="false"` (a Catalog entry's detail panel), and a
  Character purchase started (its choice fields and Buy/Cancel), asserting those controls rendered — after a refused submit
  (the error state), after a save (the status notice), and while a request is pending (busy).
- Extra checks axe can't make, per page:
  (a) **keyboard** (r1 #3): the harness computes the tabbable set in the page (visible, enabled, tabindex ≥ 0), then
  presses Tab until focus returns to the start: every tabbable element is reached once, in order, nothing traps
  focus, Shift+Tab walks back. A radio group is ONE Tab stop (the checked radio, or the first when none is), its
  options tested with the arrow keys (r5 #1). A visually hidden but focusable input (the file pickers inside a styled label, r2 #2)
  is part of the traversal; its focus indicator is read from its label.
  **Save-on-change** (r2 #3, 2.4.3): a control that saves on change keeps focus — the harness changes it by keyboard,
  waits for the save, and checks focus is back on that control (not on `body`) and the next Tab goes to the next
  control. The pages keep focus by marking the control `aria-disabled` with a busy guard instead of `disabled` while a
  request runs (a disabled element drops focus). Composite widgets are tested by their pattern: the Character tablist takes
  ←/→/Home/End and moves selection and focus.
  (b) **focus visible and not obscured** (r1 #4, 2.4.7, 2.4.11): for each focused element, at 1280 and at 320 px wide:
  its rectangle is inside the viewport, `elementFromPoint` at its centre is the element or inside it (not covered by
  a sticky header), and its indicator (outline or box-shadow) is at least 2 px with 3:1 contrast against the page
  background (from computed styles).
  (c) **reflow and clipping** (r1 #5, 1.4.10, 1.4.4, 1.4.12): at 320 CSS px no horizontal page scroll
  (`scrollWidth <= innerWidth`; a data table that can't reflow sits in a labelled scroll region); no element with
  `overflow: hidden|clip` cuts text (`scrollWidth > clientWidth` on a text-bearing element fails; decorative images
  excepted by class); the same at 200% text size; and with the 1.4.12 text-spacing overrides injected (line height
  1.5, paragraph spacing 2em, letter .12em, word .16em).
  (d) **motion** (r1 #6, 2.3.3): with `prefers-reduced-motion: reduce`, an init script counts `animationstart` and
  `transitionstart` events from the first paint, through the page's interactions (open a details, submit a form);
  the count must be 0.
  (e) **forced colors**: with `forced-colors: active` emulated, every button and input keeps a visible border and the
  focus indicator; Windows High Contrast itself is in the manual pass (emulation is not proof; r1 #6).
- Output: a JSON report (rule, page, a CSS selector; no HTML, cookies or ids; r1 #13) uploaded as a CI artifact even
  when the scan fails (r1 #12); the exit code is the gate.

### 2. Fixes (from the harness, plus the known gaps)
- **Skip link** to `#main` (first focusable, visible on focus); `<main id="main" tabindex="-1">`.
- **Page titles** (2.4.2): each route sets `document.title` ("Library · Hoi, chummer!", the document's name on its page).
  The harness asserts the expected title after every route, sign-in/out and async document load (axe passes any
  non-empty title; r5 #3).
- **Focus on navigation** (r1 #7): after a route change — and after signing in or out at the same URL — focus moves
  to the destination's `h1` (`tabindex="-1"`) once that heading has RENDERED (a page with async data signals "ready";
  App waits for it), and a polite live region announces the page title; never on the first load.
- **Field errors** (3.3.1, 3.3.3, 4.1.3): forms whose server refusal concerns one field (sign-in, redeem/reset
  passwords and handle, account password, names, numeric fields refused by the reducer) mark that field
  `aria-invalid="true"` and link the message with `aria-describedby`; the page-level `role="alert"` stays. A Refused
  answer that names no field stays page-level only.
- **Tabs**: the Character tablist keeps its ARIA pattern; the tabpanels become `div`s (the Svelte warnings) and the
  arrow-key handling is checked by the harness's keyboard pass.
- **Busy states**: a region whose controls are disabled while a request runs gets `aria-busy="true"`; saves announce
  through the existing `role="status"` notices.
- **Number inputs that save on change** (Npc, VehicleDesign, Character): the label names the thing ("Rating of
  Firearms"), the saved result is announced once.
- **Forced colors**: `@media (forced-colors: active)` — buttons, the tab "count" badges and the `.cite` chips use
  system colours (`ButtonText`, `Highlight`) and keep borders; focus outline `Highlight`.
- **Data tables** (r1 #8, 1.3.1): every table gets real headers — the Workshop's Design Points table gains `th`
  column headers; the NPC experience preview's first column becomes `<th scope="row">`; each table gets a caption.
  Tables that can't reflow sit in a labelled `role="region"` `tabindex="0"` scroller; everything else wraps.
- **Images**: the landing plate stays decorative (`alt=""`, `aria-hidden`; it carries no information; r1 #14).
- **Form rows** (user, 2026-11-27: "the start button is misaligned"): a form row's controls line up by their bottom
  edge and share one height (2.75rem, also a comfortable touch target).
- Whatever else the harness reports is fixed at its source (shared CSS first), not suppressed. No axe rule is
  disabled; if one is a confirmed false positive it is excluded for that one node with a comment and a RULINGS-style
  note in docs/ACCESSIBILITY.md.

### 3. The PDFs (sheet and table card)
`new PDFDocument({ tagged: true, lang: "en-US", displayTitle: true, … })` — pdfkit 0.20's own tagging:
- Structure: `Document` → per page block a `Sect` with an `H1` (the character's name, page 1) / `H2` (each block
  title), `P` for prose lines, `L`/`LI` for lists. **Tables** (r1 #9): a grid whose model rows have column meaning
  gets column labels added to the MODEL (`columns: [...]`, the same words a reader needs, e.g. "Skill", "Rating",
  "Specialization") and is tagged `Table` → `TR` → `TH` (scope Column) / `TD`; a key/value block (attributes,
  derived stats) is a `Table` whose key cell is `TH` with scope Row. The model change is tested.
- **Condition monitors** (r1 #10): the boxes carry information (damage marked), so each monitor is a `Figure` with alt
  text ("Physical: 3 of 10 boxes marked; overflow 0") built from the model; the box strokes inside are artifacts.
- Decorative drawing (rules, bands, motifs, frames) and the **page-number footers** (pagination artifacts; r1 #11)
  are marked as artifacts, so readers skip them.
- Reading order: blocks are added to the structure in reading order (left column top to bottom, then right) AND the
  renderer draws them in that same order, as pdfkit's guidance asks (natural drawing order; r1 #11).
- The portrait, when present, is a `Figure` with alt text ("Portrait of <name>").
- Test (pdfjs-dist, already a dev dependency): the produced PDF has `MarkInfo.Marked`, `Lang`, a struct tree whose
  first heading is the name, the expected `Table`s with `TH` cells, and the monitors' `Figure` alt text. **Untagged
  text** (r1 #11): `getTextContent({ includeMarkedContent: true })` — every text item sits inside a marked-content
  sequence that is either tagged (has an MCID in the struct tree) or an Artifact; none outside both. One sample sheet's
  text read in structure order is compared with the expected reading order — for a sheet in EACH style and for the
  table card (its own render path; r2 #4), and each `TH` is asserted to carry its `Scope` (Column or Row) with the
  cells it heads. The fit tests keep passing. The card is in the manual screen-reader script too.
- Not claimed: full PDF/UA conformance (pdfkit can't produce every PDF/UA requirement; documented).

### 4. Manual pass and documentation
- `docs/ACCESSIBILITY.md`: the target (WCAG 2.2 AA), what is automated, known limits, how to report a problem.
- QA-PLAN: a screen-reader script for **VoiceOver** (macOS Safari) and **NVDA** (Windows Firefox): sign in, create a
  character through every step, buy in play, build a vehicle and an NPC, export, print a sheet and read it in a PDF
  reader with the screen reader. The maintainer runs it (Claude can't drive NVDA); results logged in the file.
- CHANGELOG, README (a short accessibility line). ROADMAP item 9 is marked done only when the VoiceOver and NVDA
  results are recorded in QA-PLAN and their findings fixed (r1 #15); until then "automated part done, manual pass
  pending".

## Key decisions & tradeoffs
- **puppeteer-core + system Chrome + axe-core** (two dev dependencies, no browser download) over Playwright (larger,
  downloads browsers). CI's runner image provides Chrome.
- **Zero-violation gate**, no baseline: the app is small enough to fix everything now.
- **Real app, real data** in the scan (seeded through the library), not component mounts — the pages people use.
- **pdfkit's native tagging** over a different PDF library; PDF/UA not claimed.
- Manual screen-reader pass by the maintainer, scripted in the QA plan.

## Risks / open questions
- axe in headless Chrome can't judge everything (meaning of text, logical order); the keyboard pass and the manual
  script cover the rest.
- Tagging every drawn string in render.mjs is the biggest change; the fit tests guard against layout drift.
- The CI Chrome version moves with the runner image; a new axe rule can fail CI without a code change — pinned
  axe-core version, so only a dependency update brings new rules.

## Out of scope
A site footer (version, banter as a live chat board, other info; user 2026-11-27) and in-app help pages for every feature (user, 2026-11-27: their own plan, right after this one, so the new scan checks
them too); the Foundry system's own sheets; the Shadowland banter content; translations (English only); social login (later).
