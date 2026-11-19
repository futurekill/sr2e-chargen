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
| Sheet fit | `npm test` (test/sheet.test.mjs) | Every fixture × the three styles × Letter/A4 × both fonts: all text placed, inside the safe area, no overlaps, no size under the floor, the PDF's own text (pdf.js) equals what was placed |
| Derive parity | `npm test` (test/derive.test.mjs) | The seven pregens' derived values equal Foundry's (fixture exported from the test world at the pinned version) |
| Image | `docker build -f docker/Dockerfile .` | The image builds its own catalog and ships `shared/` and the rules copy |

## Rules tests
Each creation rule has a test that cites its page (test/creation.test.mjs, docs/RULES-CHARGEN.md):
the Master Creation Table rows (p.47), each letter once (p.44), metatype priority (p.44, More Metahumans p.46), magic
type per priority (p.45–46), tradition and totem (p.44), attributes after racial modifiers and the point budget
(p.43, p.45), skills 1–6 and the Skill Point budget (p.45), the concentration/specialization example (p.70), free
languages (p.74), Sorcery and Conjuring need a Magic Rating (p.45); and on the real catalog (test/resources.test.mjs):
prices (rated × quantity, ammo boxes), cybereye accessories (p.247), Essence and Magic (p.45–46), Force Points and
bonding (p.46, p.137), refusals.

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
7. Skills: add Firearms from the core list, give it 5 points, concentration Pistols, specialization Ares Predator —
   it shows 3, Pistols 5, Ares Predator 7. Add English, mark it Native — it shows Intelligence + 2 and costs no points.
   Add Sorcery to a mundane character — the check flags it (p.45). Add your own Knowledge skill by name.
8. Resources: search "cybereyes", add it and Low-Light Vision, set Low-Light "In: Cybereyes" — Essence 5.8, the eyes'
   price includes the accessory. Add a Jammer, Rating 3, Qty 2 — 6,000¥. Add Regular Ammo, 3 boxes — 60¥. A magician:
   add Mana Bolt (Force 6) and a Power Focus (Force 2) — Force Points 16; a Spell Focus asks for its spell. Add a Katana and a
   Weapon Focus: it asks for its weapon; pick the Katana, Force 3 — 470,000¥ and 15 Force Points (the Katana is Conceal 3: large); bonded to a Knife (Conceal 8: small) it is 12. Remove
   the Katana — the focus asks again. Try a Personal Computer — refused with the reason.
   A physical adept (Magic B): add Combat Sense (level 2 — 3 PP), Increased Reflexes (+2 — 4 PP) and Improved
   Ability on a skill you have — the Power points row turns red over the Magic Rating; the Combat Pool rises by
   Combat Sense's level.
   Contacts: add Fixer and Street Doc (free), a third (5,000¥), make one a buddy (10,000¥); add a gang (members
   rolled) and followers (five archetypes). Lifestyle: Low for 3 months — 3,000¥; remove it — "the street".
   Finish a clean character: 15,000¥ unspent → 1,500¥ + 3D6 × 1,000¥; afterwards only name, notes and the card change.
   Vehicles: Type Vehicle, search "Scoot", Add — 2,000¥ on the Nuyen row, the sheet and stat block list it; a GMC
   Banshee is refused (Restricted).
   Karma (a finished character): award 40 — Good 36, Pool 5; raise Firearms 6 → 7 — 14; add a Concentration;
   learn a skill — 1; Undo twice returns to the start; Strength 6 → 7 needs the GM tick and costs 14.
9. Sheet: "Print sheet" on a character opens a PDF; try A4 and the readable font; print one page on paper and mark a
   condition box with a pencil. Download the Markdown stat block and open it in a Markdown viewer. On Account, turn
   on the readable font: the site changes at once, a second device shows it after sign-in, and "Print sheet" uses it. Look at `npm run sheet:snapshots`-style renders after any layout change.
10. Portraits: upload a JPEG from a phone (it has location data) — the page shows it; the sheet prints it; the stored
    file (GET …/portrait) has no EXIF. "Choose a premade one" shows the seven pregens; pick one; it prints.
11. Table card: untick a row — "Fits on one page" stays; add many cyberware rows — it says what is over and Print
    card is off; Print card opens a one-page PDF in each style.
12. Phone width (375 px): no page-wide sideways scroll; the rules check is below the steps.
13. History: each change is a revision named after its operation.
