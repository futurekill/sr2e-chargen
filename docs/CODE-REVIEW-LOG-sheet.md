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

# Slice 3 (Fohawk style and ink-saver)

## Round 1 — Codex gpt-6-sol high
- [server/sheet/render.mjs:226](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:226): The Fohawk header and fixed page 1 sections have no page break. With a 2,000-character totem value, stat text extends below Letter’s safe margin. **Fix:** measure the whole fixed section and move overflowing content to a continuation page.
- [server/sheet/render.mjs:233](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:233): A 20-digit attribute value with `nat 8` wraps at the font floor and overlaps the natural-value label. **Fix:** enforce the one-line limit or grow the attribute row from its measured height.
- [server/sheet/render.mjs:243](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:243): On Hexen’s two-row stat strip, an initiative value of `12345678901234567890 + 2D6` wraps into the next row’s label area. **Fix:** size each stat row from its measured contents before placing the next row.
- [server/sheet/render.mjs:218](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:218): The 9.5 pt magenta subtitle on the black header has only about 3.36:1 contrast; it becomes hard to read in black and white. **Fix:** use light text on the filled band and keep magenta on the white ink-saver background.
- [test/sheet.test.mjs:58](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/sheet.test.mjs:58): The fit assertions see text runs but not bands or pencil boxes. For example, 14 monitor boxes produce a negative gap and overlapping boxes without a shape assertion failing. **Fix:** record shape bounds and assert their margins and non-overlap.

All 123 existing sheet tests pass. I found no Classic regression or white-on-white ink-saver text in the reviewed paths.

VERDICT: REVISE
### Response
All five accepted and fixed.

## Round 2 — Codex gpt-6-sol medium, fix-only
1. **Header fit — [render.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:259):** Still fails. With `subtitle = "X ".repeat(1300)`, rendering succeeds but a page-1 band reaches y=757.55, past the 756 pt safe boundary. **Fix:** Check the measured height of every fixed section before drawing it, including the monitor and attack sections.

2. **Attribute value and `nat` label — [render.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:239):** The prior 20-digit value case is handled: the label follows the measured value height. **Fix:** None needed.

3. **Two-row stat strip — [render.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:248):** The prior long Initiative value case is handled: each row advances by its measured height. **Fix:** None needed.

4. **Subtitle contrast — [render.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:224):** The subtitle is now light on the filled black band. **Fix:** None needed.

5. **Shapes and monitor boxes — [sheet.test.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/test/sheet.test.mjs:63):** The 14-box layout wraps without box-to-box overlap, but the fit test misses the failing 1300-repeat case; with 1500 repeats, ten boxes extend to y=768.13. **Fix:** Add a near-limit header fixture and assert that bands and boxes fit alongside the text they can overlap.

VERDICT: REVISE
### Response
Accepted #1 and #5: the whole fixed part (header, rows, monitors, the attacks bar and one row) is measured before drawing, else a clear 'use Classic' error; a near-limit test sweeps header lengths on both papers and checks text, bands and boxes stay in the safe area. Not re-reviewed.

# Slice 4 (the one-page table card)

## Round 1 — Codex gpt-6-sol high
1. **[P1] A print choice can change a finished character.** [shared/creation.mjs:214](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:214) — On a finished character, I changed a recorded skill’s actor rating from 1 to 9; `setCard` rebuilt the items and reset it to 1. **Fix:** Return after updating `creation.card`, without running record hydration or `rebuildItems`.

2. **[P1] A card can report a fit while text leaves the page.** [server/sheet/render.mjs:208](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:208) — A legacy/imported body with a 4,000-character name and no chosen rows returns a one-page Classic card with 25 non-footer text runs below the safe margin; the card check only examines flowing rows. **Fix:** Measure the fixed header and blocks against `BOTTOM` and refuse the card with a structured overflow result.

3. **[P2] `setCard` accepts rows the card cannot display.** [shared/creation.mjs:198](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:198) — A 16-character ID on a knowledge skill is accepted, stored, then omitted by `cardIds`; an item whose type is `constructor` is also accepted through `in`. **Fix:** Use one eligibility predicate for `setCard` and `cardIds`, with `Object.hasOwn(CARD_TYPES, type)` and the active-skill check.

4. **[P2] Adding a record can erase a foreign item.** [shared/creation.mjs:285](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:285) — An imported pistol with ID `cg00000000000001` disappears when the first custom skill gets that same generated ID; the foreign-item filter treats the pistol as recorded. **Fix:** Allocate new IDs only after checking both record keys and existing actor item IDs.

5. **[P2] The client offers an outdated fit result.** [client/src/pages/Character.svelte:118](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:118) — After ticking a row that makes the card overfull, the previous “Fits” result and Print link remain active through the debounce and render; the PDF route then returns 422. **Fix:** Clear `fit` immediately on edits and option changes, and enable Print only for the saved revision and matching query.

6. **[P2] Routine fit checks exhaust print capacity.** [server/routes/documents.mjs:64](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:64) — Twenty-one checkbox changes spaced a second apart trigger 21 full PDF renders: the last fit request hits the per-user limit, while fit jobs also consume the server-wide 30-render budget and shared queue. **Fix:** Cache or coalesce fits by revision and print options, and reserve PDF render capacity separately.

VERDICT: REVISE
### Response
All six accepted and fixed.

## Round 2 — Codex gpt-6-sol medium, fix-only
1. **Finished character** — [shared/creation.mjs:101](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:101): No failing case found; `setCard` returns before rebuilding items. Fix: none.
2. **Page 1 bounds** — [server/sheet/render.mjs:287](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/sheet/render.mjs:287): No failing case found; overflowing fixed content is refused. Fix: none.
3. **Eligibility** — [client/src/pages/Character.svelte:115](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:115): An imported skill without `system` makes the card UI throw while `cardIds` safely excludes it; the UI still duplicates the rule. Fix: filter card rows with `cardEligible(i)`.
4. **Record IDs** — [shared/creation.mjs:238](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:238): No failing case found; existing actor and record IDs are checked. Fix: none.
5. **Client fit state** — [client/src/pages/Character.svelte:118](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/client/src/pages/Character.svelte:118): No failing case found; body changes clear the answer, and Print requires the saved revision and matching options. Fix: none.
6. **Fit cache and limit** — [server/routes/documents.mjs:66](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/server/routes/documents.mjs:66): No failing case found; the key includes revision and effective options, with a separate per-user limit. Fix: none.

The focused tests passed: 143/143.

VERDICT: REVISE
### Response
Accepted #3: the page filters with the shared cardEligible. The rest confirmed fixed.
