# Changelog

Every change people can see goes under **Unreleased** in the same commit. A release retitles that section and its
notes come from it.

## Unreleased

### Added
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
