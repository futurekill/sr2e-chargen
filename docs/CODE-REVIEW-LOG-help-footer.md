# Code Review Log: help, footer and the Shadowland board (1.1.0)
Codex gpt-6-sol. Plan: docs/PLAN-help-footer.md (5 plan rounds, approved).

## Round 1 (high)
1. **Sign-out leaves the footer in signed-in mode.** Both sign-out paths in [App.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/App.svelte:58) clear `user` without calling `loadPrefs(null)`. If a user hides the board and signs out, the signed-out visitor inherits that setting; the footer can also keep showing content pins fetched during the session. **Fix:** Reload signed-out preferences on both paths and discard any in-flight content response after sign-out.

2. **Consecutive reloads can show the same banter thread.** In [shared/banter.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/banter.mjs:59), a selected key with one thread retains the avoided ID even when other context keys have alternatives. I reproduced two picks of `choice:priority.magic.A#0` despite passing the first ID as `avoid`. **Fix:** Exclude the previous thread across all eligible keys before choosing a replacement.

3. **Repeating an anchor link can fail to navigate.** The click handler in [router.svelte.js](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/lib/router.svelte.js:18) prevents the browser’s normal link behavior, while `go()` does nothing when the URL and reactive hash already match. After following `/help/garage#mounts` and scrolling away, clicking that link again does not return to the heading. **Fix:** Scroll and focus the target for a repeated anchor click.

4. **Help gives unsafe save advice.** [sections.js](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/help/sections.js:21) says every change saves itself and closing a tab loses nothing, but drafts require **Save** and Workshop design edits require **Save design**. A user following that advice can lose edits. **Fix:** State those manual-save exceptions in Getting started.

VERDICT: REVISE
Fixed: sign-out resets prefs to the device's and the footer drops a late content answer; pickThread avoids the last thread across all keys (tested); a repeated anchor link goes back to its target; Getting started names the two manual saves (drafts, Workshop designs).

## Round 2 (medium, fix-only)
No remaining findings in the four Round 1 fixes. Both sign-out paths reset preferences, late footer content is discarded, banter avoids the prior thread when another is available, repeated anchor clicks refocus and scroll, and Getting started names both manual saves.

The focused banter and help tests passed (8/8). No files were modified.

VERDICT: APPROVED
Also found while building (not by Codex): a Rigger 2 design showed "unsaved changes" on open (a select filled an empty field; now a canonical compare); the NPC preview showed raw attribute keys; my first banter conversion script never wrote the converted entries (caught by the tests). User change after the plan: the repository is private, so What's new is an in-app page from CHANGELOG.md and Report a problem points to a help part.
