# Plan: in-app help and the site footer (with the Shadowland board)
_Built as 1.1.0 (2026-11-27). Round 3 — revised after Codex r1–r3 (docs/PLAN-help-footer-REVIEW-LOG.md), 2026-11-27._ User (2026-11-27): "the site also needs documentation on how to use
all the features"; "a footer on the site that has version info, banter (that changes on reload — perhaps even animated
banter like a conversation on a live chatboard — perhaps even context aware), and other pertinent info". Both in one
plan, after the accessibility pass, so its scan covers them (docs/PLAN-a11y.md, Out of scope).

## Goal
1. **Help** inside the app: how to use every feature, with screenshots, reachable from every page (a Help link in the
   header and a "How this works" link on each page to its own section), readable signed out too.
2. **A footer** on every page: the app version and the content it runs (the system and module versions), links (Help,
   Accessibility, What's new, Report a problem), a short unofficial-fan-project notice — and **the Shadowland board**:
   a few lines of in-character banter that change on every load, appear one by one like a live BBS thread, and fit
   where you are (the page, the Character step, the metatype, choices made). This finally ships PLAN.md U11 (banter,
   "a must"), whose data (`banter/*.json`, 32 original lines) was written but never shown.

## Approach

### 1. Help
- **Route `/help` and `/help/<section>`**, with ordinary `#step` anchors inside a section. The router changes for this
  (r1 #2): at load it wipes ONLY a `#k=` secret fragment (any other fragment stays and is scrolled to), and an
  intercepted same-origin link keeps its fragment (`go(path, { hash })` → `history` gets path+hash, then the target is
  focused/scrolled after render). A test covers: `#k=…` wiped and kept in memory, `#steps` kept, a link to
  `/help/garage#mounts` lands on that heading. Open to everyone (sign-in, invites and resets need help too). Title "Help · Hoi, chummer!" /
  "<Section> · Help · …".
- **Content as data:** `client/src/help/sections.js` — an ordered list of sections `{ id, title, intro, steps[],
  notes[], shots[] }` in plain strings. Inline markup is only `**bold**` and `[text](/path)`: a parser turns a string
  into TOKENS (`{ text }`, `{ bold }`, `{ link, href }`) that Svelte renders with its normal escaping — never `{@html}`
  (r1 #7). A link is allowed only to an internal path (`^/[a-z0-9/-]*(#[a-z0-9-]+)?$`) or to the repository URL from
  package.json; anything else renders as plain text. Tests: `<script>`, `"` and `&` stay text, `javascript:`,
  `//evil`, `/x" onclick=…`, unbalanced `**` and `[a](` render as text; the same token renderer is used for banter.
- **Sections** (each: what it is for, step-by-step, the rules and page references it follows, what it can't do):
  Getting started (invite, sign in, the library) · Building a character (the steps; the Rules check; book toggles and
  creation methods) · Portraits · After creation (Karma, nuyen, buying and selling, damage and healing, ammo, history
  and undo) · Printing (sheet styles, paper, fonts, the table card, the Markdown stat block) · Foundry (export a
  character, import a Foundry character, vehicles and NPCs) · The garage (catalog vehicles, mounts, cargo; linking and
  buying) · The Workshop (Rigger 2 design, modifications, weapons on mounts) · NPCs (book NPCs, experience, Threat and
  Professional Ratings) · Drafts (notes: editing, history and restoring a revision, the JSON download; r2 #1) · The catalog · Your account (themes, the easy-to-read font, banter on/off, password, sessions)
  · Accessibility (what works, how to report) · For admins (invites, roles, the sale mode, the CLI, backups).
  The README's user sections stay; they point to the in-app help as the full guide.
- **Context links:** each page's heading area gets "How this works" → its section. ONE map, `helpFor(context)` in
  `client/src/help/sections.js` (r2 #2): Library → getting-started; a draft → drafts; each creation step →
  building-a-character#<step>; the finished character's Karma, Nuyen and Condition tabs → after-creation#karma /
  #nuyen / #condition; the Print step → printing; Vehicle → garage; a designed vehicle → workshop; NPC → npcs;
  Catalog, Account, Admin → theirs; sign-in, invite and reset → getting-started (r3 #2). A test walks every tab id and page and asserts the section and its anchor exist.
- **Screenshots, only where a picture explains a task** (r1 #11; about 8: the steps tabs, the Rules check, a purchase,
  the Print step, the Workshop summary, mounts, the NPC experience preview, the Account page): `tools/help-shots.mjs`
  reuses the scan's app fixture (`tools/app-fixture.mjs`, split out of tools/a11y-scan.mjs: the same seeded app on
  127.0.0.1, in-memory credentials), with the board OFF (the banter preference) so captures are stable, captures
  named regions at 1280 px in the Cyberpunk theme, writes WebP (sharp, already a dependency) to
  `client/public/help/`, committed. Each shot has alt text saying what it shows. A test checks every named shot
  exists; QA-PLAN gets a line: a release that changes a page with a shot re-runs `npm run help:shots` and the
  maintainer looks at the diff (existence can't prove freshness).

### 2. The footer
- **App.svelte** renders `<footer>` (a `contentinfo` landmark) on every page, signed in or out, under `main`.
- **Version info** (r1 #6): `GET /api/about` (no session) returns ONLY `{ app: <package version> }`; the content
  pins (`[{ dir, tag }]` from the catalog manifest) come from `GET /api/about/content`, which needs a session, like the
  catalog. Signed out the footer shows "Hoi, chummer! 1.0.0"; signed in also "rules: sr2e-foundryvtt v0.171.0 · 11
  sourcebook modules" with the full list behind a `<details>`.
- **Links — as built** (user, 2026-11-27: the repository is PRIVATE, so GitHub links would 404 for players): **What's
  new** is the app's own page `/whats-new`, made from CHANGELOG.md at build time (`shared/changelog.mjs`), and **Report
  a problem** goes to Help → Getting started → "Something wrong?" (tell the node's admin). The rest of this bullet is
  the reviewed GitHub design, superseded:
- **Links** (r1 #10): Help, Accessibility (`/help/accessibility`), What's new, Report a problem. package.json gains
  `"repository": { "type": "git", "url": "https://github.com/futurekill/sr2e-chargen" }` (r3 #3: an HTTPS address the
  links use as is; a test checks it is https://github.com/<owner>/<repo> and that the rendered Releases and Issues
  links are that address + `/releases` and `/issues`); "What's new" links to that repository's
  RELEASES list (always exists; a version without its own release page can't break it) and "Report a problem" to its
  issues page.
- **Notice:** "Unofficial fan project. Shadowrun and its marks belong to their owners; this site isn't affiliated with
  or endorsed by them." No logo, no trade dress.

### 3. The Shadowland board (banter)
**U11 changes** (user, 2026-11-27): banter was "in the builder only"; the user now wants it in the site footer on every
page, context-aware. PLAN.md U11 is amended in the same change ("shown in the site footer's board, every page; never
on sheets or exports"). Codex r1 #1 asked to keep it builder-only: declined, the user's newer request wins.
- **Data, version 2: threads, not lines** (r1 #4): each key holds a LIST OF THREADS, each thread 2–4 lines
  (`entries: { "<key>": [ [ { handle, text, stamp }, … ], … ] }`). Every thread has 2–4 lines (r2 #4): the four
  existing files are converted (each key's lines become one thread; a one-line key gets one or two new reply lines
  written for it; a test pins that every original line is still there) and get more threads. Keys: `step:` `metatype:`
  `choice:` `itemtype:` and a new `banter/pages.json` with `page:<id>` threads (library, catalog, account, admin, help, sign-in, character,
  vehicle, workshop, npc, any) — ALL original writing in our own handles (U11/U12: no book quotes), about 120 new
  lines, each 1–3 sentences, in-world, PG-13, never mocking the user. A test validates every file (schema, keys,
  handle, text ≤ 280 characters, stamp format) and that every page key has at least 3 threads.
- **Context, given explicitly** (r1 #3): a shared reactive store `client/src/lib/context.svelte.js`
  (`board = { page, kind, step, race, choices }`) that each page SETS for itself (Library `page:library`; Document by
  kind; Character also its open step, metatype and the choices that hold; Vehicle `page:vehicle` or `page:workshop`
  when designed; NPC `page:npc`), cleared on route change. `client/src/lib/banter.js` (pure): `contextKeys(board)` →
  most specific first — on a character:
  `choice:*` that hold for it (priority letters, low Essence, magic with cyberware), `metatype:<race>`,
  `step:<open step>`, then `page:character`; elsewhere `page:<id>`; always `page:any` last. `pickThread(keys, rng)`
  takes a thread from the first key that has one with probability, else falls back (so a page doesn't show the same
  thread every time), 2–4 lines.
- **Changes on reload:** a fresh random thread on each full load and on each page change (`crypto.getRandomValues`
  seed), never during reading — not on every re-render. The last thread shown per context is remembered (session
  storage, best-effort) and excluded when another exists, so two loads in a row never show the same thread (r2 #3).
- **Animated like a live board:** lines appear one by one, a short "<handle> is typing…" before each (≈1.2–2.5 s per
  line, the thread over within about 10 s), each line `>>>>>[ text ]<<<<<  —Handle <stamp>` in the theme's mono face.
- **Accessibility (WCAG 2.2.2, 2.3.3):** two copies (r1 #8): a COMPLETE static copy of the thread as a list for
  assistive tech (visually hidden, always all lines, not live — a screen reader reads the whole thread whenever it
  reaches it, never interrupted), and the animated visual copy `aria-hidden="true"` (decoration). A **Pause/Play**
  button (the reveal lasts over 5 s; paused = all lines shown at once); "reduce motion" shows the whole thread at once
  with no typing; a **Hide banter** control in the footer.
- **The setting:** account preference `banter` (default on): `readPrefs`/`PREF_DEFAULTS`, the prefs route schema,
  the Account page ("Show the Shadowland board"). Off = the board's area is gone. ONE shared reactive prefs store
  (`client/src/lib/prefs.svelte.js`, filled from the session) that both the footer's Hide control and the Account page
  read and update after their save (r1 #5), so they never disagree. Signed out: shown, hidden by a per-device choice
  (localStorage) only.
- **Never on a sheet or export** (U11): a test renders a character's PDF, Markdown stat block and Foundry export and
  asserts none contains any banter line.

### 4. Proof
Unit tests: banter data validity (v2, every thread 2–4 lines (r3 #1), the v1 conversion lost nothing); `contextKeys` and `pickThread` (deterministic with a seeded rng); `/api/about`
(shape, no session, nothing from the environment); prefs `banter`; no banter in exports; every help section's shots
exist and have alt text; `sections.js` markup escaping (`<script>` stays text). The accessibility scan adds `/help`,
a help section page, the footer on every page (landmark, links, the board isn't `aria-live`, the static copy holds the
whole thread), the banter-off state, and two board checks (r1 #9): under REDUCED motion all lines are visible at once
on load; under NORMAL motion (a separate page context without the reduce emulation) the board reveals lines over time,
Pause stops the reveal and shows the whole thread, Pause keeps focus, and Hide removes the board. All four databases. Codex plan and code review.

## Key decisions & tradeoffs
- **Help as structured data in the client** (no Markdown dependency, no HTML in content) over a docs site.
- **Path routes for sections** (fragments are reserved for link secrets).
- **Screenshots generated by the scan's fixture** so they can be redone in one command; committed as WebP.
- **One board per page in the footer** rather than banter beside each control (U11's original idea): less clutter, the
  same data keys; context makes it specific.
- **Not a live region** + Pause + Hide: the animation is decoration, never an announcement.

## Risks / open questions
- Screenshot drift: the shots age as pages change; a test can only check they exist. Re-run before each release that
  changes a page (QA-PLAN line).
- Footer height on phones: the board is collapsible and short (2–4 lines).
- Writing ~120 lines of good banter is real work; quality over count (a reviewer reads them).

## Out of scope
Banter beside individual controls; handle avatars (GRAPHICS.md's SVG badges, later); translations; a copyright mode
(U12) beyond the "original" set flag that already exists; help for the Foundry system (its own wiki).
