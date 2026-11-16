# sr2e-chargen

**Hoi chummer!** A web app for building and running **Shadowrun, Second Edition** characters, in the spirit of D&D
Beyond: a step-by-step, rules-accurate character generator that keeps managing the character as it grows in play.
Characters move to and from the [SR2E Foundry VTT system](https://github.com/futurekill/sr2e-foundryvtt) as JSON with
nothing lost in either direction.

Built for a small private group: invite-only accounts, one Docker container on your own server.

> **Status: early development build.** The plan is approved and milestone M0 (the creation rules from the books) is
> done. The app skeleton (M3a) runs: invite-only accounts, sessions, an admin CLI and a library of DRAFTS with
> revision history, in one theme. It knows no rules yet and stores no real characters — those arrive with the rules
> engine and the portable format from the Foundry system (M1, M2). Not released: no image is published.

## Run it locally (development)

```bash
npm ci
```
```bash
npm run build
```
```bash
DATABASE_URL=sqlite://./data/dev.db BASE_URL=http://localhost:3000 node server/cli.mjs admin bootstrap
```
```bash
DATABASE_URL=sqlite://./data/dev.db BASE_URL=http://localhost:3000 npm start
```
Open the setup link the bootstrap command printed (it works once), pick a handle and password, and you're the admin.
`node server/cli.mjs` with no arguments lists the admin commands. `npm test` runs the suite. Needs Node 26.13+.

## What it will do

- **Build a character** the way the core book does it: priorities, race, magic, attributes, skills, resources,
  contacts, lifestyle. Start from scratch or from an archetype. Alternate methods from the books you enable (e.g. the
  Shadowrun Companion's Sum-to-10 and point-based design).
- **Pick your books**: an ALL toggle for the sourcebooks; the core book is always on. Every item and rule shows where
  it comes from (`SSC p.59`, `R2 p.14`).
- **Manage it in play**: Karma and advancement, nuyen, purchases, damage, ammo, with history and undo.
- **Vehicle Workshop**: design vehicles on their own and attach them to characters.
- **Export**: Foundry JSON (characters with their vehicles, spirits and images), printable PDF sheets in several
  styles (Classic and Fohawk, with an ink-saver option), a Markdown stat block and a one-page table card.
- **Shadowland banter** while you build: in-character commentary from street handles, never printed on sheets.
- **Themes**: old-school terminal, cyberpunk, cybernoir and GeoCities retro, plus a dyslexia-friendly font option for
  the site and the sheets.

## How it fits with Foundry

The Foundry system is the source of truth for the rules. Its rules code is shared with this app, so a character is
computed the same way in both places. Tests check that both give identical results. The Docker image will ship fully formed, with the catalog built in from pinned content versions.

## Documents

| File | What it holds |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | The approved plan: decisions, architecture, security, exports, milestones |
| [docs/PLAN-REVIEW-LOG.md](docs/PLAN-REVIEW-LOG.md) | Every review round and how each finding was resolved |
| [docs/RULES-CHARGEN.md](docs/RULES-CHARGEN.md) | The creation rules captured from the books, with page references (M0) |
| [docs/GRAPHICS.md](docs/GRAPHICS.md) | The graphics plan for the site and the sheets |

## Roadmap

| Milestone | What | Status |
|---|---|---|
| M0 | Capture the creation rules from the books | done |
| M1 | Character export/import in the Foundry system (lossless, recoverable) | planning (sr2e-foundryvtt docs/PLAN-portable.md) |
| M1b | Structured book/page citations on every item | |
| M2 | Share the rules code between Foundry and this app | |
| M3 | App skeleton: Docker, accounts, library, content catalog, one theme | |
| M4 | The core build flow, archetypes, banter | |
| M5 | PDF and text exports | |
| M6 | Manager: Karma, nuyen, purchases, damage, history | |
| M7 | Sourcebooks and alternate creation methods | |
| M8 | Vehicle Workshop | |
| M9 | Remaining themes, portrait/token export, NPC builder | |

Each milestone goes plan → review → build → code review → release.

## Planned stack

Node (current LTS) with Fastify, Svelte with Vite, Kysely over SQLite (Postgres or MySQL later), delivered as one
hardened Docker image. Security follows OWASP ASVS Level 2; dependencies are pinned and scanned.

## Not affiliated

Shadowrun is a trademark of its owners. This is an unofficial fan tool for personal use, with no official art or logos.
