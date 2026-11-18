# Code review log: the printable sheet (milestone 3, slice 1)
Codex gpt-6-sol, read-only. Round 1 high; round 2 fix-only, medium. Reviewed 14baa32 (derive) and d395a8f (sheet).

## Round 1 — Codex
**Findings**

- **P1 — [server/sheet/render.mjs:197](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:197):** The footer never wraps or shrinks. A 120-character name of `W`s produces an A4 footer ending at x=857, beyond the safe right edge of x=559. **Fix:** Measure the complete footer and wrap, shrink, or truncate it within the safe width.

- **P1 — [server/sheet/model.mjs:65](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:65):** Notes are silently cut at 20,000 characters although the document schema accepts 100,000; a 20,001-character note loses its last character before the fit test sees it. The title has the same problem at [line 32](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/model.mjs:32), cutting an accepted 200-character name to 120. **Fix:** Preserve accepted text and paginate it, or reject excess text explicitly.

- **P1 — [server/sheet/render.mjs:173](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:173):** A single cyberware row with 300 module names throws `Cyberware: a row is taller than a page`; unfinished characters can hold up to 500 items, so this is a printable draft that cannot export. **Fix:** Split an oversized cell across continuation rows or pages.

- **P1 — [shared/derive.mjs:37](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/derive.mjs:37):** For an unfinished human with Body base 12, `derive` prints Body 12 while Foundry clamps the creation rating to the racial maximum of 6. **Fix:** Apply Foundry’s creation `naturalAttribute` clamp before adding item modifiers, and add that draft to parity coverage.

- **P2 — [server/sheet/index.mjs:18](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/index.mjs:18):** The queue releases a job on the child’s message or timeout, before `exit`; after a timeout, the next render can start while the killed child is still alive. **Fix:** Reap the child before releasing the queue slot, including after `SIGKILL`.

- **P2 — [server/sheet/index.mjs:34](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/index.mjs:34):** `waiting` includes the active render, so the promised four waiting jobs become only three; the fifth total request gets `busy`. **Fix:** Track active and queued jobs separately.

- **P2 — [server/routes/documents.mjs:42](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:42):** The route has a per-user rate limit but no server-wide rate limit required by draft 2; requests across many accounts can keep the renderer occupied continuously. **Fix:** Add a shared rate limit alongside the user key.

- **P2 — [server/sheet/render.mjs:20](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:20):** Draft 3 requires Source Sans 3 Condensed for standard labels, but both label and body use Source Sans 3. **Fix:** Bundle and select the condensed face for standard labels.

- **P2 — [client/src/pages/Character.svelte:106](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:106):** Draft 3 requires a server-stored readable-font site setting used as the sheet default; the client stores only a browser-local sheet choice and the route defaults to `standard`. **Fix:** Add the site preference and use it when no sheet font is requested.

The font packages are production dependencies copied into the Docker image. The sheet route uses the owned-document lookup, and its disposition filename is built from a validated UUID.

VERDICT: REVISE
### Response
Accepted 1–7 and fixed. #8 (condensed label face) and #9 (server-stored font setting): plan changed / deferred, recorded in docs/PLAN-sheet.md 'As built'.

## Round 2 — Codex
- [server/sheet/index.mjs:29](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/index.mjs:29): If the worker fails to spawn, Node emits `error` and `close` but no `exit`; the render and every queued render then hang. **Fix:** settle on `close`, which also waits until an exited child’s streams have closed.
- [server/sheet/index.mjs:21](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/index.mjs:21): If a worker sends a PDF but remains alive past 20 seconds, the timeout kills it yet the retained PDF is returned as success. **Fix:** make timeout override any earlier outcome.
- [test/sheet.test.mjs:50](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/sheet.test.mjs:50): The in-pieces check accepts `aXbYc` as complete placement of `abc`, so it can miss dropped text. **Fix:** compare each split cell’s concatenated runs with its full source text exactly.

The focused sheet and derive tests pass; these cases remain untested.

VERDICT: REVISE
### Response
All three accepted: the queue settles on 'close' (also when the worker never spawned); a timeout overrides an earlier answer; the fit test checks every table cell's runs exactly against its text (split cells included). Not re-reviewed.

# Slice 2 (readable font everywhere, Markdown stat block)

