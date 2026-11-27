# Plan Review Log: the accessibility pass
Started 2026-11-27. Codex gpt-6-sol, fresh session per round.

## Round 1 — Codex
1. **Target size will not be gated.** Axe’s `target-size` rule is [disabled by default](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md); adding `wcag22aa` to the tag list does not prove it ran. The list also omits `wcag22a`.
   Fix: Enable `target-size` explicitly, include `wcag22a`, and assert that the rule ran.

2. **Zero violations is not a full pass.** Axe reports uncertain checks under [`incomplete`](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md), and the plan scans pages without opening many controls or causing errors.
   Fix: Review incomplete results and scan the important open, error, loading, and saved states.

3. **The keyboard check cannot use “elements axe lists as focusable.”** Axe results are rule results, not a complete focus list. DOM order is also the wrong expectation for the Character tabs’ arrow-key pattern.
   Fix: Traverse focus in the browser and test Tab, arrows, Home, and End against each control’s intended behavior.

4. **A computed outline does not prove visible focus.** It can be clipped, covered, or lack contrast; WCAG 2.2 AA also requires [focus not to be entirely obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum).
   Fix: Check the focused control on screen, including its indicator and contrast, at narrow widths.

5. **`scrollWidth` misses clipped content.** The sign-in plate uses `overflow: hidden`, and the plan has no text-spacing test for WCAG 1.4.12.
   Fix: Check clipped elements and apply the required text-spacing overrides, as well as testing zoom.

6. **The motion test runs too late.** `getAnimations()` can be empty after an animation finishes even when it played on load; it also misses motion after interaction. Emulated forced colors cannot establish the Windows high-contrast result.
   Fix: Observe load and interaction motion, then include Windows high contrast in the manual pass.

7. **Route focus can race the page.** `Document.svelte` loads its heading asynchronously. Sign-in can replace the page at `/` without a route change.
   Fix: Move focus after the destination heading renders, including authentication changes at the same URL.

8. **The web table audit misses existing markup.** The Design Points table in `VehicleDesign.svelte` has no header cells; the NPC preview’s first column is data rather than row headers. Axe’s zero-violation gate cannot stand in for a table review.
   Fix: Give data tables meaningful column and row headers and check them with a screen reader.

9. **The PDF plan invents header rows.** `render.mjs` receives arrays of data cells, so it cannot tag “each grid with its `TH` row” as written.
   Fix: Add real column labels to the model, or use a more suitable structure for key/value sections.

10. **The PDF wound boxes are information.** Crossed boxes show Physical and Stun damage, while the printed text gives only the overflow count. Marking every box as decoration loses that state.
    Fix: Add readable damage counts to the PDF structure before treating the box drawings as artifacts.

