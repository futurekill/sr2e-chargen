# QA plan

Kept current with every change. A change is done when every automatic check passes and the manual walk-through for
the area it touches passes.

## Automatic (CI runs all of these)
| Check | Command | What it proves |
|---|---|---|
| Tests, SQLite | `npm test` | Accounts, library, idempotency, revisions, the catalog, the content copy, the creation rules |
| Tests, other databases | `npm run test:postgres`, `test:mysql`, `test:mariadb` | The same tests on each supported database |
| Lint | `npm run lint` | 0 errors, 0 warnings (server, shared, test, tools) |
| Content copy | `npm run content:verify` | `content/` is exactly the pinned upstream files, the rules code included |
| Catalog | `npm run build:catalog && npm run check:catalog` | Reproducible catalog, every entry with a valid citation |
| Client build | `npm run build` | The browser bundle builds (shared rules code included) |
| Image | `docker build -f docker/Dockerfile .` | The image builds its own catalog and ships `shared/` and the rules copy |

## Rules tests
Each creation rule has a test that cites its page (test/creation.test.mjs, docs/RULES-CHARGEN.md):
the Master Creation Table rows (p.47), each letter once (p.44), metatype priority (p.44, More Metahumans p.46), magic
type per priority (p.45–46), tradition and totem (p.44), attributes after racial modifiers and the point budget
(p.43, p.45).

## Manual walk-through (run on the dev server before a release)
1. Library: make a character; it opens on its page. Make a draft; it opens as a text page.
2. Priorities: give all five letters; pick a letter another category has — the two swap. The rules check updates.
3. Metatype: choose an elf with Race B — the check shows the rule with p.44. Turn on More Metahumans and give Race C —
   the problem goes away.
4. Magic: Magic A, magician, shamanic — the check asks for a totem; Mouse is not offered. Switch to adept — tradition
   and totem clear.
5. Attributes: spend exactly the priority's points — "No problems in these steps".
6. Open the same character in two tabs; change it in one, then in the other — the second tab says it changed
   elsewhere and shows the saved version.
7. Phone width (375 px): no page-wide sideways scroll; the rules check is below the steps.
8. History: each change is a revision named after its operation.
