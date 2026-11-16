# Dependencies — and why each is here
Every dependency must earn its place (docs/PLAN.md "Security & currency"). Exact versions, committed lockfile,
`ignore-scripts=true`, `npm ci` only. Versions were confirmed against the npm registry on the date shown.

**From the platform instead of a package** (Node 26): the SQLite driver (`node:sqlite`), argon2id (`node:crypto`),
the test runner (`node:test`), UUIDs and random tokens (`node:crypto`), `fetch`. No native add-ons to build.

| Package | Version | Checked | Why |
|---|---|---|---|
| fastify | 5.12.8 | 2026-11-16 | The HTTP server: routing, JSON Schema validation of every input, logging with redaction |
| @fastify/cookie | 11.1.5 | 2026-11-16 | Session cookie parsing and setting |
| @fastify/static | 10.1.11 | 2026-11-16 | Serves the built client |
| @fastify/rate-limit | 11.2.2 | 2026-11-16 | Per-IP limits on the auth routes |
| @fastify/helmet | 13.2.0 | 2026-11-16 | Content-Security-Policy and the other security headers |
| kysely | 0.29.9 | 2026-11-16 | One query layer for SQLite, Postgres and MySQL/MariaDB; migrations |
| eslint, @eslint/js (dev) | see package.json | 2026-11-16 | Lint (`no-undef` above all) |

Still to add when their code lands: `pg`, `mysql2` (the other two databases), `svelte`, `vite` (client build only).
