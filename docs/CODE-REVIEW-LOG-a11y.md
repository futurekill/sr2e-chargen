# Code Review Log: the accessibility pass (1.0.0)
Codex gpt-6-sol. Plan: docs/PLAN-a11y.md (5 plan rounds).

## Round 1 (high)
1. **[P1] Account appearance saves lose keyboard focus.** Changing Theme or the readable-font checkbox sets `saving`, which [disables the focused control](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Account.svelte:56); neither handler restores focus. The scan tests save focus only on an NPC select. **Fix:** Keep these controls focusable during the request, guard repeated changes, and test both saves.

2. **[P1] Moving between documents can skip route focus.** When a user opens one document from another, [the previous `page.title` remains set](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/App.svelte:20). The route effect can run while the new document still shows “Loading…”, find no `h1`, and never retry after its data arrives. **Fix:** Clear the document title on ID change and move focus when the new heading renders.

3. **[P2] Renaming a document leaves the browser title stale.** [Document load sets `page.title` once](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Document.svelte:17), while Character, NPC, and Vehicle save their new names within their own components. Rename “Getaway” and its `h1` changes, but the tab title remains “Getaway” until navigation. **Fix:** Update the shared title from each successful rename or derive it from the current document name.

4. **[P2] Refused numeric edits are not tied to their fields.** Entering `0` for an NPC attribute reaches [a server refusal](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/npc.mjs:153), but [NPC shows only a page alert](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Npc.svelte:19); the input gets neither `aria-invalid` nor `aria-describedby`. This misses the plan’s field-error requirement. **Fix:** Track the refused control and connect its error message to that input.

5. **[P2] Several saves have no announced result.** NPC and Vehicle `send()` replace data without a success status; the Account appearance saves do likewise. A screen-reader user changing Professional Rating gets no programmatically identified confirmation, although the plan promises one. [WCAG’s status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) covers feedback presented without moving focus. **Fix:** Add a persistent `role="status"` that announces each confirmed save once.

6. **[P2] The route scan omits promised states.** [The page list](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:141) includes redeem but no `/reset`, and it never visits the trash or a signed-out transition. A broken reset form can therefore pass the reported “every page” scan. **Fix:** Add those routes and states with explicit assertions that their intended content rendered.

7. **[P2] Conditional-control coverage can pass without opening the controls.** The sedan’s [`dbw: true` flag](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:152) is never read, and no assertion checks the drive-by-wire split. The Resources purchase action has no expected choice fields and can click an unrelated “Buy” or “Add” button. **Fix:** Assert visible split inputs and a specific purchase panel with its choice controls before scanning.

8. **[P2] The keyboard gate does not test its stated traversal.** [Forward Tab is the only full walk](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:207); the other-theme check [stops at 60 controls](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:317). A Shift+Tab trap or an invisible focus indicator on control 61 can pass. **Fix:** Walk backward and check every tab stop at each required width and theme.

9. **[P2] The PDF tests can accept broken structure.** [Any marked-content ID counts as tagged](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/pdf-tags.test.mjs:32), even if absent from that page’s structure tree; `/Scope /Column` is checked only as a [whole-file regex](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/pdf-tags.test.mjs:63). An orphan MCID or a `TH` under the wrong row can pass. **Fix:** Match each page’s MCIDs to its tree and assert `Table → TR → TH` with scope on each header.

10. **[P2] CI can fail without the promised report.** If setup, Chrome launch, or a page check throws, [`main().catch` only logs the error](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:358); report writing is never reached, and [artifact upload ignores a missing file](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/.github/workflows/ci.yml:58). **Fix:** Write a failure report in the top-level error path and require the artifact file in CI.

VERDICT: REVISE
## Round 2 (medium, fix-only)
1. **[P1] A refused NPC edit can leave its field unmarked.** Entering `0` for an attribute starts a request that disables the input; [Npc.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Npc.svelte:21) calls `flagFocused()` only after the refusal, when focus may already be on the body. Vehicle has the same timing. **Fix:** Capture the initiating control before disabling it, then mark that control on refusal.

