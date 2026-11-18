# Plan: milestone 3 — the printable sheet (first slice: derived values + the Classic sheet)
_Draft 1 (2026-11-18). Roadmap item 3 (docs/ROADMAP.md). The sheet rules already approved in docs/PLAN.md "Exports"
(U16–U22: fit rule, pages, print, readable fonts, fit test) apply unchanged; this plan settles how to build the first
style. ("M3" in docs/PLAN-M3.md is the OLD numbering — the app skeleton; this file is roadmap milestone 3.)_

## Goal
From any character in the library, "Print sheet" gives a PDF in the **Classic** style (a functional layout in the
spirit of the official SR2 sheet, no FASA art or logos), US Letter or A4, that a player prints at home and plays from.
It works for an UNFINISHED character too (marked "draft — not finished"), because M2d (finish) waits for the system
release.

## 1. Derived values: `shared/derive.mjs` (pure, server and browser)
`derive(body)` → the numbers a sheet shows, each from the system's own pure functions where they exist:
- **Attributes**: base + racial modifier (p.45) + cyberware `attributeMods` (installed, absolute) + adept powers'
  `attributeMods × level` (physical adepts) — the composition `CharacterData` does, limited to what the core book can
  put on a creation character (no bioware, limbs or Edges: those are M5). Shown as "natural (augmented)".
- **Essence** and **Magic**: the values `validate` already computes (one function, shared — no second copy).
- **Reaction**: `reactionBase(Q, I)` (p.45) + ware/power Reaction mods. **Initiative**: Reaction + 1D6 + extra dice
  from ware (`attributeMods.initiativeDice`) and Increased Reflexes.
- **Dice pools** (p.84): Combat ⌊(Q + I + W) ÷ 2⌋ less `heavyArmorPoolPenalty`; Magic (magicians: Sorcery + …, as the
  system's formula — read from `CharacterData` and, if it lives only there, recorded as a system gap S5b); Astral
  Combat `astralCombatPool`; Hacking and Control only with a deck / VCR (else omitted). **Karma Pool**:
  `startingKarmaPool(race, moreMetahumans)` (p.47).
- **Armor**: `wornArmorTotals` (equipped armor; everything bought starts equipped).
- **Condition monitors**: 10 boxes each, Physical and Stun (p.112); overflow = Body.
- **Attacks**: each weapon's damage code and the skill it uses, as the system stores them (no recomputation).
- The **parity test** of PLAN-M2 §5 (Foundry's values for the pregens) is still M2d; until then derive has unit
  tests from the book's examples and a comparison against the pregens' sheet values entered by hand from Foundry.

## 2. The sheet model: `server/sheet/model.mjs`
`sheetModel(body, derived, catalog)` → sections of rows (strings and numbers only), the single source every style
draws: header (street name, metatype, magic, priorities, Essence, Karma Pool, "draft" flag), attributes, pools,
initiative, monitors, armor, attacks, skills (with concentration/specialization lines), cyberware, gear, spells, foci,
contacts and lifestyle (when M2d lands), notes. Book page references in small type after each item. All user text
is escaped where the renderer needs it.

## 3. The renderer: PDF directly with pdfkit (new dependency) + embedded fonts
- **Why not SVG → librsvg** (the Fohawk script's way): it needs a native binary that the distroless image doesn't
  have. pdfkit is pure JavaScript, embeds TrueType/OpenType fonts and measures text with the same font metrics it
  draws with (`widthOfString`, `heightOfString`) — the fit test's requirement.
- Fonts bundled in the repo, SIL OFL: one sans for body (Atkinson Hyperlegible), one condensed for labels; the
  dyslexia-friendly option (U22) is the same family set swapped. Licence files committed beside them.
- Layout engine (ours, small): a column flow of sections; each row is measured before it is placed; the fit order of
  PLAN.md (wrap → shrink to the floor 8 pt body / 6.5 pt labels → continue on the next page with "continued"). Page 1
  holds the at-the-table sections (attributes, pools, initiative, monitors, armor, attacks, active skills).
- Paper: Letter and A4 (the user's choice; reflow, never scale), margins ≥ 12.7 mm, black on white, condition boxes
  ≥ 7 mm for pencil.
- Runs on the SERVER (`GET /api/documents/:id/sheet.pdf?paper=letter|a4&font=standard|readable`) in a separate,
  killable child process with a time and memory limit (PLAN.md denial-of-service rule), one at a time per user.

## 4. Fit test (CI)
The renderer returns the list of every text run it placed with its box. A test renders fixtures (an empty draft, the
M2c resource test characters, a stress character: the catalog's longest item names, a 120-character name, 60 skills,
40 items, long notes) × Letter/A4 × both fonts, and fails when a model string is missing from the placed runs, a run
leaves its box or the page's safe area, a run is under the size floor, or a glyph is missing from the font.

## 5. Client
"Print sheet" on the Character page (paper and font choices remembered per user in the browser), opening the PDF.

## Out of scope (later slices)
The Fohawk style and ink-saver; the table card; the Markdown stat block; the portrait (needs uploads).

## Risks
- Derive duplicates `CharacterData` composition → drift. Control: unit tests now, the pregen parity test in M2d.
- pdfkit's text measurement vs. its drawing must agree (same engine — the reason it's chosen); the fit test checks it.
