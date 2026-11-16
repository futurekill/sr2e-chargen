#!/usr/bin/env node
/**
 * The fixture catalog: a few INVENTED documents (no book content) shaped by the real builder. Used by the tests and
 * by the labelled test image (docs/PLAN-catalog.md §8). Run it again after changing the catalog's shape:
 *   node test/fixtures/make-catalog.mjs
 */
import { fileURLToPath } from "node:url";
import { assemble, writeCatalog } from "../../tools/build-catalog.mjs";

export const BOOKS = {
  sr2: { abbr: "SR2", title: "Shadowrun, Second Edition", code: "FASA 7901", module: "sr2e" },
  ssc: { abbr: "SSC", title: "Street Samurai Catalog", code: "FASA 7104", module: "sr2e-street-samurai-catalog" }
};
const id = (n) => `fixture${String(n).padStart(9, "0")}`;
const item = (n, pack, type, name, system, extra = {}) => ({ pack, path: `packs-src/${pack}/${name}.json`,
  doc: { _id: id(n), _key: `!items!${id(n)}`, name, type, img: "icons/svg/item-bag.svg", system, effects: [], flags: {}, ...extra } });
const folder = (n, pack, name, parent = null) => ({ pack, path: `packs-src/${pack}/_folder_${name}.json`,
  doc: { _id: id(n), _key: `!folders!${id(n)}`, name, type: "Item", folder: parent } });

export function fixtureRepos() {
  const core = { id: "sr2e", version: "9.9.9", tag: "v9.9.9", commit: "a".repeat(40),
    packs: [{ name: "weapons", label: "Weapons", type: "Item" }, { name: "gear", label: "Gear", type: "Item" }, { name: "contacts", label: "Contacts", type: "Item" },
      { name: "runners", label: "Archetypes", type: "Actor" }, { name: "vehicles", label: "Vehicles", type: "Actor" }, { name: "critters", label: "Critters", type: "Actor" }],
    docs: [
      folder(1, "weapons", "Firearms"), folder(2, "weapons", "Test Pistols", id(1)),
      item(10, "weapons", "weapon", "Test Pistol", { citation: { book: "sr2", page: "231" }, cost: 450, streetIndex: 0.5, availability: "3/24 hrs", damageCode: "9M", category: "pistol",
        notes: "<p>An <em>invented</em> pistol for the tests.</p><p>Second &amp; last line.</p>" }, { folder: id(2), flags: { sr2e: { rule: "test-rule", pairedWeapon: "x" }, other: { k: 1 } } }),
      item(11, "weapons", "weapon", "Catalog Blade", { citation: { book: "ssc", page: "12" }, cost: 800, damageCode: "(Str)M", notes: "From the other book, shipped in the core package." }),
      item(12, "gear", "gear", "Test Medkit", { citation: { book: "sr2", page: "250" }, cost: 200, availability: "4/48 hrs", notes: "" }),
      item(13, "gear", "gear", "Zebra Rope", { citation: { book: "sr2", page: "251" }, cost: 15 }),
      item(14, "contacts", "contact", "Test Fixer", { citation: { book: "none", page: "" }, contactType: "contact", description: "A contact with no printed source." }),
      { pack: "runners", path: "packs-src/runners/Test_Runner.json", doc: { _id: id(20), _key: `!actors!${id(20)}`, name: "Test Runner", type: "character",
        system: { race: "elf", biography: "<p>An invented archetype.</p>" }, flags: {},
        items: [{ _id: id(21), name: "Runner's Pistol", type: "weapon", system: { citation: { book: "sr2", page: "231" }, cost: 450, notes: "Embedded." }, effects: [], flags: {},
          _stats: { compendiumSource: `Compendium.sr2e.weapons.Item.${id(10)}` } },
        { _id: id(22), name: "Unsourced Knife", type: "weapon", system: { cost: 30 }, effects: [], flags: {} }] } },
      { pack: "vehicles", path: "packs-src/vehicles/Test_Van.json", doc: { _id: id(30), _key: `!actors!${id(30)}`, name: "Test Van", type: "vehicle",
        system: { citation: { book: "sr2", page: "260" }, cost: 30000, seating: "2 bucket + 1 bench", otherFeatures: "An invented feature list" }, flags: {}, items: [] } },
      { pack: "critters", path: "packs-src/critters/Test_Beast.json", doc: { _id: id(40), _key: `!actors!${id(40)}`, name: "Test Beast", type: "npc", system: {}, flags: {} } }
    ] };
  const ssc = { id: "sr2e-street-samurai-catalog", version: "1.0.0", tag: "v1.0.0", commit: "b".repeat(40), packs: [{ name: "ssc-weapons", label: "SSC Weapons", type: "Item" }],
    docs: [item(50, "ssc-weapons", "weapon", "Catalog Rifle", { citation: { book: "ssc", page: "20" }, cost: 1200, damageCode: "8S", notes: "No folders in this package." })] };
  return [core, ssc];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = writeCatalog(assemble(fixtureRepos(), BOOKS), fileURLToPath(new URL("./catalog/", import.meta.url)));
  console.log(`fixture catalog: ${m.entries} entries`);
}
