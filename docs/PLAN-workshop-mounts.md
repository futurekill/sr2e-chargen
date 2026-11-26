# Plan: weapons on a design's Rigger 2 mounts (Vehicle Workshop part 3)
_Round 3 — revised after Codex r3; APPROVED by Codex r4 (2026-11-26)_

## Goal
On a vehicle designed in the app (docs/PLAN-workshop.md), the player puts weapons on the Rigger 2 weapon mounts the
design has installed (fixed mounts, pintle, ring, turrets; R2 p.131–136), by the book's rules: which weapon fits which
mount, the Weapon Values a turret holds, the firearm conversion kit a personal firearm needs, the weapon's weight on a
fixed mount. The weapons are priced and exported with the vehicle, and Foundry's Workshop still reopens the export with
the same Design Points and price.

## Rules (rendered R2 pages 131–136, read 2026-11-26)
- p.131: hardpoint = 2 points, firmpoint = 1, total ≤ Body (already in the engine). "Heavy weapons (MMGs and larger)
  and vehicle weapons must be mounted on hardpoints. LMGs and small arms (assault rifles and smaller) can be mounted on
  firmpoints."
- p.131 Firearm Conversion Kits: required "for mounting any personal firearm, from pistols to man-portable heavy
  weapons, to fixed mounts or turrets"; NOT for pintle or ring mounts; NOT for "weapons specifically designed to be
  mounted on vehicles, such as the water cannon from SRII … or any of the vehicle weapons from this sourcebook". Design
  Cost by class: Pistol 1, SMG 1, Rifle/Shotgun/LMG 2, Heavy Weapons 3 (the R2 pack has these four as vehicle mods).
- p.131–132 Fixed mounts: one weapon each; external/internal hardpoint/firmpoint; Load Reduction "10 kg, plus weapon's
  weight (all cases)".
- p.133 Pintle: one firmpoint; "accept any firmpoint-sized weapon"; no kit.
- p.133–134 Ring: "count as a hardpoint and can mount any man-portable heavy weapon, as well as LMGs"; no kit.
- p.134–135 Turrets: "The weapon values of all weapons mounted on a turret may not exceed the turret's weapon value";
  Mini 2, Small 3, Medium 6 (Large 8, Extra-Large 10: not for runners, not in the pack). Pop-up: weapon value 1 lower.
  Anti-aircraft: same value. Remote turrets: Micro WV 1 (pop-up micro too); the other remote sizes print no value.
- Weapon Values Table (p.135): SMG 1, Microwave Designator 1, Rifle 1, Lt Machine Gun 1.5, Med Machine Gun 2, Hvy
  Machine Gun 2, AVM/AVR Launcher 2, Vindicator Minigun 2, Vanquisher/Vengeance Minigun 2.5, Assault Cannon 3,
  Autocannon 3, Vehicle Laser 3, Water Cannon 3, Ballista 4, Mortar 4, Outlaw 5.
- Missile/rocket mounts (p.133) are customization only in the pack (`designable: false`): out of scope.

## Approach

### 0. System (sr2e-foundryvtt, one release): `module/rules/vehicle-mounts-r2.mjs`, pure
1. `R2_MOUNTS`: by the R2 pack's mod document id (the mount mods have no `modKey`), each mount's
   `{ kind: "fixed" | "pintle" | "ring" | "turret", point, wv (turrets), kit (bool) }` for the 19 designable mount
   mods in the pack (fixed ×4, pintle, ring, turret / anti-aircraft / pop-up ×3 each, remote ×4). A vitest asserts the
   EXACT id set against the pack (every designable mod with mountPoints > 0) and each name.
