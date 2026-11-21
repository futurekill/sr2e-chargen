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
   Nuyen (finished): record +5,000; buy an Ares Predator for 400 (street 225 shown); Admin → Rules → fence: sell it at
   30% (135) and 50% (225); undo the sale; a Datajack bought is a spare (Essence unchanged).
9. Sheet: "Print sheet" on a character opens a PDF; try A4 and the readable font; print one page on paper and mark a
   condition box with a pencil. Download the Markdown stat block and open it in a Markdown viewer. On Account, turn
   on the readable font: the site changes at once, a second device shows it after sign-in, and "Print sheet" uses it. Look at `npm run sheet:snapshots`-style renders after any layout change.
10. Portraits: upload a JPEG from a phone (it has location data) — the page shows it; the sheet prints it; the stored
    file (GET …/portrait) has no EXIF. "Choose a premade one" shows the seven pregens; pick one; it prints.
11. Table card: untick a row — "Fits on one page" stays; add many cyberware rows — it says what is over and Print
    card is off; Print card opens a one-page PDF in each style.
12. Phone width (375 px): no page-wide sideways scroll; the rules check is below the steps.
13. History: each change is a revision named after its operation.

## Character page layout (tabs)
- The tabs show every step (they wrap on a wide screen; on a phone the row scrolls and the open tab stays in view); the
  counts match the Rules check; clicking a problem opens its tab; arrow keys, Home and End move between tabs; the tab is
  remembered after a reload.
- Delete: the button stays disabled until the exact name is typed; the character appears under Deleted in the
  Library and Restore brings it back.
- Archive (Library row and Concept tab): the character leaves the main list for Archived, opens and edits from there,
  Unarchive returns it; the Concept tab button flips between Archive and Unarchive; a deleted character can't be
  archived (404); archiving needs no revision, so an open character page never goes stale. Migration 004 on all four
  databases (CI).

## Condition after creation (M4c)
- Damage: Stun 12 → Stun 10 and Physical 2; Physical past 10 fills the overflow; heal takes the overflow first; the
  wound level, injury modifier and unconscious/dying/dead lines match p.111; the PDF crosses the filled boxes and the
  Markdown block lists them.
- Ammunition: Use takes rounds off; more than are left is refused.
- Surgery: a spare Datajack at 2 successes shows Minor Invasive, 5,000¥, an M wound, TN 3 (at 6 Essence); Install
  charges and wounds; 0 and 4 successes show 0.23 and 0.18; unticking fee/wound skips them; Undo restores exactly and
  is refused after healing; an install past 0 Essence is refused; an installed implant is not in the Sell list.
- Essence parity: Muscle Replacement beside a full cyberarm costs 20% less, as in Foundry.

## Sourcebooks (M5a)
- Concept tab: the list shows every catalog book, core ticked and disabled; All ticks and unticks every sourcebook;
  the choice survives a reload.
- With the Grimoire on, the Resources shop finds Grimoire spells (each row "Grimoire p.N"); with it off they're gone
  and adding one by id is refused. Turning a book off while one of its items is on the character is refused with the
  book named.
- No drug (Kamikaze), skillsoft, effect-bearing or special-rule entry is ever listed; Type III/IV maglocks are refused
  at creation and bought at their own rating on the Nuyen step.
- Finished character: turning a book on doesn't change any item; undoing a sale of a book item with its book off is
  refused.

## Metavariants (M5b)
- With the Companion on and a dwarf/elf/ork/troll chosen, the Metatype step lists that metatype's variants with the
  modifiers that differ and the page; picking one changes the Attributes tab's Racial column; "None" or another
  metatype clears it.
- Cyclops: Strength racial +6, troll maxima; sheet "Troll (Cyclops)" + "No depth perception" note.
- Oni: Race B is an error unless the GM option is on, Resources is A, Magic is C and the character is an adept.
- The Companion can't be turned off while a variant is chosen.
- Foundry (Quench sr2e.metavariant): dropping a Cyclops sets Strength racial +6 and no dermal die; a core Troll clears
  it; a Cyclops' firearm attack card shows "no depth perception +2".

## Shapeshifters (M5c)
- With the Companion on, the Metatype step lists six species; picking one makes the character a shapeshifter (the
  core metatype radios unticked); another metatype clears it.
- Priorities: the shapeshifter table's rows (A = the shapeshifter only); Race other than A is an error even with More
  Metahumans; Magic B allows a magician, C an adept.