2. **[P1] The sync can close a branch it did not verify.** In [content-pr.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:82), `remoteHead` is read before the fetch. If another commit replaces the branch between those steps, the code can count the new head but check the old head’s bot status, then close the PR and delete the new branch. **Fix:** Verify the fetched head’s SHA and status together, then use a leased branch deletion.

3. **[P2] The Account focus fix has no save assertion.** The [scan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:387) checks only the NPC Professional Rating select; either Account appearance control could lose focus after saving while the scan passes. **Fix:** Save both Theme and readable font in the scan and assert focus and announcement after each.

4. **[P2] Conditional-control coverage still accepts incomplete panels.** The [scan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:175) finds an ActiveSoft row and checks generic “Qty” and “Rating” labels; it does not verify ActiveSoft’s skill choice or the three visible drive-by-wire split inputs. **Fix:** Assert the named purchase row’s choice controls and all three visible split inputs.

VERDICT: REVISE
## Round 3 (medium, fix-only)
1. **[P2] The readable-font save can fail the scan’s announcement check without announcing anything.** After Theme saves, its status text remains; if the checkbox stops saving or announcing, [the scan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:401) still accepts that old text. **Fix:** Clear or capture status before each change and assert a new message about that save.

2. **[P2] The ActiveSoft check accepts labels without controls.** If the Skill select is removed but its label remains, [the row check](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/a11y-scan.mjs:184) passes. **Fix:** Require an enabled input or select inside each of the Qty, Rating, and Skill labels.

3. **[P2] PR close failures are reported as success.** If `gh pr close` fails for a reason other than “already closed,” [the catch](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/tools/content-pr.mjs:97) suppresses it and logs that the PR closed. **Fix:** Ignore only an independently verified already-closed state; propagate other failures.

VERDICT: REVISE
## Round 4 (medium, fix-only)
1. **[P2] `saveKeepsFocus` can still accept an old status.** On an NPC with a positive Threat Rating, the page has an empty save status followed by a static Threat Rating status. Before the change, line 397 records `|Threat Rating …`; afterward, line 403 filters out the empty status and records `Threat Rating …`. Line 405 treats that difference as a new announcement even if the save announced nothing. **Fix:** Apply the same nonempty filtering before and after, then require a changed save status.

2. **[P2] The ActiveSoft check can count a disabled control.** A Skill select inside a disabled `fieldset` has no `disabled` attribute, so `select:not([disabled])` at line 187 counts it. **Fix:** Use `input:enabled, select:enabled`.

3. The PR close fix passes: a failed close is ignored only when `gh pr view` returns `CLOSED`; other failures propagate.

VERDICT: REVISE
## Round 5 (medium, fix-only)
VERDICT: APPROVED
## What changed in answer
- r1: Account saves keep focus and announce; document title cleared on mount and following renames; refused changes flag their control (aria-invalid + describedby); 'Saved.' status regions; scan adds /reset and a real sign-in (title, focus, announcement), specific purchase and DBW checks, a backward Tab walk, every tab stop in every theme at 1280 and 320, a report on crash (CI requires it); PDF test checks MCIDs per page tree, TH→TR→Table and every TH's scope.
- r2: the starting control is captured before busy disables it; the stale-PR close checks the fetched head and deletes with a leased push; Account Theme and font saves checked for focus and announcement; ActiveSoft Qty/Rating/Skill and the 3 DBW inputs asserted.
- r3: a NEW status message is required; labels count only with a control; a failed PR close is ignored only when the PR is verified closed.
- r4: same status filtering before and after; :enabled controls.

Harness bugs found and fixed while building (not app bugs): CSP blocked the test's style overrides (setBypassCSP); forced-colors emulation dropped reduced motion; 200% text checked at 320 px; hidden tabpanel inputs counted; Shift+Tab started from the first control; two fields with the same text; a select whose list loads on focus. App bugs the scan found: the NPC page crashed (structuredClone of Svelte state) and an imported character crashed on its Karma step.
