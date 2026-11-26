# Plan: more sheet styles (roadmap item 8)
_Round 3 — 2026-11-26 (revised after Codex plan r1–r3: docs/PLAN-sheet-styles-REVIEW-LOG.md). Fohawk became the
default style the same day (97d0122); the order below lists it first._ _Originally: Follows docs/PLAN-sheet.md (U16 "multiple character sheet styles"), docs/GRAPHICS.md (sheet
table: "Future theme sheets: theme expressed through typography and a small motif"; vector only, no textures, the
portrait the only raster; prints on white; meaning never by colour alone)._

## Goal
Two new printable styles that match the new site themes, for the full sheet AND the table card, on Letter and A4, in
both font sets: **Printout** (the Terminal / Cyberpunk feel: a fanfold computer printout) and **Dossier** (the
Cybernoir feel: a municipal case file). They keep Classic's layout, so every fit rule, overflow page and test that
Classic passes applies unchanged.

## Approach
1. **One style list, shared**: `shared/sheet-styles.mjs` exports `SHEET_STYLES = [{ key, name, layout, head, ink }]`
   — fohawk (default), fohawk-ink, classic, printout, dossier; `layout` "fohawk" | "classic"; `head` the heading face
   ("mono", "serif" or null = the user's set). `render.mjs` `STYLES` = its keys; the two route schemas and the Print
   tab select read it (no hard-coded lists left; a test greps for them).
2. **Layout from the style, everywhere** (r1 #1): `const look = SHEET_STYLES.find(...)`, `fohawk = look.layout ===
   "fohawk"`, `inkSaver = look.key === "fohawk-ink"`; every existing `fohawk` test (table weights, monitor spacing,
   header) then follows the layout, so Printout and Dossier draw exactly what Classic draws except the three hooks in 4.
3. **Heading faces are NOT font sets** (r1 #2): `FONT_SETS` stays { standard, readable } (the public choice and the
   test matrix). A separate `HEAD_FACES = { mono: ["@fontsource/noto-sans-mono", "@fontsource/noto-sans"], serif:
   ["@fontsource/noto-serif", "@fontsource/noto-sans"] }`; `facesFor(set, weight)` takes either map's key.
   `segments`/`width`/`wrap`/`draw`/`block` take an optional `set` (default the user's), so a heading is MEASURED and
   drawn in the same face. With `font=readable` the heading set is the readable set (U22). Each run records the
   face NAMES its segments were actually drawn in (`faces`), not only the set asked for (r1 #8, r2 #2). The header's
   title and header line are tagged kind "head" (r2 #1); the fit test's text collection (test/sheet.test.mjs, the
   `kind === "text"` filter) includes "head" runs, so the required-string check still sees them (r3 #2).
4. **The three hooks** (only for the classic layout):
   - `bar(title)`: Classic unchanged. Printout: `> TITLE` (the prefix is part of the drawn text) in the heading set, a
     dashed 0.8 pt rule below. Dossier: TITLE in the serif set, a 0.5 pt double rule (2 pt apart) below, dark brass
     `#705024`. No extra letter-spacing (r1 #4). `bar` returns the height it actually drew: the title block's height
     (maxLines 1, shrink to LABEL_FLOOR; a longer title wraps and the bar grows) + the rule gap — callers already add
     the return value, so pagination follows what was drawn.
   - Rows (Printout only): light grey `#efefef` bands behind every other row (r1 #9), drawn before the row's text,
     recorded as `shapes` kind "fill".
   - Header: the title (and the header line) in the heading set; no frame (r1 #5).
   Every rule is recorded as a `shapes` entry kind "rule" with its bounds.
5. **Table card**: the card is built by the same classic/fohawk branches, so it gets the hooks with no new layout.
6. **Tests** (`test/sheet.test.mjs`):
   - The fit matrix already loops `STYLES × PAPER × FONT_SETS`; `strings()` picks the expected fields by LAYOUT, not
     by `style === "classic"` (r1 #3).
   - New: no text run intersects a "rule" shape, for every style × paper × font on the fixtures (r1 #5).
   - Card tests loop font sets too: fitting cards with the pdf.js text check, AND both refusal cases (overflow and
     the header refusal) across style × paper × font (r1 #6, r2 #3).
   - The heading faces exist: `HEAD_FACES` primary packages have 400 and 700 latin WOFFs and a licence file (r1 #7).
   - Every sheet and card has a "head" run for its title (and the header line where the model has one) before any
     face is checked, so an untagged header fails (r3 #1).
   - Printout draws ≥ 1 "fill" on a 3-row table; Dossier and Classic none. For every style × font, on the sheet AND
     the card: every "title" and "head" run's `faces` are all from the expected set's packages (readable → the
     readable faces; standard → mono for Printout, serif for Dossier, the standard set otherwise), Noto Sans
     fallback faces allowed only for glyphs the primary lacks (r1 #8, r2 #1–#2).
   - Routes: `?style=printout` / `dossier` give a PDF; an unknown style is 400.
7. **Docs**: README Print section (five styles), CHANGELOG Unreleased, ROADMAP item 8 note.

## Key decisions & tradeoffs
- **Classic layout, new look** instead of new layouts: a new layout means new fit rules and a new set of failure
  modes; the GRAPHICS.md table asks only for typography and a motif. A themed layout can come later.
- **Body text stays in the user's font set**: mono/serif body text at 9–10 pt costs width (mono ≈ 20% wider) and
  would change wrapping; headings only keeps Classic's metrics for every table.
- **Printout bands**: light neutral grey (#efefef), not green: the printout motif survives grayscale and costs
  little toner (r1 #9). Ink-saver users have Classic and Fohawk-ink.
- **Two new font packages** (Noto Sans Mono, Noto Serif): fonts are assets, not code; the renderer already loads
  fontsource WOFFs by path. Adds roughly 1–2 MB to the image.
- **Names**: "Printout" and "Dossier", not the site theme names, so a sheet style isn't tied to a site theme.

## Risks / open questions
- Noto Sans Mono / Noto Serif subset coverage: the per-glyph fallback to Noto Sans handles a missing glyph, as today.
- Heading width: a mono heading is wider; `block` shrinks a one-line title toward its floor (maxLines), which already
  exists. The fit test proves it on the long-name fixtures.
- The pdf.js text check compares placed text: a bar's `> ` prefix is placed text, so it must be in the run (draw it
  through `block`, not raw `doc.text`).

## Out of scope
New layouts; site-theme-driven default style; a Printout ink-saver; colour sheets; the Markdown stat block (no style).
