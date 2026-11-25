# Changelog

Every change people can see goes under **Unreleased** in the same commit. A release retitles that section and its
notes come from it.

## 0.1.0-beta.8 — 2026-11-25
- **Fixed: exported magicians and adepts now carry their Magic Rating.** Foundry doesn't compute it, so a character
  made here arrived in Foundry with Magic 0 (an adept's powers then reported over budget). The export writes the
  Essence-based rating unless the character already holds one.
- Added: the Grimoire's and the Corporate Security Handbook's adept powers (sr2e 0.162.0): Attribute Boost (choose the
  attribute), Body Control, Missile Parry, Mystic Armor (adds to Impact armor), Suspended State, Enhanced Perception
  (its three tier items priced together) and Extended Missile Parry. Enhanced Centering waits for initiation.
- Changed: the power-point budget's own reports (a choice not made, a limit passed) now show at creation, as in play.
- Content: pinned to sr2e v0.162.0 and Grimoire v0.5.1.

## 0.1.0-beta.7 — 2026-11-25
The 0.1.0-beta.5 and beta.6 builds did not publish (the image scan failed); this release carries all of beta.5 below.
- Security: a zstd finding in the base image (Debian's fix not yet in distroless) is accepted until 2026-12-09: the
  app never loads that library (Node bundles its own zstd).

## 0.1.0-beta.6 — 2026-11-25 (not published: the image scan failed)
- Security: the image's base moves to the newest distroless Node 26 (Debian's zstd fix). Two OpenSSL QUIC findings
  with no fix yet are accepted until 2026-12-26 (`.trivyignore.yaml`): the app never uses QUIC.

## 0.1.0-beta.5 — 2026-11-25 (not published: the image scan failed)
- Added: the built-in device in a cyberlimb (core p.261). Choose one of the character's gear items; it goes inside the
  limb option, which costs 4 × the device's price (RULINGS R15).
- Added: the simple replacement limb (core p.249, Cybertechnology p.98): plain cyberware, 1 Essence, 50,000¥, with no
  cyberlimb rules (Cybertechnology p.49; RULINGS R16).

## 0.1.0-beta.4 — 2026-11-20
- Added: the Reflex Recorder (General and Concentration, Shadowtech p.27). Choose the Active skill it learns; the
  Concentration size learns that skill's concentration. Two recorders on one skill are refused (not cumulative).
- Added: the Toxin Exhaler (Shadowtech p.32). Choose its toxin; the price is 30,000¥ + 100 doses of it (RULINGS R14).
- Added: the delta cyberware grade (Cybertechnology p.44): Essence ×.5, price ×10, with Cybertechnology on. A warning
  says the GM decides: only a delta clinic installs it, and a corp has to want the character there.

## 0.1.0-beta.3 — 2026-11-20
The 0.1.0-beta.2 build did not publish (its CI failed); this release carries all of beta.2 below.
- Fixed: an item's notes on the printed sheet lose a broken tag fragment too, not only whole tags.
- Tests: the implant-weapon loader test builds its own catalog, so it runs without a local `catalog/`.

## 0.1.0-beta.2 — 2026-11-20 (not published)

### Added
- **Implant weapons** (docs/PLAN-M5l.md): the six cyberguns and the Cyberarm Taser can be bought, and every implant
  weapon (cyberguns, taser, CyberSquirt, oral gun and dart, eye gun, dart and tool laser) now comes with its weapon, so
  its attack shows on the sheet and travels to Foundry. A cybergun in a natural limb costs the p.52 table's Essence; in a
  cyberlimb none. In play an implant and its weapon are bought, sold and undone together; a spare's weapon has no attack
  until surgery.
- **Bioware with its own rules** (docs/PLAN-M5k.md): the Synaptic Accelerator, Muscle Augmentation, Orthoskin, the
  Suprathyroid Gland, the Adrenal Pump, Enhanced Articulation, the Cerebral Booster, the Damage Compensator and the
  Pain Editor. Cyberware cuts a pump's or suprathyroid's bonus (Cybertechnology p.56–57), muscle augmentation beside
  full cyberlimbs costs less Body and nuyen, Enhanced Articulation's Reaction is lost to cyberlimbs, Orthoskin adds
  armor, and the sheet shows the Rigger 2 Task Pool and the articulation skill die — as Foundry computes them (a
  parity fixture). The synaptic accelerator follows the books (RULINGS R13). Still waiting: the Reflex Recorder and
  the Toxin Exhaler (their choices).
- **Cyberlimbs** (docs/PLAN-M5j.md): cyberarms, cyberlegs, forearms, lower legs, hands, feet, the cybertorso and
  cyberskull (core and Cybertechnology), each with its side; and their Strength, Quickness and Body enhancements, the
  core Increased Strength (rated), built-in smartlinks, coverings, the External Mount, the Magnetic System and the
  DNI, each built into a limb. Strength and Quickness become the four limbs' averages, a complete pair adds Body, the
  limb Essence and prices (partial limbs, the 10 % surcharge, the troll and torso rules) follow Cybertechnology
  p.30–31 and p.49–52, as Foundry computes them (a parity fixture). The rules check reports a missing side, an option
  not in a limb, overlapping limbs and a duplicate enhancement. Still waiting: built-in devices, cyberguns and the
  taser, the limb cyberdeck, the simple replacement limb, hydraulic jacks and foot anchors.
- **Implants with their own rules** (docs/PLAN-M5i.md): with Cybertechnology on, the shop offers wired and boosted
  reflexes, Reaction Enhancers (+6 at most counts, p.38), move-by-wire, the reflex trigger, muscle replacement, dermal
  plating and sheathing, body plating, bone lacing (it raises the Unarmed Strike), datajacks, commlinks, cyberears,
  cranial bombs and the eye laser designator. Their values match Foundry's (a parity fixture). The rules check warns
  when move-by-wire meets a reflex enhancer. The sheet shows the Rigger 2 Control Pool beside the core one when they
  differ (Rigger 2 is a Foundry world setting). Still waiting: cyberlimbs, Cybertechnology cybereyes, the encephalon
  and rigger modules, the tactical computer, skillwires, the cranial deck.
- **The Foundry connector** (docs/PLAN-M7.md): download a character, or a vehicle bought at creation, as a Foundry
  actor file for Foundry's Import Data; import a finished character from Foundry's Export Data into the library.
- **Sum-to-10 priorities** (Shadowrun Companion p.20): with the Companion on, the Priorities step offers the
  sum-to-10 method (A 4 … E 0, letters may repeat, at most 10 in all), stored where Foundry keeps it
  (`system.chargen.priorityMethod`).
- **Point-based design** (Companion p.20–21; RULINGS R12): the Priorities step's third method. The GM's Building
  Points buy the metatype, magic, attributes (2 per point), skills (1 per point), a nuyen tier and traded Force Points;
  the total and each part show; an overrun is an error; Edges and Flaws can be priced in Building Points (GM option).
  The same budget runs in Foundry's creation panel.
- **Sourcebook cyberware and grades** (docs/PLAN-M5f.md): with their books on, the shop offers plain cyberware from
  Cybertechnology, the Street Samurai Catalog, Cyberpirates, Rigger 2, Corporate Security and Shadowtech (limbs and
  implants with their own rules wait). With the SSC on, cyberware can be alpha or beta grade (SSC p.98: Essence ×0.8
  / ×0.6, price ×3 / ×7; not Shadowtech's, p.40). Cyber weapons now show in the attacks.
- **Bioware** (Shadowtech; docs/PLAN-M5e.md): with Shadowtech on, the creation shop offers the bioware whose effects
  the app computes as Foundry does (Tailored Pheromones, filters, Symbiotes, Synthacardium…), with its rating and grade
  (cultured ×0.75 Body Cost, ×4 price; neural always cultured). The Body Index is derived and printed; the Awakened pay
  it in Essence; overstress is a warning; Toxin Extractor, Pathogenic Defense and Mnemonic Enhancer can't be rated
  over the unaugmented Body. Bioware with its own rules (Adrenal Pump, Pain Editor, Orthoskin…) comes later.
- **Edges and Flaws** (Shadowrun Companion p.22–35; RULINGS R11): with the Companion on, the Concept tab lists its 86
  Edges and Flaws (and, with those books on, Cyberpirates' and Rigger 2's, valued from their own pages). Each takes
  a value from the book's table (the magically active values for Blind, Bio-Rejection and
  Sensitive System), an attribute where needed and a detail; they must balance to 0. Bonus Attribute Point, Exceptional
  Attribute, Bonus Skill Point, Bonus Force Point and Extra Contact change the creation budget; Lightning Reflexes and
  Will to Live change Reaction and the overflow. The rules check cites the Companion's pages (shapeshifter problems
  now do too), and the sheets list the Edges and Flaws.
