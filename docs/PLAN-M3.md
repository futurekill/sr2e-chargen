# Plan: M3 — the creator skeleton
_Draft 2 (2026-11-16), after Codex round 1 (20 findings, all accepted; docs/PLAN-M3-REVIEW-LOG.md). Implements milestone **M3** of docs/PLAN.md (approved at round 12): that plan is the
requirement (Architecture, Security & currency, Content catalog); this one is HOW and in what order._

**Started out of order, by the user's ruling (2026-11-16):** docs/PLAN.md gates M3 on the M2 derive gate. The skeleton
does not need derived values, so it is built now, in parallel with M1/M2 in the system repo. Until M2 lands the app
stores, lists, revises, imports and exports documents but computes nothing about a character.

## Goal
`docker compose up` gives a running, hardened web app: an admin bootstraps it from the CLI, invites friends, each
signs in and sees their own library of documents with revision history. One theme. No rules yet.

## Releases
- **M3a — the app, an UNRELEASED development build** (round 1 #1): repo scaffold, server, database layer and
  migrations, auth lifecycle and admin CLI, the library with revisions, the client shell with one theme, the
  container, CI. No image is published and nobody is invited to a deployed copy until M3b's gates pass: the parent
  plan's release gates (image scan, SBOM, signing, backups) apply to the first RELEASE, which is M3b.
- **M3b — content and operations (the first release)**: the catalog build from `content-pins.json`, served only on
  AUTHENTICATED routes, the build FAILING when a book-derived text field lacks its source tag (U12; round 1 #20);
  backups and `backup verify`; `db copy`; image scan (fail on High/Critical), SBOM, cosign; the weekly rebuild.

## 1. Stack (versions confirmed against npm / nodejs.org on 2026-11-16)
- **Node 26** (Active LTS "Lithium", 26.13.1), plain ESM JavaScript with JSDoc types, no transpile step on the server.
- Platform before packages: `node:sqlite` (SQLite driver), `node:crypto` `argon2` (argon2id), `node:test`, `fetch`,
  `crypto.randomUUID`. So: no native add-ons to compile, none of their install scripts.
- Server: **Fastify 5.12.8**, `@fastify/cookie`, `@fastify/static`, `@fastify/rate-limit`, `@fastify/helmet`.
- Query layer: **Kysely 0.29.9**; drivers `pg` and `mysql2` (optional at runtime, loaded by `DATABASE_URL` scheme).
- Client: **Svelte 5.57 + Vite 8.3** (build-time only; the server serves the built files).
- Each dependency logged in `docs/DEPENDENCIES.md` with why; exact versions, committed lockfile, `.npmrc`
  `ignore-scripts=true`, `npm ci` only.

## 2. Layout
```
server/   app.mjs (Fastify factory) · config.mjs (env only) · db/ (dialects, migrations, queries) ·
          auth/ (passwords, sessions, tokens, csrf) · routes/ · cli.mjs (`chargen …`)
client/   Svelte app (src/, themes/)
test/     node:test suites (server), run against every dialect
docker/   Dockerfile, compose.example.yml
docs/     DEPENDENCIES.md, THREAT-MODEL.md, OPERATIONS.md
```
Config (environment only): `DATABASE_URL` (default `sqlite:///data/chargen.db`), `BASE_URL` (required in production;
its origin is the only accepted `Origin`), `TRUST_PROXY` (the proxy's address/CIDR; unset = trust none), `PORT`,
`LOG_LEVEL`. No secret is needed at rest: every token is random and stored hashed.

## 3. Database
- Kysely with one schema for the three dialects; migrations are JS files using only the schema builder (no raw
  dialect SQL); ids are app-generated UUIDs (text); timestamps are integer milliseconds UTC; booleans are 0/1 integers.
- The JSON body column: `TEXT` (SQLite), `LONGTEXT` (MySQL/MariaDB), `jsonb` (Postgres) — chosen by a `jsonColumn()`
  helper in the migration; read and written only through `db/queries/*.mjs`, which (de)serialises it.
- SQLite via `node:sqlite` behind a DEDICATED Kysely driver (round 1 #14; `server/db/node-sqlite.mjs`, not a method
  wrapper): Kysely's SQLite dialect wants better-sqlite3's shape (`prepare(sql)` → `{ reader, all(params[]),
  run(params[]) → { changes, lastInsertRowid }, iterate(params[]) }`), while `node:sqlite` statements take variadic
  parameters and expose `columns()`. The driver: `reader` = `columns().length > 0`; parameters spread; BigInt
  `changes`/row ids normalised to numbers; one connection behind Kysely's single-connection mutex; its own tests for
  result detection, parameter binding, `iterate`, a rolled-back and a committed transaction, and a statement error
  inside a transaction. Opened with `PRAGMA journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`; write
  transactions begin with `BEGIN IMMEDIATE`.
- **Types across dialects** (round 1 #17): timestamps are 64-bit (`bigint`) milliseconds, normalised to JS numbers
  on read (pg's int8 parser set to `Number`; mysql2 and SQLite checked the same way; values are far inside the safe
  integer range); the JSON body is decoded per dialect in ONE place (`decodeBody`: pg's `jsonb` arrives parsed,
  SQLite/MySQL text is parsed) and encoded in one place; checksums (M3b `db copy`) run over the normalised rows.
- **Migrations** (round 1 #15, #16): ONE owner at a time across processes — the server at startup and the CLI both
  take the database's own lock first (SQLite: the migration run sits inside `BEGIN IMMEDIATE` on its connection and
  re-reads the migration table after acquiring it; Postgres: an advisory lock; MySQL: `GET_LOCK`), since Kysely's
  SQLite adapter locks nothing. MySQL DDL commits implicitly, so every migration is RESTARTABLE: each step is
  conditional (`ifNotExists`, or a check before an alter), and a test kills the initial migration after each step on
  MySQL and re-runs it to completion. The CLI has `chargen db migrate` and `chargen db status`; a server refuses to
  start against a database NEWER than its own migrations.
- Tables (M3a): `settings` (key, value — the admin generation, the maintenance flag), `idempotency` (user_id, key,
  fingerprint, status, response, created_at; unique (user_id, key)), `users` (id, username unique
  case-insensitively via a normalised column, password_hash, role admin|user, disabled_at, failed_logins,
  locked_until, doc_count, bytes_used, created_at), `sessions` (id, user_id, token_hash unique,
  csrf_hash, created_at, last_seen_at, expires_at), `tokens` (id, kind invite|setup|reset, token_hash unique, user_id
  nullable, role, created_by, expires_at, used_at), `documents` (id, owner_id, kind character|vehicle, name, revision,
  body, bytes, created_at, updated_at, deleted_at), `revisions` (document_id, revision, body, bytes, note, created_at;
  unique (document_id, revision)), `audit` (id, at,
  actor_id, action, target, ip — no secrets).

## 4. Auth lifecycle (U13; docs/PLAN.md "Auth v1")
- **Passwords**: argon2id (`node:crypto`), memory 64 MiB, 3 passes, parallelism 1, 16-byte salt, 32-byte tag, stored
  as a PHC string with its parameters so they can be raised later (rehash on next login). Length 12–256, checked
  against the username; no composition rules. Verification is constant-time; an unknown username verifies against a
  fixed dummy hash, so timing and the response ("wrong name or password") don't reveal which accounts exist.
  `node:crypto`'s `argon2` returns the raw tag only (round 1 #9), so the PHC encoding (`$argon2id$v=19$m=…,t=…,p=…
  $salt$tag`) and its strict parser are ours, with tests (round trip, malformed strings, out-of-range parameters
  refused). **Memory is bounded globally**: every hash and verify goes through one queue (2 at a time, at most 16
  waiting; beyond that the request gets 503 "busy, try again") — per-IP limits alone would let many addresses run
  64 MiB hashes at once. A **password change needs the current password** (round 1 #7); a stolen session can't
  replace it.
- **Tokens** (invite, first-admin setup, password reset): 32 random bytes, base64url, shown ONCE; only the SHA-256 is
  stored. Invite and setup expire after 7 days, reset after 24 hours. Redemption is ONE transaction keyed on the
  SECRET, never on an id (round 1 #4): `UPDATE tokens SET used_at = now WHERE token_hash = ? AND kind = ? AND used_at
  IS NULL AND expires_at > now` (the hash of the presented secret, the kind the route is for; a reset is also bound
  to its `user_id`) must affect exactly one row before the user row is created or the password changed; a
  unique-username conflict rolls the token back to unused.
- **Link transport** (round 1 #8): the secret travels in the URL FRAGMENT (`/redeem#k=…`), which never reaches the
  server, a proxy log or a `Referer`; the page reads it, clears the fragment (`history.replaceState`) and submits it
  in the JSON body.
- **First admin and recovery** (round 1 #5, #6): `settings.admin_gen` is a counter. `bootstrap` is allowed only while
  no ENABLED admin exists; it revokes earlier unused setup tokens and issues one carrying the current generation.
  Redeeming a setup token does, in its transaction, `UPDATE settings SET value = value + 1 WHERE key = 'admin_gen' AND
  value = <the token's generation>` — exactly one row, or the redemption fails — so two links from two racing
  `bootstrap` runs can create only ONE admin. Disabling (or demoting) the LAST enabled admin is refused, in the web
  app and the CLI alike; if it happens anyway (a direct database edit), `bootstrap` works again.
- **Sessions**: server-side rows. The cookie `__Host-sid` (HttpOnly, Secure, SameSite=Lax, Path=/) carries 32 random
  bytes; the row stores its SHA-256. Idle expiry 7 days (`last_seen_at`, refreshed at most once a minute), absolute 30
  days. A new session on every login (never reuse a pre-login id). All of a user's sessions are deleted on password
  change, reset and account disable. In development over plain HTTP the cookie is `sid` without `Secure`, only when
  `BASE_URL` is `http://localhost…`.
- **CSRF**: every state-changing request needs BOTH an `Origin` header equal to `BASE_URL`'s origin AND the session's
  synchroniser token in `X-CSRF-Token` (issued by `GET /api/session`, stored hashed on the session row). Login,
  redemption and reset (no session yet) need the Origin check and are JSON-only (`Content-Type: application/json`
  enforced, so a cross-site form can't post them).
- **Throttling**: `@fastify/rate-limit` per IP on the auth routes (10/min); per-account lockout in the database —
  after 5 consecutive failures the account locks for 1 minute, doubling to a 1-hour cap, reset on success. The lockout
  answer is the same generic failure.
- **Maintenance flag** (round 1 #19): `settings.maintenance`; EVERY writer (routes and CLI) reads it inside its
  write transaction and refuses while it is set, so M3b's `db copy` sets it, waits for the open write transactions
  to finish (the same lock the migrations use) and only then copies.
- **Admin CLI** (in the image, `chargen admin …`, talks to the database directly): `bootstrap` (only while no admin
  exists; prints a one-time setup link), `invite [--role]`, `invites` (list), `revoke-invite <id>`, `users`,
  `disable <user>`, `enable <user>`, `reset-link <user>`. Admin routes in the web app do the same for a signed-in admin.
- Every auth event goes to `audit` (login ok/failed/locked, invite created/redeemed/revoked, reset, disable).

## 5. The library
- A document = one portable bundle (the system's `sr2e-portable` JSON, docs/PLAN-portable.md there) stored whole in
  `body`. **No real bundle is accepted until its schema exists** (round 1 #2, #3: the parent requires full schema
  validation of untrusted JSON and view-only handling of newer versions, and the server must not invent a second
  schema). So in M3a the ONLY body the server stores is the empty envelope, validated strictly
  (`additionalProperties: false`): `{ schema: "sr2e-portable", schemaVersion: 1, metadata: { name, notes },
  documents: [] }`, ≤ 2 MB, parsed with a prototype-pollution-safe reviver (`__proto__`/`constructor`/`prototype`
  keys rejected). That exercises the whole library (create, edit, revisions, conflict, quota, download) with nothing
  unvalidated at rest. **Import and real bundles are a gate, not a stub**: they turn on when the system publishes
  `portable.schema.json` (system M1a), vendored here at a pinned version, with the D10 rule (envelope, system, Foundry
  and module versions; anything newer than this build understands is VIEW-ONLY, never edited). Import then is the
  client reading the file and POSTing JSON under the same body limit (round 1 #10) — no multipart parser.
- **Authorization in one place**: `ownedDocument(db, userId, id)` returns the row or null; every document route goes
  through it; someone else's document and a missing one are the same 404. Admins have no access to others' documents.
- **Every mutation is idempotent and conditional** (round 1 #11, #12) — create, update, delete, restore, restore a
  revision: each carries an `Idempotency-Key` (UUID), and every one but create the `revision` the client read. In ONE
  transaction the server FIRST inserts `idempotency (user_id, key, fingerprint)` (fingerprint = SHA-256 of method,
  route, and body). A unique conflict means the key was used: it re-reads the row — same fingerprint → the stored
  status and response are returned (also when the first request is still committing: the insert waits on it);
  a different fingerprint → 422 "that key was used for another request". Otherwise
  `UPDATE documents SET …, revision = revision + 1 WHERE id = ? AND owner_id = ? AND revision = ?` must affect one row
  (else 409 "someone changed this — reload"), the new body is appended to `revisions`, and the response is stored on
  the key row. Key rows live 24 hours, independent of revision pruning. Delete is soft (`deleted_at`).
- Routes: list (name, kind, revision, updated; paginated), get, create (blank or from an uploaded JSON file = import),
  update, delete/restore, revision list, get one revision, restore a revision (a NEW revision with the old body),
  download (`Content-Disposition: attachment`, JSON only in M3a).
- **Quotas, enforced atomically** (round 1 #13): 200 documents and 500 MB per user, 50 revisions kept per document
  (older ones pruned in the same transaction, the first always kept). `users.doc_count` / `bytes_used` are counters
  changed by conditional updates in the mutation's transaction (`UPDATE users SET doc_count = doc_count + 1 WHERE id
  = ? AND doc_count < 200` must affect one row), so two concurrent creates can't both pass a count. Soft-deleted
  documents STILL count; they are purged (rows, revisions, counters) 30 days after deletion by a sweep at startup
  and daily.

## 6. Client
- Svelte SPA, hash-free history routing; pages: sign in, redeem (invite/setup/reset), library, document (name, kind,
  revision history, raw JSON view, download, import), account (change password, sign out everywhere, readable-font
  toggle), admin (invites, users) for admins.
- One theme in M3a (terminal), as a CSS custom-property token set over one layout, so the other three are token
  files later. The readable-font toggle overrides the theme's fonts. WCAG AA contrast checked by a test over the
  token set; `prefers-reduced-motion` honoured. Voice per U14 ("Hoi chummer!"), meaning always clear.
- No inline script or style; fonts self-hosted; no third-party requests at all.

## 7. HTTP hardening
`@fastify/helmet`: CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
frame-ancestors 'none'; base-uri 'none'; form-action 'self'`, HSTS (production), nosniff, `Referrer-Policy:
no-referrer`. Every route has a JSON Schema for params, query and body (`additionalProperties: false` except the
document body); body limit 2.5 MB on document routes, 16 KB elsewhere. Errors never echo input; logs redact
`cookie`, `authorization`, `x-csrf-token`, passwords and tokens (pino redaction paths, tested). API responses are
`Cache-Control: no-store`.

## 8. Container and CI
- Dockerfile, multi-stage: build (client build, `npm ci --omit=dev` for the server) → final on a distroless Node 26
  image **pinned by digest** (tag verified at build time), non-root, `/data` the only writable path, read-only root
  filesystem in the compose example, `HEALTHCHECK` via a tiny node script hitting `/healthz`, no shell.
- `docker/compose.example.yml`: the app, a named volume for `/data`, `read_only: true`, `cap_drop: [ALL]`,
  `security_opt: [no-new-privileges:true]`, bound to localhost for the user's reverse proxy.
- CI (Actions pinned to commit SHAs, least-privilege `permissions`): lint, the server suite against SQLite, Postgres
  and MySQL service containers, client build, `npm audit` + OSV-Scanner, CodeQL, a Docker build. Image scan (Trivy,
  fail on High/Critical), SBOM, cosign and the GHCR push are M3b. The image is never pushed public by default.
- **Backups (M3b) fit the read-only image** (round 1 #18): the app image has no shell and no dump tools, so backups
  are a SEPARATE compose service from a small tool image with its own `BACKUP_DIR` mount (a different volume or host
  path): SQLite through `node:sqlite`'s online `backup()`, Postgres/MySQL through `pg_dump`/`mysqldump` in that tool
  image, plus the asset files and a checksum manifest; `backup verify` restores into a scratch database there.
- Renovate config with a 7-day minimum release age.

## 9. Tests (node:test)
Password hashing (round trip, wrong password, parameter upgrade, PHC parsing, the queue's bound); token redemption
(single use under two concurrent redemptions, expiry, wrong kind, a token id without its secret, username conflict
leaves the token usable); two racing bootstraps make one admin; the last admin can't be disabled; password change
needs the current password; the maintenance flag stops every writer; idempotency (a replay of each mutation, two
concurrent identical requests, a reused key with a different body); quota under concurrent creates and the purge; sessions (idle and absolute expiry, revocation on
password change/disable, cookie flags); CSRF (missing/wrong Origin, missing/wrong token); lockout progression;
authorization (another user's document is 404 on EVERY document route — a table-driven test over the route list, so
a new route can't skip it); conditional writes (stale revision 409, replayed idempotency key returns the first
result without a second revision); import limits (size, schema marker, prototype keys); log redaction; migrations up
on an empty database and refusal on a newer one; the CLI's bootstrap-only-once. All of it on the three dialects.

## Key decisions & tradeoffs
- **Platform crypto and SQLite** over `argon2`/`better-sqlite3` packages: no native builds or install scripts (the
  supply-chain threat model); the cost is a small Kysely driver adapter for `node:sqlite`.
- **Plain JS + JSDoc** on the server: no build step in the image; the client alone is built.
- **Synchroniser token + Origin check** rather than double-submit cookies: sessions are already server-side.
- **Soft schema check now**: the real bundle schema comes from the system package (M1a); the server must not invent
  a second schema.
- **Documents stored whole** with full-body revisions: simple and exact; 2 MB × 50 revisions × 200 documents bounds
  a user at 20 GB worst case — so the quota also caps total bytes per user at 500 MB.

## Risks / open questions
- `node:sqlite` behind Kysely: transaction and `iterate` semantics need the adapter's own tests.
- Distroless Node 26 availability and digest at build time (fallback: Chainguard node, also digest-pinned).
- MySQL in CI from day one costs CI time; kept, since the plan requires the three dialects.

## Out of scope (M3a)
The catalog and book content, backups, `db copy`, image signing (all M3b); anything that reads a character's
contents (M4+); PDF, portraits, themes beyond one, social login.
