# Changelog

Every change people can see goes under **Unreleased** in the same commit. A release retitles that section and its
notes come from it.

## Unreleased

### Fixed
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