- **A favicon**: amber circuit-board traces on the terminal theme's dark background (SVG, with ICO and Apple touch
  icon fallbacks), so the app's tab is easy to find.
- **Shapeshifter characters** (Shadowrun Companion p.36–38; RULINGS R10): with the Companion on, pick a species on
  the Metatype step. The character uses the shapeshifter priority table (Race A; Magic B magician, C adept), buys base
  attributes up to 6 with the human-form modifiers on top, and shows both forms on the Attributes tab and the sheets
  (with the animal form's Reach, Initiative and dermal armor). No free contacts, no cyberware, no allergy points;
  the Karma Pool starts at 1.
- **Metavariants** (Shadowrun Companion p.39–44; RULINGS R9): with the Companion turned on, the Metatype step lists
  each metatype's variants with their modifiers and page. The character takes the variant's own racial modifiers
  (a Cyclops +6 Strength) with the base metatype's priority and maximums; the sheets print "Troll (Cyclops)" and the
  variant's notes. The GM's oni option allows Race B for a magical oni (p.42). Foundry applies the same variant data.
- **Sourcebooks** (roadmap item 5, first part): tick the books your table uses on the Concept tab. The creation shop
  and the Nuyen shop then list those books' weapons, armor, ammunition, gear and spells (Street Samurai Catalog guns,
  Grimoire spells, Fields of Fire gear…), with each row's book and page. Entries with rules the app doesn't compute
  yet (drugs, skillsofts, items with active effects or special rules) aren't offered; metatypes, Edges and Flaws,
  sourcebook cyberware and bioware come later. A Corporate Security maglock rated above 6 is bought after creation.
