# Code review log: archive (2026-11-19)

## Round 1 (Codex gpt-6-sol, high): 6 findings
1. A backup made before migration 004 failed verification and restore. **Fixed**: a backup whose migrations are a
   prefix of this build's verifies; the server migrates it at start (test in backup.test.mjs).
2. The check trusts the 004 migration row without checking the column. **Declined**: the row is written in the same
   run that adds the column; nothing else writes it.
3. An edit's answer racing the Archive toggle could show the old state. **Fixed**: the Character page keeps its own
   `archivedAt`; the button is disabled while saving.
4. Overlapping Library refreshes could land out of order. **Fixed**: only the newest refresh lands.
5. Offset paging can skip a row edited between pages. **Declined**: pre-existing for every list; one user, at most 200
   documents; the next refresh is right.
6. An archive error was cleared by the reload. **Fixed**: the error is set after the reload.

## Round 2 (medium, fix-only): 1 finding
- A failed archive's error can show after a later success's refresh. **Declined**: the action did fail; the message is
  true, and the lists are current.