2. `R2_WEAPON_CLASS`: an explicit table by weapon document id → class, for EVERY core-book firearm and heavy weapon and
   the mountable vehicle weapons (core: Autocannon, Vehicle Launcher, Water Cannon; R2: Vanquisher, Vengeance,
   Victory, Vigilant, Man-Portable Missile Launcher). Generated once from the core compendium folders (explicit
   vehicle-weapon ids win over folders: the core Autocannon sits in "Assault Cannons"), then written as literal data;
   a vitest pins it against the folders, so a moved weapon or a new one fails the build. Items are classed by
   its full SOURCE key `package.pack.docId`: `sourceKey(item)` = `flags.sr2e.catalogId` (already that form) or else
   `_stats.compendiumSource` (`Compendium.package.pack.Item.docId` → `package.pack.docId`); both parsed and validated
   (package and pack names, a 16-character id). The class and mount tables are keyed by that FULL key
   (`sr2e.weapons.…`, `sr2e-rigger-2.r2-vehicle-weapons.…`, `sr2e-rigger-2.r2-vehicle-mods.…`), so the same document
   id in another pack is never mistaken for one of them. Catalog entries and exported items alike.
   An explicit EXCLUSION set, pinned beside the class table: the six rockets/missiles (launcher ammunition) and the
   under-barrel grenade launcher (an accessory) are in the Heavy Weapons folders but are never mountable; the test
   fails when a core firearm/heavy weapon is in neither set.
   A class is `{ point, wv | null, kit: "pistol" | "smg" | "rifle" | "heavy" | null, manPortableHeavy }`. Other
   books' weapons have no class yet: not mountable in this part.
