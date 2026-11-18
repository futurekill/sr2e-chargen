# sr2e-chargen

**Hoi chummer!** A web app for building and running **Shadowrun, Second Edition** characters, in the spirit of D&D
Beyond: a step-by-step, rules-accurate character generator that keeps managing the character as it grows in play.
Characters move to and from the [SR2E Foundry VTT system](https://github.com/futurekill/sr2e-foundryvtt) as JSON with
nothing lost in either direction.

Built for a small private group: invite-only accounts, one Docker container on your own server.

> **Status: early development build.** The tool is **standalone first**: you can make and manage a character for a
> physical table without Foundry ([docs/ROADMAP.md](docs/ROADMAP.md)). Done so far: the app skeleton (accounts,
> library, Docker, CI), **milestone 1, the catalog** — 1,763 entries from the core book and 11 sourcebooks, each
> with its page reference — and the first parts of **milestone 2, character creation**: priorities, metatype, magic,
> attributes (M2a) and skills (M2b), with a rules check that cites the page. Next: resources (M2c). Not released: no
> image is published.

## Run it locally (development)

```bash
npm ci
```
```bash
npm run build
```
```bash
npm run build:catalog
```
```bash
DATABASE_URL=sqlite://./data/dev.db BASE_URL=http://localhost:3000 node server/cli.mjs admin bootstrap
```
```bash
DATABASE_URL=sqlite://./data/dev.db BASE_URL=http://localhost:3000 npm start
```
Open the setup link the bootstrap command printed (it works once), pick a handle and password, and you're the admin.
`npm run build:catalog` reads `content/`, this project's own copy of the content (the Foundry system and the
sourcebook modules at the releases in `content-pins.json`). A daily workflow proposes updates as pull requests.
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
| [docs/ROADMAP.md](docs/ROADMAP.md) | The approved order of work: standalone first |
| [docs/PLAN-catalog.md](docs/PLAN-catalog.md) | Milestone 1, the catalog, with its review logs |
| [docs/PLAN-M2.md](docs/PLAN-M2.md) | Milestone 2, character creation, with its review logs |
| [docs/QA-PLAN.md](docs/QA-PLAN.md) | How a change is checked: the automatic checks and the manual walk-through |
| [CHANGELOG.md](CHANGELOG.md) | What changed, release by release |
| [docs/PLAN-M3.md](docs/PLAN-M3.md) | The app skeleton's plan (accounts, library, container), with its review log |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Running it: Docker, settings, the admin CLI |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | What is protected, from whom, and where each defence lives |
| [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) | Every dependency and why it is there |
| [docs/RULES-CHARGEN.md](docs/RULES-CHARGEN.md) | The creation rules captured from the books, with page references (M0) |
| [docs/RULINGS.md](docs/RULINGS.md) | Where the books are unclear: the reading the app follows, and why |
| [docs/GRAPHICS.md](docs/GRAPHICS.md) | The graphics plan for the site and the sheets |

## Roadmap

The approved order is in [docs/ROADMAP.md](docs/ROADMAP.md) (standalone first, revised 2026-11-16).

| Milestone | What | Status |
|---|---|---|
| M0 | Capture the creation rules from the books | done |
| — | App skeleton: Docker, accounts, library, one theme | done |
| 1 | Catalog: browse and search every item, with page references | done |
| 2 | Create a character, core book ([docs/PLAN-M2.md](docs/PLAN-M2.md)) | M2a, M2b done; M2c resources next |
| 3 | Printable sheet | |
| 4 | Manage a character: Karma, nuyen, purchases, damage, history | |
| 5 | Sourcebooks, alternate methods, Edges and Flaws | |
| 6 | Release | |
| 7 | Foundry connector (optional) | |

Each milestone goes plan → review → build → code review → release.

## Planned stack

Node (current LTS) with Fastify, Svelte with Vite, Kysely over SQLite (Postgres or MySQL later), delivered as one
hardened Docker image. Security follows OWASP ASVS Level 2; dependencies are pinned and scanned.

## Not affiliated

Shadowrun is a trademark of its owners. This is an unofficial fan tool for personal use, with no official art or logos.