11. **The PDF proof is incomplete.** `getStructTree()` exposes tagged content, so it cannot alone find untagged text. The proposed “every text item inside a structure element” assertion also conflicts with page-number footers, which should be pagination artifacts. PDFKit calls for natural drawing order as well as structure order. [PDFKit guidance](https://pdfkit.org/docs/accessibility.html)
    Fix: Mark footers as artifacts, compare all extracted text with marked content, and read a sample PDF in order.

12. **A fresh CI job needs generated inputs.** The real app serves `dist/client`, and the real catalog is generated; neither is available from checkout alone.
    Fix: Build the client and catalog before the scan, then upload the report even when the scan fails.

13. **The harness needs explicit secret boundaries.** It runs a real admin session on an HTTP listener and stores raw scan results that can include URLs and HTML.
    Fix: Bind only to `127.0.0.1`, use disposable credentials, redact reports, and close the app and temp database.

14. **The landing image instruction contradicts the markup.** The plate is `aria-hidden="true"` with `alt=""`; changing its alt text alone will not make the description available.
    Fix: Keep it decorative, or remove `aria-hidden` if the scene conveys needed information.

15. **Completion is ahead of evidence.** The plan marks roadmap item 9 done while the VoiceOver and NVDA results are still for the maintainer to run.
    Fix: Record both manual results and resolve their findings before marking the audit complete.

VERDICT: REVISE
### Claude's response
All 15 accepted: target-size enabled + wcag22a + asserted; incomplete results reviewed and recorded, states scanned; keyboard traversal computed in-page + tablist keys; focus visible/not obscured by rect, elementFromPoint and indicator contrast; clipping and 1.4.12 text spacing; motion counted by events from first paint and through interactions, Windows HC in the manual pass; route focus after the heading renders incl. sign-in at the same URL; table headers (Design Points, NPC preview); PDF column labels added to the model, key/value as row-header tables; monitors as Figures with alt text; footers as artifacts, untagged-text check via marked content; CI builds client+catalog and uploads the report always; 127.0.0.1, in-memory credentials, redacted report; landing plate stays decorative; item 9 done only after the manual pass.

## Round 2 — Codex
1. **Conditional controls can escape the audit.** The seed includes one designed vehicle, but [VehicleDesign.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/VehicleDesign.svelte:132) shows different controls for ground vehicles, boats, and aircraft. Scanning one design and opening its `<details>` will miss those branches. **Fix:** Drive representative chassis and power-plant choices through every conditional control group in the automated and manual passes.

2. **The focus check will mishandle two keyboard-accessible file inputs.** [Library.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Library.svelte:95) and [Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:628) place a visually hidden input inside a styled label; the visible focus outline belongs to the label. The [planned rectangle and indicator check](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-a11y.md:41) would either exclude the focusable input or fail its legitimate focus treatment. **Fix:** Include hidden but keyboard-focusable inputs in traversal and evaluate their associated label’s visible focus indicator.

3. **Save-on-change focus is untested.** Changing the NPC’s Professional Rating select calls `send`, which immediately disables that same select in [Npc.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Npc.svelte:102). The planned post-save axe scan does not establish where keyboard focus lands or whether the next Tab remains logical under [WCAG 2.4.3](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html). **Fix:** Test focus before, during, and after a keyboard-triggered save, and preserve or restore it when the control is disabled.

4. **The PDF proof leaves the table card and header association uncertain.** [The plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-a11y.md:104) specifies one sample *sheet* reading-order comparison and checks for `TH` cells, but [render.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:324) has a separate one-page card path; a `TH` alone does not prove its promised row or column scope. **Fix:** Assert tagged reading order and header scope for a sheet in each layout and for a table card, then include the card in the screen-reader pass.

VERDICT: REVISE
### Claude's response
All 4 accepted: seed every vehicle-design branch (ground, boat, aircraft), NPC magic, each creation method; hidden file inputs traversed with the label's indicator; save-on-change keeps focus (aria-disabled + busy guard instead of disabled) and is tested; PDF reading order and TH scope for each sheet style and the table card.

## Round 3 — Codex
1. **The vehicle fixtures still miss conditional controls.** A BOAT design can be a skiff or use a sail plant, hiding Hydrofoil; an AIRCRAFT design need not be fixed wing, hiding Takeoff ([VehicleDesign.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/VehicleDesign.svelte:143)). **Fix:** Specify fixtures for each actual chassis and power plant condition, then assert that each control appeared in a scan.

2. **The state scan misses controls opened without `<details>`.** Opening a Catalog entry reveals its detail panel; starting a Character purchase reveals choice fields and Buy/Cancel controls. Neither action is in the planned scan sequence ([Catalog.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Catalog.svelte:90), [Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:469)). **Fix:** Activate and scan custom disclosures and purchase panels, with assertions that their controls rendered.

VERDICT: REVISE
### Claude's response
Both accepted: design fixtures per conditional control with an asserted control list; every collapsed disclosure (details, aria-expanded=false) and a purchase panel activated and scanned, with assertions.

## Round 4 — Codex (delta)
The disclosure and purchase-panel addition is complete enough to implement.

The VehicleDesign addition still needs explicit fixtures for controls triggered by choices beyond chassis and power plant. In [VehicleDesign.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/VehicleDesign.svelte:146), **Occupants** appears only after selecting living amenities; the **drive-by-wire split** appears only after installing that modification. [The plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-a11y.md:38) names neither setup nor those controls in its asserted label list. Add both so an implementation cannot pass while missing them.

VERDICT: REVISE
### Claude's response
Accepted: fixtures with living amenities (Occupants) and drive-by-wire (its split), both in the asserted list. Round 5 = checkpoint with the user.

## Round 5 — Codex (whole plan, user's request)
1. **The keyboard gate would fail valid radio groups.** In Character → Priorities, every radio has `tabIndex ≥ 0`, but Tab visits the selected radio in each group, not every option. [Radio group keyboard behavior](https://www.w3.org/WAI/ARIA/apg/patterns/radio/). **Fix:** Count each radio group as one Tab stop and test its options with arrow keys.

2. **Conditional controls outside VehicleDesign can escape the scan.** The named fixtures do not require Character’s shamanic Totem and item-specific choice fields, Library’s vehicle and NPC creation fields, or NPC’s experience preview table to appear; inaccessible markup there could pass. **Fix:** Exercise these conditional states and assert each control and table appeared in a scan.

3. **A page-title regression would pass axe.** The existing `<title>Hoi, chummer!</title>` is nonempty, so axe can pass even if Catalog, Account, and document pages never receive descriptive titles, missing [WCAG 2.4.2](https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html). **Fix:** Assert the expected title after every route and authentication transition, including asynchronous document loads.

VERDICT: REVISE
### Claude's response
All 3 accepted: radio groups as one Tab stop + arrow keys; the asserted control list covers Character totem/choice fields, Library selects, NPC preview table; titles asserted after every route and auth change. Five rounds done; the build follows (the user asked for round 5 rather than building after round 4).
