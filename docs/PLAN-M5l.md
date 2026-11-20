# Plan: milestone 5l — implant weapons (Cybertechnology p.52, p.86–98; SSC p.86)
_Draft 2 (2026-11-19), approved after 2 Codex plan rounds. Roadmap item 5 leftover. Cybertechnology pairs 13 implants with a 0¥ weapon item that carries the
attack (`flags.sr2e.pairedWeapon` "ct:w-x" on the implant, `pairedWare` "ct:x" on the weapon). Foundry has no code for
the pair: the player drags in both. The app buys both together._

## Today
- Offered WITHOUT their weapon (a gap: no attack on the sheet): CyberSquirt, Oral Gun, Oral Dart, Eye Tool Laser,
  Eye Dart, Eye Gun.
- Refused ("needs its weapon"): the six cyberguns and the Cyberarm Taser (limb options of kind "weapon").
- The weapons alone are refused (no price: 0¥), which stays so.

## Catalog
`build-catalog` resolves each pair once: an implant entry gains `pairedWeaponId` (the weapon entry's catalog id), the
weapon entry `pairedWareId`. A pair that doesn't resolve fails the build (no silent half). The catalog check knows the
two fields.

## Creation
- `addItem` of an implant with `pairedWeaponId` adds BOTH records in one op: the implant, and the weapon record with
  `pairedTo: <implant record id>` (quantity 1, no choices the player can change; `setItem` on it is refused).
- `removeItem` of the implant removes its weapon; `removeItem` of the weapon is refused ("remove the implant").
- The weapon's list price is 0¥ (the implant carries the price and Essence).
- Cyberguns: a limb option of kind weapon. Built into a cyberlimb its Essence is 0; NOT built in (a natural limb or
  other body part) it costs the p.52 table's Essence — the system's `OUTSIDE_LIMB_ESSENCE` (`limbEssence`). So an
  unattached cybergun is legal (no "not attached" error; Foundry's model lists it as an orphan, the app reports it as a
  note). The Cyberarm Taser: in a cyberarm only (an error when not attached).
- Grades apply to the implant as any cyberware; the weapon has none.

## In play (M4b/M4c)
- `buyItem` of a paired implant adds both items (the implant a spare until surgery, the weapon beside it), one ledger
  entry recording both; undo removes both while both are unchanged.
- `sellItem` of the implant (a spare) sells its weapon with it (0¥); the weapon alone can't be sold. Undo restores both.
- Limb options stay creation-only (M5j), so a cybergun is not bought in play.

## Tests
Each of the 13 pairs resolves; buying an Oral Gun adds its weapon and the sheet shows its attack; removing it removes
both; the weapon alone can't be removed or changed; an unattached cybergun costs the table's Essence, attached 0; the
taser unattached is an error; play buy/undo/sell of an Oral Gun.

## Out of scope
Ammunition for implant guns (the weapon carries its internal rounds), firing rules (Foundry's).

## Draft 2 — changes after round 1 (these win)
Pages read 2026-11-19 (rendered): Cybertechnology p.52 (Cybergun Essence Costs: Hold-out .15, Light .35, Machine .4,
Submachine Gun .6, Heavy Pistol 1, Shotgun 1.1 — Foundry's `OUTSIDE_LIMB_ESSENCE` matches); SSC p.86 (the cybergun
series, "designed for installation in cyberarm"; no limit of one per limb).
- **Pair resolution (r1 #1):** `build-catalog` matches `pairedWeapon` "pkg:w-x" to the weapon whose `pairedWare` is
  "pkg:x", in the same package, requiring exactly one match each way; the implant gains `pairedWeaponId` (catalog id).
- **The browser (r1 #2):** buying a paired implant fetches the weapon entry too (the server's entry route returns
  `paired` beside the entry), so the client's optimistic reducer has both; the server's lookup has the whole catalog.
- **An instance link that survives export (r1 #3):** the weapon item carries `flags.sr2e.pairedItem` = its implant's
  item id (the projection writes it from `pairedTo`); play ops and the M7 import read the flag, not the records.
- **Play: two items in one transaction (r1 #4):** `buyItem` adds both (the weapon id is the next fresh id, its flag set),
  the ledger entry records both sources; undo compares both and removes both. `sellItem` of the implant sells its
  flagged weapon with it (0¥), recording both sources; selling the weapon alone is refused and the sale list hides it;
  undo restores both with their ids (refused if either id is taken).
- **Unattached cyberguns (r1 #5):** a limb option whose source is in the system's `OUTSIDE_LIMB_ESSENCE` (the six
  cyberguns) with NO link is placed in a natural limb: no error, a note ("in a natural limb: N Essence", p.52). A set
  link that doesn't resolve stays an error; the taser unattached is an error.
- **A spare's weapon (r1 #6):** derive leaves out a weapon whose `pairedItem` implant is uninstalled (or failed).
- **Rejected (r1 #7):** the p.52 table matches Foundry (the swapped values cited are a later edition's); SSC p.86 sets
  no one-per-limb limit.
