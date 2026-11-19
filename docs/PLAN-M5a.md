# Plan: milestone 5a — sourcebook toggles for gear, spells and powers
_Draft 3 (2026-11-19), BUILT on the local app branch after Codex plan rounds 1–2 (11 + 3 findings; docs/PLAN-M5a-REVIEW-LOG.md; the "Draft 2" and "Draft 3" sections win). The first slice of roadmap item 5 ("Sourcebooks": book toggles, alternate creation methods,
book metatypes, Edges and Flaws; docs/ROADMAP.md, PLAN.md U3 and D4). Built on the local app branch
`chargen/on-0.161`. Later slices: 5b book metatypes (Shadowrun Companion), 5c Edges and Flaws, 5d alternate creation
methods, 5e bioware (Shadowtech, Body Index), 5f cyberware grades and the Cybertechnology limb rules._

## Goal
A character names the sourcebooks the table uses (core always on). The shop, the Skills step's add list and the Nuyen
step then offer those books' entries — but ONLY entries whose rules the app already computes exactly as Foundry does.
Anything else in an enabled book is listed as "needs rules the app doesn't have yet" (never sold with a wrong number).

## The books
The catalog's book ids (catalog `book`): csh Corporate Security Handbook, cp Cyberpirates, ct Cybertechnology,
ff Fields of Fire, grim Grimoire, naw Neo-Anarchist's Guide…, r2 Rigger 2, rbb Rigger Black Book, sc Shadowrun
Companion, st Shadowtech, ssc Street Samurai Catalog (names from the catalog manifest, not hard-coded).

## Data
- `creation.options.books`: an array of book ids, sorted, without "sr2" (core is implicit). New characters: `[]`.
  Old bodies: missing = `[]`.
- Op `setBooks { books: string[] }`: every id must be a catalog book other than core (the reducer gets the list from
  `lookup`'s catalog manifest — the server passes it, as the catalog); refused when a book being turned OFF still has
  something on the character (a creation record, an `actor.items` item whose catalog source is that book, or a
  vehicle) — "remove the Grimoire's spells first". Allowed during creation and after finishing (a table adds a book
  mid-campaign).

## Which entries are offered (one shared predicate)
`offerable(entry, books)` in shared/purchase.mjs, used by the reducer (addItem, addSkill, buyItem, newSkill) and the
client lists:
1. The entry's book is core or in `books`.
2. Its type is one the app models: BUYABLE plus skill. NOT bioware, quality, race, vehicle_mod, tradition,
   character (later slices). Vehicles stay core-only in this slice (Rigger 2's list needs the R2 module's rows).
3. Cyberware only when the app's Essence and attribute math is Foundry's: no limb identity (`limbIdentity(...)` from
   the system's limb-rules: no limb, no limb option), no cranial deck, standard grade, and its `wareRule` either null
   or one the app's `derive` already handles (the core set the app supports today — the list is written down and
   pinned by a test). Everything else in Cybertechnology waits for 5f.
4. Adept powers only when the system's `adeptPowerBudget` prices them from their data (a power with no `pointCost`
   is refused with its reason; Grimoire's six are checked one by one in the build).
5. The existing `refusalFor` reasons still apply (no fixed price, DataSoft, limb options).
A test walks EVERY catalog entry of every book: either `offerable` is true and the app's price (and Essence for
cyberware) equals the system's `chargenItemCost` (and `wareEssence`) on the projected item, or it is false with a
reason.

## Client
- Concept tab: a **Sourcebooks** list — "All" at the top, then each book with a tick; core shown ticked and disabled.
  Each book line says what it adds now ("12 weapons, 76 spells…") from the catalog counts of offerable entries, and
  how many entries wait for later rules.
- The shop and skill lists search core + the enabled books; each row shows its book and page (the catalog's
  citation).
- The Catalog page is unchanged (it browses everything).

## Exports and sheets
- Sheets already print each item's citation; nothing else changes.
- The Foundry export (PLAN D4) records `books` in the ruleset; no other change in this slice.