- **Condition after creation** (core p.111, p.114; Cybertechnology p.53; RULINGS R8): a finished character has a
  **Condition** step. Record damage and healing on the Physical and Stun monitors (Stun rolls into Physical, Physical
  into the overflow; the page shows the wound level, the injury modifier, and unconscious/dying/dead); use rounds from
  a box of ammunition; install spare cyberware by surgery — the surgeon's successes change the implant's Essence, the
  procedure's category sets the fee and the wound (each can be left off), and the surgery can be undone. The printed
  sheet and the stat block mark the wounds. Installed cyberware can no longer be sold.
- **Archive a character**: hide it from the Library's main list without deleting it (an **Archive** button on each
  Library row and on the Concept tab). It moves to an **Archived** list, stays editable, is never purged, and
  **Unarchive** brings it back. Database migration `004-archive` adds a column; it runs on start.

### Changed
- Cyberware Essence is now the Foundry system's own calculation: Muscle Replacement beside full cyberlimbs costs 20%
  less Essence per limb (Cybertechnology p.57), as Foundry already counted it.
- **The character page is tabbed**: each step is a tab (Karma and Nuyen first once a character is finished), with a
  count of what's left to do on each; the Rules check stays beside them and opens the tab of any problem you click.
  Printing (style, paper, font, the full sheet, the stat block and the table card) moved to a **Print** tab, so the
  page header is just the name. The open tab is remembered per character.
- **Deleting a character asks you to type its name** first (it was one click), and says it can be restored from the
  Library's Deleted list for 30 days.

### Changed
- "Wrong origin" now says which address `BASE_URL` expects and which one the page was opened at (and the server
  logs it), with a README troubleshooting section.
### Added
- **Nuyen after creation** (core p.184, p.188; RULINGS R6, R7): a finished character has a **Nuyen** step. Record
  money received or paid; buy weapons, armor, gear, ammunition, cyberware and programs — the street price is shown
  (list × Street Index) and you enter the price you agreed; sell what you own — by the GM's setting (Admin → Rules),
  either a refund of what was paid or a fence (30% of the list value, 10–50% in steps of 5). Cyberware bought now is a
  spare until surgery. Every change is in the history with Undo; the sheets print the history so the GM can read it.