3. `mountProblems(items)` → `[{ code, msg, page }]`, the ONE check of a vehicle's mounted weapons, from its items:
   a weapon's `flags.sr2e.mountId` must name a mount item of the vehicle (by the mount's catalog id); the weapon's
   class must exist and fit (hardpoint/firmpoint, one weapon per fixed/pintle/ring mount, ring = man-portable heavy or
   LMG, pintle = firmpoint-sized, the turret's Weapon Value sum, no Weapon Value = no turret); every weapon that needs
   a kit has exactly one design-mod kit of its class with `flags.sr2e.kitFor` = the weapon's id; no kit is orphaned or
   of the wrong class.
4. `mountedWeaponLoad(items)` → kg: the weight of each weapon on a FIXED mount ("plus weapon's weight"). Transient
   capacity use, never stored Load. A weapon on a fixed mount with a missing, negative or non-finite weight is a
   `mountProblems` problem ("its weight isn't known"), never a silent 0. The two core weapons recorded at weight 0 are
   fixed in the pack first: Colt Manhunter 2.5, Ingram Smartgun 3 (core p.278–279, Sourcebook Updates, read from the
   rendered page 2026-11-26), pinned in the cost audit's table.
5. Engine: `designVehicle(design, tables, { mods, weaponLoad = 0 })` adds `weaponLoad` to the Load used (a
   `weaponLoad` that isn't a finite number ≥ 0 is a problem, `weaponLoad`, and the design is invalid — never coerced), and
   `VehicleData`'s capacity (the vehicle sheet) adds the same `mountedWeaponLoad(items)`: both default to 0, so every
   existing design and vehicle is unchanged.
6. The Foundry Workshop: `result()` checks the PROJECTED post-save item set — its staged mods (`this.mods`, which
   already hold additions and removals) plus the actor's current weapon items — through `mountProblems`, and passes
   `weaponLoad` from it; its Save refuses an invalid design, as now. Its Remove action refuses an occupied mount (and
   a kit whose weapon is still mounted), as the app does. It keeps each mod's identity: `#modFromItem` retains the
   item's `flags.sr2e.catalogId` and `_stats.compendiumSource`, and a mod added in the Workshop is created with
   `_stats.compendiumSource` = its compendium uuid, so `sourceKey` identifies Foundry-added mounts too.
7. Vitest pins every table row to the rendered pages.
8. Data fix in sr2e-rigger-2 (its own release): the four conversion kits all cost 150¥ in the pack; the book prints
   150 / 350 / 750 / 1,000¥ (Pistol / SMG / Rifle-Shotgun-LMG / Heavy, p.131).

### 1. App: the document
1. Ops: `mountDesignWeapon { catalogId, mountId }` (mountId = a design mount mod item's id) and `unmountWeapon`
   (part 1's op, extended to designs). The weapon item is a catalog snapshot with `flags.sr2e.mountId`, plus
   `flags.sr2e.mount` = the mount's point kind (the sheet row and part 1's readers already show it).
2. A personal firearm on a fixed mount or turret brings its conversion kit: the reducer adds the kit as a design mod
   item flagged `flags.sr2e.kitFor = <weapon item id>` in the same op, and removes it with the weapon. The player can't
   remove a kit by hand while its weapon is mounted. Kits are ordinary design mods to the engine and to Foundry, so the
   Design Points match there.
3. A mount that holds weapons can't be removed: unmount them first (no purchased item is ever deleted by a cascade).
   A kit can't be removed on its own; it goes with its weapon.
4. One design result (`designResult`) = the engine's (with `weaponLoad`) + `mountProblems`: the preview, the price,
   the purchase gate and the export all read it. A failing weapon stays, flagged, and the design is unfinished.
5. Only core-book and R2 weapons with a class (step 0.2) can be mounted; the picker lists them.

### 2. Price and purchase
- The DESIGN price (Design Points × Mark-Up, kits included as design mods) is the one that must equal Foundry's
  Workshop. Weapons, like cargo, are separate purchases the Workshop doesn't price: the app's total adds them.
- Weapons at their list price ("Weapons must be purchased separately", core p.251), not doubled: a RULING (wiki
  Rulings + app R20). The core book's "Adaptation of a weapon for a vehicle mount doubles its cost" (p.251) and Rigger
  2's Firearm Conversion Kit (p.131: "required for mounting any personal firearm") are two prices for the same
  adaptation; a Rigger 2 design pays Rigger 2's (the kit), never both.
- Books: a mounted weapon's cited book joins `vehicleBooks` (already: every item's book).

### 3. Client
The Design section's Modifications step lists each installed mount with what it holds and its capacity (WV used/total
for turrets), a weapon picker per mount (only weapons it accepts, with the reason for the others), and Remove. The
summary shows weapon load and the kits as DP lines (the engine already lists design mods).

### 4. Proof
- System vitest: the tables; `canMount` per mount kind; turret sums (Mini: LMG + ... over 2 refused); pop-up −1;
  kits per class; the engine's `weaponLoad` in the Load budget.
- App tests: mount, kit added and removed with the weapon, removing an occupied mount is REFUSED (mount, weapon and
  kit intact), removing a kit alone is refused, WV refusal, ring refusal of a
  vehicle weapon, pistol refused in a turret, price (list, no doubling), the whole exported actor.
- Live Foundry: import a design with a turret weapon and a fixed-mount rifle (kit): Workshop DP and price equal.

## Key decisions & tradeoffs
- **Rules in the system, keyed by document ids** (the mount mods have no `modKey`): one source of truth; the cost is
  an id table to maintain (pinned by a test that each id is in the R2 pack with its expected name).
- **Kits as auto-installed design mods**, not a hidden price line: Foundry's Workshop sees and prices them the same.
- **Weapon class from core folders + explicit ids**, not names: the catalog has no class field.
- **A hardpoint can't take a firmpoint weapon?** The book says what MUST go on hardpoints and what CAN go on
  firmpoints; it never says a hardpoint refuses a small arm. Proposed ruling: a fixed hardpoint takes any weapon a
  firmpoint takes too (the firmpoint is the cheaper option), so small arms are allowed on hardpoints.
- **Pistols and shotguns in turrets**: the Weapon Values Table lists neither. Ruling: not in turrets (no value to
  count); they go on fixed mounts (with a kit) or pintles.
- **Remote mini/small/medium turrets** (HOUSE RULING, labelled so): the book prints only the micro's value (1); they
  take the plain turrets' values (2 / 3 / 6), the sizes being the same names. Tested and listed as a house ruling.
- **No doubling under R2**: the conversion kit replaces the core book's adaptation.

## Risks / open questions
- The R2 Man-Portable Missile Launcher is shoulder-fired: a personal heavy weapon, so it needs the Heavy kit (p.131:
  "from pistols to man-portable heavy weapons"), Weapon Value 2 (AVM/AVR Launcher).
- Settled: the two zero weights are data errors (the book prints 2.5 and 3); fixed in step 0.4.
- Foundry play doesn't read `mountId` (no mount-based recoil yet); only the Workshop's load does.

## Out of scope
Missile/rocket mounts and munitions; Large/Extra-Large turrets; other books' weapons; smartlink integration and gyro
mods' links to a specific weapon; mount-based recoil in Foundry play; mounting on catalog (core) vehicles' R2 mounts.
