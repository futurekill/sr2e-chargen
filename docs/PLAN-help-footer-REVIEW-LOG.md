# Plan Review Log: help and footer
Started 2026-11-27. Codex gpt-6-sol.

## Round 1 — Codex
1. **Banter is in the wrong place.** The draft puts it on every page, while [U11](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN.md:28) requires it in the builder only. **Fix:** Keep the site footer everywhere, but show the board only in the character builder unless U11 is explicitly changed.

2. **Help step links will lose their anchors.** The [router](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/lib/router.svelte.js:17) drops fragments on intercepted links and wipes every fragment on initial load, including the plan’s `/help/section#step` links. **Fix:** Preserve ordinary anchors in navigation and wipe only `#k=` secrets.

3. **The footer cannot infer its promised context from the route.** [App.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/App.svelte:16) sees `/doc/<uuid>`, while document kind, vehicle design status, and the character’s open tab live in child components. **Fix:** Pass an explicit, reactive document and step context to the board.

4. **The existing banter data has lines, not threads.** Keys such as `choice:essence.low` contain one entry in [choices.json](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/banter/choices.json:28), so selecting a 2–4 line thread from the first matching key cannot work as specified. **Fix:** Define thread groups and validate the line count for every selectable group.

5. **The two banter controls will diverge.** [App.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/App.svelte:39) retains the preferences returned at sign-in; [Account.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Account.svelte:17) saves changes without updating that state. **Fix:** Put `banter` in shared reactive preference state and update it after either control saves.

6. **`/api/about` exposes more than the plan acknowledges.** Publicly returning exact installed module names and versions conflicts with the catalog’s signed-in boundary in [catalog.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/catalog.mjs:1) and reveals the node’s content inventory. **Fix:** Expose only the app version publicly; require a session for the content pin list.

7. **The proposed markup proof is too narrow.** Testing that `<script>` remains text does not verify link destinations or attribute escaping in a custom help parser; banter also needs text-only rendering. **Fix:** Render text through Svelte escaping and allow only validated internal help links, with tests for encoded and malformed inputs.

8. **Hidden, unrevealed lines are absent from the accessibility tree.** A screen-reader user who reaches the footer mid-sequence encounters a partial thread with no announcement that more appeared; citing [WCAG 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) does not resolve that reading problem. **Fix:** Keep a complete static accessible copy and treat the timed reveal as visual decoration.

9. **The planned accessibility scan cannot prove the animation works.** [a11y-scan.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:321) always requests reduced motion, and its motion listener records CSS events, not timed DOM reveals; it will miss Pause, Hide, and normal-motion failures under [WCAG 2.2.2](https://www.w3.org/TR/WCAG22/#pause-stop-hide). **Fix:** Add a normal-motion timed test that pauses and hides the board, plus a reduced-motion test that checks all lines appear immediately.

10. **The footer links lack their stated source.** [package.json](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/package.json:1) has no `repository` field, so the planned “What’s new” and “Report a problem” URLs cannot be derived. **Fix:** Add and validate repository metadata, with a releases-list fallback when the version has no release page.

11. **Screenshot existence will not catch stale guidance.** The [plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-help-footer.md:93) concedes this, and the fixture’s random board makes captures unstable. **Fix:** Use screenshots only where they clarify a task, disable banter during capture, and require visual review when affected pages change.

VERDICT: REVISE
### Claude's response
Declined #1: the user asked 2026-11-27 for banter in the site footer on every page; U11 amended in PLAN.md. Accepted the other 10: router keeps ordinary anchors and wipes only #k=; explicit board context store set by pages; banter v2 = threads (1–4 lines) with a lossless conversion; one shared prefs store; /api/about public = app version only, content pins behind a session; token renderer (no {@html}) with internal-only links and hostile-input tests; a complete static accessible copy + aria-hidden animation; normal-motion scan checks for Pause/Hide and reduced-motion all-at-once; package.json repository + releases-list link; screenshots only where useful, banter off during capture, visual review in QA.

## Round 2 — Codex
1. **Help misses a document type.** A draft has editing, JSON download, history, and restore controls in [Document.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Document.svelte:68), but the plan gives drafts no help section or context-link destination. **Fix:** Cover draft documents in the help data and map their “How this works” link to it.

2. **Some character help links would have no target.** The plan sends every character tab to `building-a-character#…`, while the finished character has Karma, Nuyen, and Condition tabs whose guidance belongs to “After creation.” **Fix:** Define and test a tab-to-section-and-anchor map, including finished-character tabs.

3. **“Changes on every load” is not guaranteed.** Randomly choosing among three page threads can select the same thread on consecutive reloads. **Fix:** Remember the last thread per context and exclude it when another is available.

4. **The thread rules permit a one-line board.** Converting each existing key’s lines into one thread leaves keys such as `choice:essence.low` with a single line, despite the plan’s promised 2–4-line reveal. **Fix:** Require at least two lines for selectable threads and add companion lines during conversion.

VERDICT: REVISE
### Claude's response
All 4 accepted: a Drafts section; one helpFor() map incl. finished-character tabs, tested; the last thread per context excluded next time; threads of 2–4 lines, one-line keys get reply lines.

## Round 3 — Codex
1. **Thread length is still contradictory.** The data rule says 2–4 lines, but the proposed unit test accepts 1–4; a one-line `choice:essence.low` thread would pass and break the promised reveal. **Fix:** Require 2–4 lines in both the schema and test.

2. **Signed-out pages lack contextual Help links.** The plan promises “How this works” on each page, but `helpFor` omits sign-in, invite redemption, and password reset. **Fix:** Map those pages to Getting started and include them in the page-link test.

3. **The repository value is not a web URL.** `github:futurekill/sr2e-chargen` cannot be used directly as the Help parser’s allowed URL or the footer’s Releases and Issues links. **Fix:** Store an HTTPS repository URL and test the rendered destinations.

VERDICT: REVISE
### Claude's response
All 3 accepted: 2–4 lines in data and test; sign-in/invite/reset map to getting-started; an HTTPS repository URL, links tested.

## Round 4 — Codex (delta)
The thread data rule still says “each thread 1–4 lines,” while the next sentence and the proposed test require 2–4. The sign-in, invite, and reset mapping and the planned HTTPS repository URL with Releases and Issues link tests address the other two requests.

VERDICT: REVISE
### Claude's response
Fixed the leftover "1–4" wording to 2–4. Round 5 = checkpoint with the user.

## Round 5 — Codex (whole plan, user's request)
VERDICT: APPROVED