- **Karma after creation** (core p.190–191): a finished character has a **Karma** step. Award Karma (one-tenth of
  Total, rounded up, is the Karma Pool; the rest Good Karma); raise an attribute (its new rating, double above the
  racial maximum with the GM's approval), a skill (2 ×, a language 1 ×), a Concentration (1.5 ×) or Specialization
  (1 ×), add a named one, or learn a new skill (1). Every change is in the character's history, and the latest can be
  undone. Prices come from the Foundry system's own function, so both agree. Finishing now freezes skill ratings as
  Foundry does, and the sheets show Good and Total Karma.
- **Vehicles and drones at creation** (core p.46, p.264): search the Vehicle type and add one at its list price;
  the character keeps the vehicle's complete data (for the Foundry connector) and Foundry's purchase receipt, so the
  budget is the system's. A vehicle the book lists as "Restricted" can't be bought. The full sheet and the stat block
  list each vehicle's Handling, Speed, Body, Armor, Signature and Pilot. The catalog build writes `vehicles.json`
  (checked by its own checksum).
- **Contacts, extras, lifestyle, allergy, programs and finishing** (core p.43–47): two free contacts, then
  5,000¥ each; one buddy (10,000¥); a gang or tribe (50,000¥, 2D6 members rolled by the server); followers (200,000¥,
  five different archetypes); a lifestyle with months paid ahead (none = the street); a metahuman's allergy and its
  bonus points; programs up to Rating 6. **Finish** turns unspent Resources into nuyen at 10:1 plus 3D6 × 1,000¥ rolled
  by the server, closes creation (name, notes and the table card stay editable), and marks the starting money as
  given so Foundry doesn't offer it again. The budget is now the Foundry system's own `chargenBudget`.
- **Physical adept powers** (core p.124–126): buy the core book's powers in Resources, priced in power points by the
  Foundry system's own tables (Combat Sense, Increased Reflexes and Reaction, Improved Physical Attributes, Improved
  Ability on one of your skills, Improved Physical Senses by naming them, Killing Hands, Pain Resistance, Astral
  Perception). The rules check shows power points against the Magic Rating and reports what the book limits. Combat
  Sense adds its dice to the Combat Pool on the sheet.

### Documentation
- A user guide in the README: building a character, running the image (pull, settings,
  compose, reverse proxy, first admin, updates), databases (SQLite in depth, PostgreSQL, MySQL/MariaDB), backups and
  restore, admin commands. README and OPERATIONS updated for the beta.

### Fixed
- **An implant weapon had no attack**: the CyberSquirt, oral gun and dart and the eye weapons were bought without
  their weapon item.
- **Point-based design starts with the GM's defaults** (100 Building Points, 500¥): choosing the method stored none,
  so the rules check said "Choose a nuyen tier" while the page showed 500¥.
- **Library**: the Foundry import is a proper button (the file chooser showed as the browser's grey default), with a
  focus ring and space above it; the intro names all three creation methods.
- **Character page**: the Sourcebooks note no longer says only weapons, armor, gear and spells are offered; a long
  checkbox label wraps beside its box; with the GM's Building Points option on, Edges and Flaws say they cost Building
  Points instead of "balance to 0".
- **Attributes floor at 1**, as in Foundry: a troll's Charisma of 1 (racial −2) showed 0.
- **The fist survives the trip to Foundry**: Foundry's Import Data replaces a new actor's items, so a character
  from the app arrived without the Unarmed Strike every Foundry character has. The export now carries one, and the
  sheet shows it.

## 0.1.0-beta.1 — 2026-11-18

First beta, for a table demo. Character creation covers priorities, metatype, magic, attributes, skills and
Resources (gear, cyberware, spells, foci); adept powers, contacts, lifestyle and the finish step come next.

### Fixed
- Physical adepts get the Resources priority's Force Points and can bond a weapon focus at creation: an adept is a magician (p.124, p.46). Other foci and spells stay refused for them.
- The 30-day purge of deleted documents could remove a document restored at the same moment; it now checks again.
- An item the app didn't create (a character made in Foundry) is no longer dropped when the character changes.

### Added
- Weapon foci at creation: bond one to a melee weapon you bought; it is priced by the weapon's Reach (p.263) and bonded for 4 × Force in Force Points if the weapon is small (Concealability above 5), else 5 × (p.137, RULINGS R5).
- **Backups**: with `BACKUP_DIR` set, a verified SQLite backup every night (portraits included), the newest seven
  kept; `backup create`, `backup verify` and an offline `backup restore` in the admin CLI; `backup sanitize` and
  `backup verify --database-url` for Postgres/MySQL after their own restore. See docs/OPERATIONS.md.
- **Release workflow**: a `v*` tag on main runs the whole CI, builds and scans the image (any High/Critical fails),
  makes its SBOM, pushes it as a private GHCR package, signs it, and creates the release; a weekly rebuild-and-scan.
- **Portraits**: upload a JPEG, PNG or WebP on a character's Concept step. It is checked, re-encoded and stripped of
  all metadata (location, camera data) before it is stored, shown only to you, and printed in the sheet's header (all
  three styles). Up to the last five portraits of a character are kept, so restoring an older revision brings its
  portrait back.