- Attributes: a base of 7 is an error; human-form and animal-form columns (a bear's Body 6 → 7 human, 11 animal).
- Contacts: the first one is 5,000¥; no "two free contacts" to-do. Cyberware can't be added; the allergy fieldset is
  hidden. Karma Pool 1. The sheet's header has the animal form and the silver line.

## Edges and Flaws (M5d)
- With the Companion on, the Concept tab's list groups Edges and Flaws with their values; adding shows the choices
  (value, attribute, bonus, detail) and the running total; unbalanced is a Rules check error citing the Companion.
- Bonus Attribute Point past the racial maximum costs 2 per point and needs Exceptional Attribute; Bonus Skill Point
  raises the skill points; Bonus Force Point gives 2 Force Points per point to magicians only; Extra Contact asks for a
  third free contact; Lightning Reflexes raises Reaction; Will to Live the overflow.
- Blind is −6, or −2 for a magician or adept; a second copy is an error; the sheet's Edges and Flaws block.
- Foundry: the creation panel shows the same audit (Quench sr2e.edge-effects).

## Bioware (M5e)
- With Shadowtech on, the shop lists plain bioware (no Adrenal Pump, Pain Editor, Orthoskin…); rating and grade
  choices (no grade for neural); Body Cost in the row; the Rules check warns on overstress; the sheet's Bioware block
  and Body Index line; a magician's Essence drops by the Body Index.

## Book cyberware and grades (M5f)
- A Grade choice on cyberware rows; alpha/beta without the SSC is an error; with it, Essence and price follow; the SSC
  can't be turned off with a graded item. Cyberlimbs, Skillwires and ruled ware aren't offered. Hand Razors show in
  the attacks.

## Sum-to-10 (M5g)
- With the Companion on, the Priorities step has Standard / Sum-to-10; under sum-to-10 picking a used letter doesn't
  swap; the running sum shows, over 10 is an error; a shapeshifter can't use it; back to standard, a repeated letter is
  the "used twice" error.

## Point-based design (M5h)
- With the Companion on, the Priorities step's Point-based method hides the letters and shows the allotment, the
  nuyen tier, the Force Point trade (magicians), the Edges/Flaws option and the running total with its parts; an
  overrun is an error; Foundry's creation panel shows the same Building Points row (Quench sr2e.chargen-budget).

## Foundry connector (M7)
- Print tab → Foundry: download the character. In a Foundry world with the pinned system, create a Character actor →
  Import Data → the file. The sheet opens with no errors; items, nuyen, Essence and armor match the app.
- A vehicle bought at creation downloads and imports the same way.
- In Foundry, Export Data on a finished character; in the library, import it. It opens finished; the Finish tab says
  "Imported from Foundry"; awarding Karma works. A retried import (the same request) makes one character; importing the file again on purpose makes a copy.
- Refused with a reason: a character still in creation, a vehicle actor, a file from a newer system version, a
  character that breaks the rules (Essence below 0), numbers the app can't use (a Karma or rating that isn't a whole number).
- `test/fixtures/foundry-export-0.161.0.json` is a real Export Data file; replace it when the system's schema changes.

## Implants with their own rules (M5i)
- With Cybertechnology on, buy Wired Reflexes 2 and a Reaction Enhancer +6 and +1: Reaction counts +6 from the
  enhancers; the rules check warns "+1 lost".
- Buy Move-by-Wire 1 with Wired Reflexes: a warning "not compatible with move-by-wire". A second move-by-wire is an error.
- Bone lacing with an Unarmed Strike: the sheet's attack shows (Str+N).
- A VCR with move-by-wire or muscle replacement: the sheet shows "Control Pool X (Rigger 2 rules: Y)".
- Invoked Memory Stimulator and Automatic-Medication are refused ("comes with a cybermantic operation").
- `test/fixtures/parity/ware-v0.161.0.json` is Foundry's prepared values; regenerate it when the pin moves.

## Cyberlimbs (M5j)
- With Cybertechnology on, buy two Cyberarms: each asks for its side (an error until chosen). Buy a Strength
  Enhancement +3 and build it into the left arm: Strength shows the four limbs' average.
- Add a Body Enhancement to the same arm: its price shows the 10 % surcharge (a second enhancement type on one limb).
- A Cyber Forearm on the same side as a Cyberarm: an overlap error. Remove the arm: the option's "its limb is gone".
- A troll with a core Cyberarm (Full) and Increased Strength 2: Essence 0.8 for the option (p.51).
- `test/fixtures/parity/limbs-v0.161.0.json` is Foundry's prepared values; regenerate it when the pin moves.

## Bioware with its own rules (M5k)
- With Shadowtech on, buy a Synaptic Accelerator 2: Initiative +2D6. Add Wired Reflexes: an error (Shadowtech p.28).
- Synaptic Accelerator 1 with Move-by-Wire 1: priced ×3; Level 2 with move-by-wire: an error (Cybertechnology p.57).
- Muscle Augmentation beside two full cyberarms: Body Cost and price × .6.
- Orthoskin 2 with an Armor Vest: armor adds. Enhanced Articulation beside three cyber limb positions: no Reaction bonus.
- `test/fixtures/parity/bioware-v0.161.0.json` is Foundry's prepared values; regenerate it when the pin moves.

## Implant weapons (M5l)
- With Cybertechnology on, buy an Oral Gun: its weapon appears beside it (no remove button) and the sheet lists its
  attack. Remove the Oral Gun: both go.
- A Cybergun (Heavy Pistol) on its own: a note "in a natural limb, 1 Essence"; built into a cyberarm: 0 Essence.
- In play, buy an Oral Gun: one history entry; the attack appears only after surgery; sell it: both go; undo: both back.

## Reflex Recorder (M5m)
- With Shadowtech on, buy a Reflex Recorder (General): a to-do "choose the skill". The picker lists only Active skills.
  Choose Firearms: the to-do goes; export: the item's `recordedSkill` is "Firearms".
- A Reflex Recorder (Concentration) on Firearms with no concentration: an error; give Firearms "Pistols": it clears.
- A second General recorder on Firearms: an error (not cumulative). Remove the skill: "no longer on this character".
- In Foundry, the exported character's Firearms rolls get the +1 die (the system's rule).
