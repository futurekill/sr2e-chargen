# Threat model (M3a)
What the app protects, from whom, and where each defence lives. OWASP ASVS Level 2 is the checklist
(docs/PLAN.md "Security & currency"). Updated with every milestone; M3a covers accounts and the library of drafts.

## What's worth protecting
- **Accounts**: password hashes, sessions, one-time links (invite, setup, reset).
- **Each person's library**: private to its owner — admins included.
- **The host**: the container must not become a way onto the server it runs on.
- Later (M3b+): the catalog (book-derived text, authenticated), uploaded portraits, PDFs.

## Who we expect
A small invite-only group behind the owner's reverse proxy. So the realistic threats are, in order: someone on the
internet who finds the address; a compromised dependency (the current wave of npm attacks); a stolen or guessed
password; a curious or careless invited user; a malicious file handed to a user to import (from M1 on).

## Threats and defences
| Threat | Defence | Where |
|---|---|---|
| Guessing passwords | argon2id (64 MiB, 3 passes); per-address rate limit on auth routes; per-account lockout doubling to 1 hour; one generic failure answer | `server/auth/passwords.mjs`, `accounts.mjs` `login`, `routes/auth.mjs` |
| Finding out who has an account | Unknown, wrong, locked and disabled all answer the same and cost the same (a dummy hash made at startup) | `accounts.mjs` `login` |
| Exhausting memory with logins | Every hash goes through one queue: 2 running, 16 waiting, then 503 | `passwords.mjs` |
| Stealing a session cookie | `__Host-` cookie: HttpOnly, Secure, SameSite=Lax; only its SHA-256 is stored; idle 7 d, absolute 30 d; a new session on every login; all sessions end on password change, reset, disable | `auth/sessions.mjs`, `app.mjs` |
| Using a session after it was revoked (a request already in flight) | Every write transaction re-checks the session and the role under a row lock | `db/fence.mjs` `writeTx` |
| Cross-site request forgery | Origin must equal `BASE_URL`; a session-bound token in `X-CSRF-Token`; only JSON bodies are parsed | `app.mjs` |
| Cross-site scripting | No user HTML anywhere (Svelte escapes text); CSP with no inline script or style, `frame-ancestors 'none'`, `base-uri 'none'` | `client/`, `app.mjs` |
| Leaking a one-time link | 32 random bytes, hashed at rest, single use, expiring; carried in the URL FRAGMENT (never sent to a server or a proxy log) and wiped from the address bar at load; redeemed by the secret, never by an id | `auth/tokens.mjs`, `accounts.mjs`, `client/src/lib/router.svelte.js` |
| Taking over through a password reset race | Login and password change re-check the stored hash inside their transaction | `accounts.mjs` |
| Two "first admins" | The setup link carries the admin generation; redemption advances it under a lock; the last enabled admin can't be disabled | `accounts.mjs` |
| Reading or changing someone else's document | One function decides ownership; another user's document is the same 404 as a missing one; a test walks EVERY document route | `library.mjs` `ownedDocument`, `test/library.test.mjs` |
| Hostile input | JSON Schema on every body, parameter and query (`additionalProperties: false`, no type coercion); 16 KB bodies (2.5 MB for documents); prototype-pollution keys rejected by the parser; M3a stores only a strict draft shape | `routes/*.mjs`, `library.mjs` |
| Filling the disk | Quotas as atomic counters: 200 documents, 500 MB, 50 revisions per document; deleted documents count until purged | `library.mjs` |
| Applying a change twice (retries, double clicks) | Idempotency keys bound to the exact request; conditional writes on the revision | `library.mjs`, `client/src/lib/api.js` |
| SQL injection | Kysely parameterises every value; the few raw fragments are constants | `server/db/` |
| Secrets in logs or errors | Cookie, CSRF and authorization headers redacted; bodies never logged; errors never echo input; server faults answer generically | `app.mjs`, `test/http.test.mjs` |
| A compromised npm package | Exact versions, committed lockfile, `npm ci`, install scripts OFF, platform APIs instead of native add-ons, Renovate with a 7-day release age, `npm audit` + OSV-Scanner + CodeQL in CI, Actions pinned to commit SHAs | `.npmrc`, `package-lock.json`, `renovate.json`, `.github/workflows/ci.yml`, `docs/DEPENDENCIES.md` |
| Breaking out of the container | Distroless (no shell, no package manager), non-root, read-only root filesystem, all capabilities dropped, no-new-privileges, `/data` the only writable path, bound to localhost | `docker/` |
| Eavesdropping | TLS ends at the owner's reverse proxy; HSTS; `BASE_URL` must be https outside localhost; proxy headers trusted only from `TRUST_PROXY` | `config.mjs`, `app.mjs` |

## Known gaps (accepted for an unreleased development build)
- **No image scan, SBOM or signature yet** — M3b, and a gate of the first release.
- **No backups yet** — M3b. Until then `/data` is the only copy.
- **No second factor.** Invite-only and small; revisit with social login.
- **Rate limiting counts addresses as the proxy reports them**: `TRUST_PROXY` must be set correctly or every visitor
  looks like one address (lockout still works per account).
- **An admin can read the database file.** The owner of the server is trusted; libraries are private from other
  USERS of the app, not from whoever holds the disk.
- **The readable font is the system's**, not yet a self-hosted dyslexia-friendly face.