- **Premade portraits**: or pick one from a gallery (the Foundry system's sample-runner portraits). Nothing is
  uploaded or stored for these.
- **One-page table card**: tick which attacks, active skills, cyberware, adept powers and spells go on it; the page
  tells you at once whether it fits ("Fits on one page", or what is over), and "Print card" works only when it fits.
  The choice is saved with the character and can still change after creation.
- **Fohawk sheet style**, with an **ink-saver** version: the Pink Fohawk look — a black header band with the
  priorities, black angled section bars, a big attribute row (magenta and bold when augmented, with the natural
  rating under it), a stat strip, skills beside the condition monitor (wound levels marked) and attacks. The
  ink-saver draws the same layout with outlines. Choose the style next to "Print sheet".
- **The readable font is real and follows you**: the Account setting now uses Atkinson Hyperlegible Next (self-hosted)
  on the site, is saved with your account (every device), and is your printed sheet's default font.
- **Stat block (Markdown)** for each character: the same content as the sheet, as Markdown tables.
- **Printable sheet (milestone 3, Classic style).** "Print sheet" on a character gives a PDF for US Letter or A4, in a
  standard or a readable font (Atkinson Hyperlegible Next). Page 1 holds what you need at the table: attributes
  (natural and augmented), Reaction and Initiative, dice pools, armor, condition monitors with boxes for pencil,
  attacks and active skills; the rest follows (other skills, cyberware, adept powers, spells, foci, gear, notes) with
  book pages. Nothing is cut off: text wraps and long lists continue on the next page. An unfinished character prints
  marked "draft".
- **Derived values match Foundry**: the sheet's numbers for all seven pregens equal what the Foundry system computes
  (a test checks every value).
- **Resources (milestone 2c).** Buy the core book's weapons, armor, gear, ammunition (by the box), cyberware, spells
  and foci with the Resources priority, at the system's own list prices. Rated gear takes a Rating up to 6 (p.44);
  cybereyes take accessories up to .5 Essence for free (p.247); spells (Force up to 6) and foci bonding spend Force
  Points (p.46, p.137); Essence and the Magic Rating follow the cyberware (p.45). Items with no fixed core price, cyberlimb
  options, weapon foci and vehicles are refused for now, each with the reason; adept powers come next (M2c-2).
- **Skills (milestone 2b).** Add the core book's skills from the catalog, or name your own Knowledge, Language or
  Build/Repair skill. Buy each from 1 to 6 with Skill Points; a concentration and a specialization follow p.70 (Firearms
  5 → Firearms 3, Pistols 5, Ares Predator 7). The native language is free at Intelligence + 2 and a Street dialect at
  ½ Intelligence (p.74). The rules check shows the Skill Points and flags a skill above 6, a skill listed twice, a
  second free language, and Sorcery or Conjuring without a Magic Rating (p.45).
- **Character creation, first steps (milestone 2a).** "New" in the library makes a character (or a free-text draft).
  The Character page has the core book's first steps: priorities A–E (picking a letter another category has swaps the
  two), the optional More Metahumans rule, metatype, magic (magician or physical adept; hermetic or shamanic; a core
  totem), and attributes with racial modifiers and maximums. A rules check beside the steps shows the attribute points
  and every problem with its page (SR2 pp.43–47).
- Characters change only step by step: each change is an operation the server checks with the same rules code the
  page uses, saved as a new revision. A finished character can't be rolled back to an earlier revision.
- The rules come from the Foundry system's own code (this project's copy, kept by the daily content pull request);
  a pull request that changes that code is titled "Content + RULES CODE".
- **Catalog (milestone 1).** Browse and search 1,763 items from the core book and 11 sourcebooks, each with its page.
- **App skeleton.** Invite-only accounts, a library of documents with revisions, an admin CLI, a Docker image, CI on
  SQLite, PostgreSQL, MySQL and MariaDB.