## Tests
Reducer: setBooks validates ids, refuses turning off a book in use, allows it once the items are gone; addItem of a
Grimoire spell refused without grim, allowed with it; buyItem of an SSC weapon in play likewise; the every-entry walk
above; a Cybertechnology limb refused with its reason. Server: setBooks bounds (at most 20 ids, each a short string).

## Out of scope
Book metatypes and More Metahumans' race list (5b), Edges and Flaws (5c), alternate methods (5d), bioware (5e),
grades and limbs (5f), book vehicles and vehicle mods, book traditions and totems, book contacts with special rules.

## Key decisions to challenge
1. Gate by "the app computes it exactly", not by book: an enabled book can still hold entries the app won't sell.
2. Books can be turned on after finishing; turning one off needs its items gone.
3. Vehicles stay core-only for now.

## Draft 2 — changes after round 1 (these win)
- **A narrow, structural gate** (r1 #1–#4, #6): price and Essence parity isn't enough, so 5a offers only what the
  app holds as plain data. `offerReason(entry, books)` (shared/purchase.mjs) returns null (offerable) or the reason:
  - book: core or in `books`;
  - type: from a sourcebook, only **weapon, armor, ammo, gear, spell**. Book cyberware (5f), bioware (5e), adept
    powers, foci, programs, contacts, skills, lifestyles, qualities, races, vehicles, mods and traditions wait;
  - no Active Effects (`effects` non-empty: Shadowtech's drugs), no `flags.sr2e.rule` (a special-rule item: tactical
    computer, lacing…), not a skillsoft, not a drug (`flags.sr2e.drug` / `system.drug`);
  - the existing `refusalFor` reasons (no fixed price, DataSoft…).
  Core entries keep today's rules unchanged (the gate adds nothing for core).
- **Spells** (r1 #5, declined): the app computes nothing from a spell but its Force and spell points; the sheet prints
  Force, category and drain, never a damage type, and every item keeps its compendium source, so Foundry classifies
  Stun Bolt and the manual spells itself on import. Grimoire spells are offered.
- **Rulesets** (r1 #7): books are only what may be bought. They set no optional rule; the items 5a offers have no
  ruleset-dependent derivation (no programs, vehicles or ware). Rulesets stay a later, separate record (PLAN D4).
- **Catalog context in the reducer** (r1 #8): `applyOp(..., { books: catalogBookIds })`; the server passes the catalog
  manifest's ids, the client the ids from `/api/catalog`. `setBooks` is allowed after finishing (added to the
  finished-character list).
- **Bounds and lists** (r1 #9): a `books` field type: array, at most 20 unique strings `^[a-z0-9-]{1,16}$`. The
  catalog build stores `offer` (null or the reason, with `books` taken as all enabled) on every entry and the summary
  carries it; the search takes `books=` and returns only offerable entries of those books; the reducer recomputes
  from the full entry.
- **Old bodies and undo** (r1 #10): `booksOf(b)` = `creation.options.books ?? []` everywhere. An item's book is its
  `system.citation.book`. Undoing a purchase or sale that would put back (or keep) an item of a book now turned off is
  refused ("turn the book back on first"). Revision restore is creation-only and restores books with the items.
- **No export claim** (r1 #11): the Foundry interchange is roadmap item 7; 5a stores `books` only.

## Draft 3 — changes after round 2 (these win)
- `setBooks` is a metadata op: it returns before `rebuildItems` (like setName), so a finished character's items are
  never rebuilt from the creation records.
- An entry whose AUTHORED rating is above the creation cap (Corporate Security's Type III/IV maglocks, 7 and 10) is
  refused at creation ("rated above 6: buy it after creation") instead of being projected at 6; in play its default
  rating is its authored rating.
- Recoil and armor-piercing fields (Improved Gas-Vents, APDS) — declined: the app computes no attack, recoil or armor
  piercing for ANY weapon (core gas vents included); the fields travel unchanged and Foundry or the table applies them.