## Round 1 — Codex gpt-6-sol high
- **P1 — The sheet UI overrides the per-user default.** [Character.svelte:108](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:108): Open a character while the preference is off, then enable readable font in Account. The saved `sheet.font=standard` keeps the Print sheet link on standard because it always sends `font=`. **Fix:** Omit `font` until the user explicitly selects a sheet override.

- **P2 — PostgreSQL migration can inspect the wrong `users` table.** [002-user-prefs.mjs:6](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/db/migrations/002-user-prefs.mjs:6): With an accessible `aaa.users` that has `prefs` and the app’s `public.users` without it, `getTables().find()` picks `aaa.users`, skips the ALTER, and records the migration. **Fix:** Resolve the schema of the unqualified `users` table and inspect that table specifically.

- **P2 — Bare URLs can become links in the stat block.** [markdown.mjs:5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/markdown.mjs:5): A note containing `https://evil.example` remains unescaped and becomes a link in GFM renderers, contrary to the plan’s “no links” rule. **Fix:** Neutralize bare URL and email autolinks as well as bracket links.

- **P2 — A failed preference save leaves the displayed font wrong.** [Account.svelte:8](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Account.svelte:8): If the PUT fails, the checkbox, page font, and local storage show the new value while the server retains the old one. **Fix:** Apply the value after a successful PUT, or restore the server value on failure.

- **P2 — Rapid toggles can save the opposite of the visible choice.** [Account.svelte:10](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Account.svelte:10): Toggle on then off quickly; if the first PUT finishes last, the server stores `true` while the page shows off. **Fix:** Serialize preference writes or disable the checkbox while a save is pending.

- **P2 — The prefs GET response misses the documented shape.** [auth.mjs:40](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/auth.mjs:40): `GET /api/account/prefs` returns `{ "prefs": { "readableFont": false } }`; Slice 2 specifies `{ "readableFont": false }`. **Fix:** Return `req.session.user.prefs` directly.

- **P2 — Several stat block sections are not tables.** [markdown.mjs:17](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/markdown.mjs:17): Any character’s Armor and Condition monitors sections render as prose, although Slice 2 requires every section as a Markdown table. **Fix:** Render those sections, and Notes, through `tableOf`.

VERDICT: REVISE
### Response
All seven accepted and fixed.

## Round 2 — Codex gpt-6-sol medium, fix-only
1. [Character.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:109) — **Incomplete.** A returning user whose old `sheet.font` value is `standard` keeps overriding an account preference set to readable. **Fix:** Migrate the old stored default to `""`, while preserving an explicitly chosen override.

2. [002-user-prefs.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/db/migrations/002-user-prefs.mjs:10) — **Incomplete.** With `search_path=tenant,public`, `current_schema()` can be `tenant` while `ALTER TABLE users` resolves to `public.users`; an existing `prefs` column is missed and the migration fails trying to add it again. **Fix:** Check the columns of the relation resolved by `users`, rather than filtering by `current_schema()`.

3. [markdown.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/markdown.mjs:8) — **New defect.** A note containing `https://x.test/a|b` exports as `https://x.test/a¦b`, changing the URL and losing a model character. **Fix:** Preserve the pipe in the code span while escaping it for the table parser.

4. [Account.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Account.svelte:12) — **Incomplete.** If the server commits the preference but the response is lost, the checkbox reverts although the saved preference changed. **Fix:** On an ambiguous request failure, fetch the saved preference before restoring the displayed value.

5. [Account.svelte](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Account.svelte:33) — **Fixed.** A second toggle during a pending save is disabled. **Fix:** No further change needed.

6. [auth.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/auth.mjs:40) — **Fixed.** After saving `readableFont: true`, GET returns `{ readableFont: true }` directly. **Fix:** No further change needed.

7. [markdown.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/markdown.mjs:26) — **Fixed.** Armor, condition monitors, and nonempty notes now render as tables. **Fix:** No further change needed.

The focused tests passed 67 of 68; one migration concurrency test could not create its temporary directory under the read-only sandbox (`EPERM`).

VERDICT: REVISE
### Response
Accepted 1–4: the sheet's font choice under a new storage key; Postgres checks to_regclass('users'); a pipe in a URL is escaped (\|), not replaced; a failed save re-reads the server's value. Not re-reviewed; Postgres/MySQL/MariaDB run the migration in CI.
