# Plan: milestone 3 — the printable sheet (first slice: derived values + the Classic sheet)
_Draft 3 (2026-11-18), after Codex plan rounds 1–2 (13 + 5 findings; docs/PLAN-sheet-REVIEW-LOG.md). Round 2's fixes
are checked by the code review._ Roadmap item 3 (docs/ROADMAP.md). The sheet rules already approved in docs/PLAN.md "Exports"
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

## Draft 2 — changes after round 1 (these win over the text above)
- **Parity first, not later** (r1 #7): the roadmap's decision stands — the app derives a CREATION character itself
  (no in-play state), and the control is a parity test against Foundry, not the parked system-wide derive extraction
  (sr2e-foundryvtt docs/PLAN-derive.md). The test moves INTO this slice: a script run in the local test Foundry exports,
  for each pregen and for test characters built to cover the core creation options (ware with Reaction/Initiative mods,
  muscle replacement, a magician with bonded foci, a decker, a rigger, a physical adept), the actor's SOURCE and
  Foundry's prepared values (attributes, Reaction, Initiative, every pool, armor, monitors, Essence, Magic, Karma Pool,
  each weapon's damage code) as `test/fixtures/parity/*.json`. Because a character body IS Foundry's source shape,
  `derive(source)` runs on the same input; any difference fails and names the value. A pregen that uses something the
  app can't build (in-play state, sourcebook items) is compared only on what applies and says so.
- **Reaction** (r1 #1): `reactionBase(Q, I, exempt)` with the Quickness from muscle replacement exempted, as
  `CharacterData` does. **Initiative** (r1 #2): Reaction + 1D6 + dice from INSTALLED ware and Increased Reflexes; no
  spells (a printed sheet shows the unbuffed character; sustained spells are play state).
- **Pools** (r1 #3): computed by the same formulas `CharacterData._calculateDicePools` / `_calculateHackingPool` use —
  Magic Pool only for magicians (Sorcery + active bonded power foci), Hacking and Control by the system's deck and VCR
  rules; the parity fixtures include a decker and a rigger.
- **Armor** (r1 #4): armor bought at creation starts WORN (`equipped: true` in the purchase projection — a creation
  default); the sheet prints the worn totals from the actual flags.
- **Monitors** (r1 #5): two 10-box tracks; Physical overflow against NATURAL Body, as the system's rule.
- **Karma Pool** (r1 #6): `startingKarmaPool(race, moreMetahumans)` for a creation character; once M4 (management)
  stores Karma, the sheet switches to `karmaPoolCapacity`/`karmaPoolAvailable`.
- **Attacks** (r1 #8): weapons projected through the system's `strengthMinWeaponStats` (bows) and the rest of the
  weapon's prepared values; the Bow's damage is in the parity fixtures.
- **Fonts** (r1 #9): only fonts whose licence (SIL OFL 1.1) is verified from the font's own repository at the time
  they are added; font files and licence texts copied into the runtime image; a test checks each bundled font has its
  licence beside it.
- **Process limits** (r1 #10): rendering runs in a `worker_threads` Worker with `resourceLimits` (heap caps Node
  enforces), a wall-clock timeout that `terminate()`s it, ONE render at a time for the whole server (a queue of at most
  N waiting, else 503 "busy"), a page cap (30) and a byte cap (10 MB) checked before the response is sent; a failed or
  killed render returns an error, never a partial PDF.
- **Fit test** (r1 #11): besides the renderer's placed-run list, the test re-reads every produced PDF with pdf.js
  (dev dependency) and checks the extracted text equals the model's strings and every glyph lies inside the page's
  safe area; fixtures add unbreakable strings (a 60-character word), non-Latin text, and the maximum item count.
- **Untrusted text** (r1 #12): every user string is plain text — control characters and bidi overrides removed, no
  links, no markup; the route is rate-limited per user AND server-wide.
- **Simpler layout** (r1 #13): a FIXED Classic page 1 (the at-the-table sections in set boxes; the fit order applies
  inside each box) and continuation pages that flow the long lists — no general column-flow engine.

## Draft 3 — changes after round 2 (these win over everything above)
- **Parity input** (r2 #1): `derive` takes `{ actor, options }` (`options` = `creation.options`: More Metahumans);
  a fixture adapter wraps each exported Foundry source as `{ actor: source, options: { moreMetahumans } }`, with
  More Metahumans read from the exporting world's setting/race priority, so the app path and the fixture path call
  derive with the same input.
- **Render isolation** (r2 #2): a separate child process (`child_process.fork`) with `--max-old-space-size` (the V8 heap
  limit Node enforces — the only OS-free limit available in the shell-less image), a wall-clock `kill()`, one render
  at a time server-wide, a waiting queue of at most 4 (else 503), page and byte caps before the response.
- **Font coverage** (r2 #3): each font set has a fallback face (Noto Sans, SIL OFL, Latin/Greek/Cyrillic) chosen PER
  GLYPH by the layout's measure step; a character no bundled font covers makes the export fail with a message naming
  it (never a box or a blank).
- **Fit verification** (r2 #4): CI also checks that no two placed runs' boxes overlap and that each run's box is inside
  its section box; `npm run sheet:snapshots` renders every fixture's pages to PNG (pdftoppm, a developer tool, not in
  CI) into a review folder, regenerated and looked at whenever the layout changes.
- **Fonts named** (r2 #5): standard = Source Sans 3 (body) + Source Sans 3 Condensed weight for labels; readable =
  Atkinson Hyperlegible Next (body and labels, wider spacing). Both SIL OFL, licences verified when added. The SITE
  gains the same "readable font" setting in this slice (stored per user on the server, also used as the sheet
  default).

## As built (code review round 1)
- **Labels** use Source Sans 3 Bold, not a condensed face: no Source Sans 3 Condensed is published as an npm package,
  and bold at the same family reads clearly at 9 pt (r1 #8, plan changed).
- **The site-wide readable-font setting** (stored per user on the server) moves to the next sheet slice with the user
  settings it needs; this slice remembers the sheet's paper and font in the browser (r1 #9, deferred).
- The footer is "Page n of m" only; the title is printed in full in the header (r1 #1). Notes and names print in full
  (no length cut, r1 #2); a row taller than a page splits by lines across pages (r1 #3).

## Slice 2 (2026-11-18): the readable font everywhere, and the Markdown stat block
A small slice under the same approved rules (docs/PLAN.md U22 and Exports); its code review covers it.
- **Per-user preference, on the server**: migration `002-user-prefs` adds `users.prefs` (JSON text, nullable,
  added only if missing — the migration can rerun). `GET /api/account/prefs` → `{ readableFont }`;
  `PUT /api/account/prefs` (session, CSRF, origin, strict schema) sets it. The session answer carries the prefs, so the
  site applies the font at sign-in on any device; the browser copy is only the pre-sign-in default.
- **The site's readable font is real**: Atkinson Hyperlegible Next (the same OFL package as the sheet), bundled by
  Vite as WOFF2 (no third-party font host; CSP `font-src 'self'`), replacing the system-sans shortcut.
- **The sheet's default font** is the user's preference when the request names none.
- **Markdown stat block**: `GET /api/documents/:id/statblock.md` (characters; `text/markdown; charset=utf-8`, as an
  attachment) from the SAME sheet model: every section as a Markdown table, user text escaped for Markdown (`|`, `\`,
  `*`, `_`, `` ` ``, `<`, `[`, leading `#`), no links. A test checks every model string appears (unescaped form) and
  the table rows parse to the right column count. "Download stat block" beside "Print sheet".

## Slice 3 (2026-11-18): the Fohawk style and its ink-saver
Under the approved rules (PLAN.md "Exports": U16 styles, ink-saver for heavy-ink styles): `style=classic|fohawk|
fohawk-ink`. Same sheet model and engine; Fohawk draws a header band (title, metatype · magic, draft, resources left,
the priority letters), a big attribute row (accent + bold when augmented, "nat X"), a stat strip (Reaction,
Initiative, the pools that apply, Karma Pool, Essence, Magic, Armor), Skills | Condition monitor (wound levels
L/M/S/D marked, p.112) + Attacks, then the shared flow. The ink-saver outlines every band. Magenta never carries
meaning alone (accent text is also bold). No portrait yet (needs uploads). The fit test runs every style.

## Slice 4 (2026-11-18): the one-page table card
Under the approved rule (PLAN.md "Exports": the table card, with an explicit content budget). One page, never more:
- **Content**: header, attributes (the style's attribute block), Reaction/Initiative/pools/armor/Karma Pool,
  condition monitors, and the CHOSEN attacks, active skills, cyberware, adept powers and spells. No gear list, other
  skills or notes (they stay on the full sheet).
- **The choice is part of the character**: operation `setCard { itemId, on }` (allowed on a finished character too —
  it is a print choice, not creation). `creation.card` is null (= everything in those five sections) until the first
  change, then the list of chosen item ids; ids of removed items are ignored.
- **Fit, not cut**: the card uses the sheet engine with no continuation pages. If the chosen rows don't fit, the
  render fails with the sections and row counts that didn't fit; `GET /api/documents/:id/card/fit?style&paper&font`
  answers `{ fits, overflow: [{ section, rows }] }` (rendered in the same child process, the real measurement), and
  `GET /api/documents/:id/card.pdf` refuses (422) an overfull card.
- **Client**: a "Table card" section on the Character page: a checkbox per row in those five sections, the fit answer
  after each change ("Fits on one page" / "Over: N attacks, M skills … — untick something"), "Print card" enabled only
  when it fits.
- Tests: the reducer op; a card that fits renders one page inside the safe area; an overfull card is refused with the
  right overflow; the fit route.
