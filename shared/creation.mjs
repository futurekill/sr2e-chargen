/**
 * Character creation with the core Priority system (docs/PLAN-M2.md; rules: docs/RULES-CHARGEN.md, core pp.43–47).
 * Pure: the same code runs on the server (the authority) and in the browser (for a fast screen).
 *   - `newCharacter(name)` — a fresh character document body.
 *   - `applyOp(body, op, lookup)` — the next body, or throws a `Refusal` (an impossible change). `lookup(catalogId)`
 *     gives a catalog entry (the server's catalog; in the browser, the entries the page fetched from it).
 *   - `validate(body)` — the budgets and every problem, each with its page.
 * A character is the Foundry system's own `character` source shapes (`actor`), so the system's functions read it
 * unchanged; the app's own record sits beside it (`creation`).
 */
import { TABLES, ratedRow, BP_NUYEN_TIERS, SHAPESHIFTER_PRIORITIES, humanFormMod, shapeshifterOf, qualityAudit, qualityEffects, bonusAttributeCost, attributeEdgeViolations, qualityRule, overstressPenalty, wareRule, placementFacts, OUTSIDE_LIMB_ESSENCE, racialProfile, metavariantFrom, isMetavariantItem, ONI_SOURCE, chargenBudget, damageUpdateFor, surgeryCategory, surgeryEssencePct, surgeonTN, karmaTransition, advancementOptions, saleQuoteOf, streetPrice, ratedStreetIndex, startingMoney, startingKarmaPool, adeptPowerBudget, label, skillTiersFromAllocation, validateSkillAllocation } from "./rules.mjs";
import { defaultChoices, isRecorder, deviceReason, TOXIN_EXHALER, EXHALER_TOXINS, checkChoices, offerReason, RATING_UP_TO_BODY, project, price, eyeRow, essenceOf, isCybereye, powerKeyOf, sensesOf, limbTypeOf, optionKindOf, pricedItems, limbModelOf, bodyIndexOfItems } from "./purchase.mjs";
import { derive } from "./derive.mjs";

export const SCHEMA = "sr2e-chargen-character", SCHEMA_VERSION = 1;
export const CATEGORIES = ["race", "magic", "attributes", "skills", "resources"];
export const LETTERS = ["A", "B", "C", "D", "E"];
export const ATTRIBUTES = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];
/** The core book's metatypes (p.44–45); sourcebook metatypes arrive with the book toggles (milestone 5). */
export const METATYPES = ["human", "dwarf", "elf", "ork", "troll"];
/** Core magic: a full magician or a physical adept (p.45); the Grimoire's other adepts are milestone 5. */
export const MAGIC_TYPES = ["none", "full_magician", "physical_adept"];
export const TRADITIONS = ["hermetic", "shamanic"];
/** The core book's totems: the system's table less Mouse, which it notes the core book doesn't describe (review M2a #3). */
export const CORE_TOTEMS = Object.keys(TABLES.totems).filter(k => k !== "mouse");
/** Skills a player names (p.66: any skill of the Skills chapter): Knowledge, Language and Build/Repair skills. */
export const CUSTOM_SKILL_CATEGORIES = ["knowledge", "language", "build_repair"];
export const FREE_LANGUAGES = ["", "native", "dialect"];
/** The core magical skills (p.45): only from the catalog, where they carry `isMagical` (review M2b #4). */
const MAGICAL_SKILLS = ["sorcery", "conjuring"];
export const MAX_ITEMS = 500;
const CORE = "sr2";
const cite = (page) => ({ book: CORE, page: String(page) });

export class Refusal extends Error {
  constructor(message, page = null) { super(message); this.code = "refused"; this.cite = page ? cite(page) : null; }
}

/** A new character: nothing chosen yet, every attribute at 1, on the Streets, creation in progress. */
export function newCharacter(name) {
  const attrs = Object.fromEntries(ATTRIBUTES.map(a => [a, { base: 1 }]));
  return {
    schema: SCHEMA, schemaVersion: SCHEMA_VERSION, name: cleanName(name), notes: "",
    creation: { method: "priority", options: { moreMetahumans: false, books: [] }, finished: null, items: {}, nextItem: 1 },
    actor: {
      name: cleanName(name), type: "character",
      system: { race: "human", magic: { type: "none", tradition: "none", totem: "" }, ...attrs, lifestyle: "streets",
        chargen: { inProgress: true, priorityMethod: "standard", priorities: Object.fromEntries(CATEGORIES.map(c => [c, ""])) } },
      items: []
    }
  };
}
function cleanName(name) {
  const n = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!n || n.length > 120) throw new Refusal("A street name is 1 to 120 characters.");
  return n;
}

/* ── Operations ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** The operations and the fields each takes (the server's request schema is built from this). */
export const OPS = Object.freeze({
  setName: { name: "string" },
  setNotes: { notes: "string" },
  setOption: { key: "string", value: "boolean" },
  // Sourcebooks (docs/PLAN-M5a.md): what may be bought; metadata, allowed after finishing.
  setBooks: { books: "books" },
  setPriority: { category: "string", letter: "string" },
  setMethod: { method: "string" },
  setPoints: { buildingPoints: "integer", nuyenTier: "money", forcePointTrade: "integer", qualitiesUseBP: "boolean" },   // Companion p.20: "standard" or "sumto10" (Foundry's system.chargen.priorityMethod)
  setMetatype: { race: "string", variant: "string" },   // variant: a catalog race id, or "" (Companion p.39–44)
  setMagic: { type: "string" },
  setTradition: { tradition: "string" },
  setTotem: { totem: "string" },
  setAttribute: { attr: "string", base: "integer" },
  addSkill: { catalogId: "string" },
  addCustomSkill: { category: "string", name: "string" },
  setSkill: { itemId: "string", allocated: "integer", concentration: "string", specialization: "string", freeLanguage: "string" },
  removeSkill: { itemId: "string" },
  addItem: { catalogId: "string" },
  setItem: { itemId: "string", choices: "choices" },
  removeItem: { itemId: "string" },
  setCard: { itemId: "string", on: "boolean" },
  // M2d (docs/PLAN-M2d.md): gangs and followers, the allergy, finishing. A server roll is never a field (Draft 2).
  addExtra: { kind: "string", name: "string" },
  setExtra: { itemId: "string", archetypes: "archetypes" },
  setAllergy: { substance: "string", rarity: "string", severity: "string", rarityBonus: "string", severityBonus: "string" },
  finish: {},
  // Vehicles (docs/PLAN-S9-vehicles.md): the catalog's complete source is kept; the actor gets the system's receipt.
  addVehicle: { catalogId: "string" },
  removeVehicle: { vehicleId: "string" },
  // After creation (docs/PLAN-M4a.md): Karma, through the system's karmaTransition; every change is a ledger entry.
  awardKarma: { amount: "integer", note: "string" },
  spendKarma: { target: "karmaTarget" },
  undo: { entryId: "string" },
  // Nuyen after creation (docs/PLAN-M4b.md): buy, sell (the server's sale mode), income and expenses.
  buyItem: { catalogId: "string", choices: "choices", price: "money" },
  sellItem: { itemId: "string", pct: "integer", shownMode: "string", quoted: "money" },
  nuyen: { amount: "signedMoney", note: "string" },
  // Damage, ammunition and cybersurgery (docs/PLAN-M4c.md): wounds and rounds aren't ledger entries; surgery is.
  damage: { track: "string", boxes: "integer" },
  heal: { track: "string", boxes: "integer" },
  useAmmo: { itemId: "string", rounds: "integer" },
  installWare: { itemId: "string", successes: "integer", fee: "boolean", wound: "boolean" }
});
/** The ops a FINISHED character takes (besides name, notes, card). */
const PLAY_OPS = ["awardKarma", "spendKarma", "undo", "buyItem", "sellItem", "nuyen", "damage", "heal", "useAmmo", "installWare"];
/** What money buys and sells in play (PLAN-M4b Draft 2, r1 #3): property, not spells, foci, powers, contacts or homes. */
export const PLAY_GEAR = ["weapon", "armor", "gear", "ammo", "cyberware", "program"];
const MAX_MONEY = 10_000_000;
const MAX_VEHICLES = 20;
/** Ops the server must roll for (docs/PLAN-M2d.md Draft 2): how many D6, or 0. */
export const diceFor = (op) => (op?.op === "finish" ? 3 : op?.op === "addExtra" && op.kind === "gang" ? 2 : 0);
const ALLERGY = { rarity: ["uncommon", "common"], severity: ["nuisance", "mild", "moderate", "severe"], bonus: ["attributes", "skills", "force", "nuyen"] };
const NO_ALLERGY = { substance: "", rarity: "", severity: "", rarityBonus: "", severityBonus: "" };
/** The table card's sections (docs/PLAN-sheet.md slice 4): what it can show, all of it by default. */
export const CARD_TYPES = { weapon: "attacks", skill: "skills", cyberware: "cyberware", adept_power: "powers", spell: "spells" };
/** The item ids on the table card: the stored choice, or every item of the card's types (active skills only). */
/** What can go on the card: an item of the card's types; a skill only when it is an Active skill (card r1 #3). */
export const cardEligible = (i) => typeof i?.type === "string" && Object.hasOwn(CARD_TYPES, i.type) && (i.type !== "skill" || i.system?.category === "active");
export function cardIds(body) {
  const eligible = body.actor.items.filter(cardEligible).map(i => i._id);
  const chosen = body.creation.card;
  return Array.isArray(chosen) ? eligible.filter(id => chosen.includes(id)) : eligible;
}
const OPTIONS = ["moreMetahumans", "oniPriority"];   // oniPriority: Companion p.42, the GM's call

/**
 * Apply one operation. Refused only when it is impossible (an unknown value, a number outside what any character
 * could have); rules a player may break while building are reported by `validate`, never refused. A finished
 * character takes no creation operation (changes after creation are milestone 4's).
 */
export function applyOp(body, op, lookup = () => null, { roll = null, now = 0, saleMode = "refund", by = "", catalogBooks = [] } = {}) {
  if (!op || typeof op !== "object" || typeof op.op !== "string" || !Object.hasOwn(OPS, op.op)) throw new Refusal("Unknown operation.");
  if (body.creation.finished && !["setName", "setNotes", "setCard", "setBooks", ...PLAY_OPS].includes(op.op)) throw new Refusal("This character is finished: creation can't change it (use the Karma step).");
  const b = structuredClone(body), sys = b.actor.system;
  if (PLAY_OPS.includes(op.op)) return playOp(b, op, lookup, now, saleMode, by);
  // Name and notes are metadata: they never rebuild the items, so a finished character's data stays as finished (M2d r1 #2).
  if (op.op === "setName") { b.name = b.actor.name = cleanName(op.name); return b; }
  if (op.op === "setNotes") {
    if (typeof op.notes !== "string" || op.notes.length > 20000) throw new Refusal("Notes are at most 20,000 characters.");
    b.notes = op.notes; return b;
  }
  if (op.op === "setCard") {
    // A print choice only: it touches nothing else, so a finished character's data is never rebuilt by it (card r1 #1).
    if (typeof op.on !== "boolean") throw new Refusal("On or off.");
    const item = typeof op.itemId === "string" && /^[A-Za-z0-9]{16}$/.test(op.itemId) ? b.actor.items.find(i => i._id === op.itemId) : undefined;
    if (!item || !cardEligible(item)) throw new Refusal("That can't go on the table card.");
    const now = new Set(cardIds(b));
    if (op.on) now.add(item._id); else now.delete(item._id);
    b.creation.card = [...now];
    return b;
  }
  if (op.op === "setBooks") return setBooks(b, op, catalogBooks, lookup);   // metadata: never rebuilds the items (Draft 3)
  fillLegacyRecords(b);   // before the operation looks records up (r1 #2)
  switch (op.op) {
    case "setOption":
      if (!OPTIONS.includes(op.key) || typeof op.value !== "boolean") throw new Refusal("Unknown option.");
      b.creation.options[op.key] = op.value; break;
    case "setMethod":
      if (!["standard", "sumto10", "points"].includes(op.method)) throw new Refusal("Standard, sum-to-10 or point-based.", 20);
      if (op.method !== "standard" && !booksOf(b).includes("sc")) throw new Refusal("That method is the Shadowrun Companion's: turn it on first.", 20);
      sys.chargen.priorityMethod = op.method;
      // Foundry's schema initials (actor-data.mjs), which Foundry always holds and the system's budget reads: without them
      // a new point-based character showed 100 BP / 500¥ but the rules check said "Choose a nuyen tier".
      if (op.method === "points") Object.assign(sys.chargen, { buildingPoints: 100, nuyenTier: 500, forcePointTrade: 0, qualitiesUseBP: false,
        ...Object.fromEntries(["buildingPoints", "nuyenTier", "forcePointTrade", "qualitiesUseBP"].filter(k => sys.chargen[k] !== undefined).map(k => [k, sys.chargen[k]])) });
      break;
    case "setPoints": {   // point-based design's choices (Companion p.20–21; PLAN-M5h)
      const ch = sys.chargen, int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
      if (!int(op.buildingPoints, 1, 1000)) throw new Refusal("The allotment is 1 to 1,000 Building Points.", 20);
      if (!Object.hasOwn(BP_NUYEN_TIERS, String(op.nuyenTier))) throw new Refusal("A nuyen tier from the Building Points Table.", 20);
      if (!int(op.forcePointTrade, -15, 500)) throw new Refusal("Force Points traded: −15 to 500 Building Points.", 21);
      if (typeof op.qualitiesUseBP !== "boolean") throw new Refusal("On or off.");
      Object.assign(ch, { buildingPoints: op.buildingPoints, nuyenTier: op.nuyenTier, forcePointTrade: op.forcePointTrade, qualitiesUseBP: op.qualitiesUseBP });
      break;
    }
    case "setPriority": {
      if (!CATEGORIES.includes(op.category) || !["", ...LETTERS].includes(op.letter)) throw new Refusal("Unknown priority.", 44);
      // Each letter once (p.44): taking a letter another category holds SWAPS the two, so the table stays whole.
      // Under sum-to-10 letters may repeat (Companion p.20): no swap.
      const pr = sys.chargen.priorities, holder = sys.chargen.priorityMethod === "sumto10" ? null : CATEGORIES.find(c => c !== op.category && op.letter && pr[c] === op.letter);
      if (holder) pr[holder] = pr[op.category];
      pr[op.category] = op.letter;
      break;
    }
    case "setMetatype": {
      // A shapeshifter (Companion p.36–38, PLAN-M5c): the Companion's race entry names the species, and it is required.
      if (op.race === "shapeshifter") {
        const e = op.variant ? lookup(op.variant) : null;
        if (!(e && e.type === "race" && e.system?.raceKey === "shapeshifter" && e.system.species)) throw new Refusal("Choose the shapeshifter's species.", 36);
        if (!booksOf(b).includes(e.system.citation?.book ?? "sc")) throw new Refusal("That sourcebook isn't turned on for this character.");
        sys.race = "shapeshifter";
        sys.shapeshifter = { ...(sys.shapeshifter ?? {}), species: e.system.species, form: "human" };
        sys.metavariant = metavariantFrom({});
        sys.chargen.allergy = { ...NO_ALLERGY };   // allergy points are for metahumans (p.46)
        break;
      }
      if (!METATYPES.includes(op.race)) throw new Refusal("That isn't a core metatype.", 44);
      if (sys.shapeshifter) sys.shapeshifter = { ...sys.shapeshifter, species: "", form: "human" };
      // A metavariant (PLAN-M5b): a turned-on sourcebook's race entry of THIS metatype, written as Foundry's drop does.
      const v = op.variant ? lookup(op.variant) : null;
      if (op.variant && !(v && v.type === "race" && isMetavariantItem(v) && v.system.raceKey === op.race))
        throw new Refusal(`That isn't a variant of the ${op.race}.`);
      if (v && !booksOf(b).includes(v.system.citation.book)) throw new Refusal("That sourcebook isn't turned on for this character.");
      sys.metavariant = metavariantFrom(v ?? {});
      sys.race = op.race;
      if (op.race === "human") sys.chargen.allergy = { ...NO_ALLERGY };   // an allergy is for metahumans only (p.46)
      break;
    }
    case "setMagic":
      if (!MAGIC_TYPES.includes(op.type)) throw new Refusal("That isn't a core magic type.", 45);
      sys.magic.type = op.type;
      if (op.type !== "full_magician") { sys.magic.tradition = "none"; sys.magic.totem = ""; }   // only a magician has a tradition (p.44–45)
      if (op.type !== "full_magician" && sys.chargen.forcePointTrade) sys.chargen.forcePointTrade = 0;   // only a magician trades Force Points (M5h)
      break;
    case "setTradition":
      if (!["none", ...TRADITIONS].includes(op.tradition)) throw new Refusal("That isn't a tradition.", 44);
      if (op.tradition !== "none" && sys.magic.type !== "full_magician") throw new Refusal("Only a full magician has a tradition.", 44);
      sys.magic.tradition = op.tradition;
      if (op.tradition !== "shamanic") sys.magic.totem = "";
      break;
    case "setTotem":
      if (op.totem !== "" && !CORE_TOTEMS.includes(op.totem)) throw new Refusal("That isn't a core totem.", 119);
      if (op.totem !== "" && sys.magic.tradition !== "shamanic") throw new Refusal("Only a shaman has a totem.", 44);
      sys.magic.totem = op.totem; break;
    case "setAttribute":
      if (!ATTRIBUTES.includes(op.attr) || !Number.isInteger(op.base) || op.base < 1 || op.base > 12) throw new Refusal("An attribute is a whole number from 1 to 12.", 45);
      sys[op.attr] = { ...sys[op.attr], base: op.base }; break;
    case "addSkill": {
      const e = lookup(op.catalogId);
      if (!e || e.type !== "skill") throw new Refusal("That isn't a skill in the catalog.");
      if (e.book !== CORE) throw new Refusal("Only the core book's skills for now: sourcebooks arrive with the book toggles.");
      addRecord(b, { ...recordOf(e), choices: { allocated: 1, concentration: "", specialization: "", freeLanguage: "" } });
      break;
    }
    case "addCustomSkill": {
      if (!CUSTOM_SKILL_CATEGORIES.includes(op.category)) throw new Refusal("Name a Knowledge, Language or Build/Repair skill.", 66);
      const name = shortText(op.name, "A skill's name");
      if (!name) throw new Refusal("A skill needs a name.");
      if (MAGICAL_SKILLS.includes(name.toLowerCase())) throw new Refusal(`${name} is a magical Active skill: add it from the core list.`, 45);
      addRecord(b, { type: "skill", name, img: null, catalogId: null, source: null, flags: {},
        snapshot: { category: op.category, linkedAttribute: "intelligence", rating: 0, concentration: { name: "", rating: 0 }, specialization: { name: "", rating: 0 }, isMagical: false, notes: "" },
        choices: { allocated: 1, concentration: "", specialization: "", freeLanguage: "" } });
      break;
    }
    case "setSkill": {
      const rec = skillRecord(b, op.itemId);
      if (!Number.isInteger(op.allocated) || op.allocated < 0 || op.allocated > 12) throw new Refusal("A skill's points are a whole number from 0 to 12.", 45);
      if (!FREE_LANGUAGES.includes(op.freeLanguage)) throw new Refusal("Unknown free language.", 74);
      if (op.freeLanguage && rec.snapshot.category !== "language") throw new Refusal("Only a language can be free.", 74);
      const spec = shortText(op.specialization, "A specialization"), conc = shortText(op.concentration, "A concentration");
      if (spec && !conc) throw new Refusal("A specialization sits under a concentration: name the concentration too.", 70);
      if (op.freeLanguage && (conc || spec)) throw new Refusal("A free language has no concentration or specialization: buy the language to narrow it.", 74);
      rec.choices = { allocated: op.allocated, concentration: conc, specialization: spec, freeLanguage: op.freeLanguage };
      break;
    }
    case "removeSkill": {
      const id = ownId(b, op.itemId, r => r.type === "skill", "skill");
      delete b.creation.items[id];
      b.actor.items = b.actor.items.filter(i => i._id !== id);   // gone from the character too (unrecorded items are kept by the rebuild)
      break;
    }
    case "addItem": {
      const e = lookup(op.catalogId);
      if (!e) throw new Refusal("That isn't in the catalog.");
      if (e.type === "skill") throw new Refusal("Add a skill in the Skills step.");
      if (e.type === "cyberware" && sys.race === "shapeshifter") throw new Refusal("A shapeshifter's body rejects all cyberware (Companion p.38).");
      const why = offerReason(e, booksOf(b));
      if (why) throw new Refusal(why);
      const rec = recordOf(e);
      // One lifestyle (p.46): a new one replaces the old, in this one operation.
      if (rec.type === "lifestyle") for (const [k, r] of Object.entries(b.creation.items)) if (r.type === "lifestyle") { delete b.creation.items[k]; b.actor.items = b.actor.items.filter(i => i._id !== k); }
      // A power is bought once: Improved Ability once per skill (chosen after), Killing Hands once per level — an adept
      // may hold (Str)L and (Str)D (p.126).
      const once = (r) => (powerKeyOf(r) === "killing_hands" ? r.catalogId : powerKeyOf(r));
      if (rec.type === "adept_power" && powerKeyOf(rec) !== "improved_ability"
        && Object.values(b.creation.items).some(r => r.type === "adept_power" && once(r) === once(rec)))
        throw new Refusal(`${rec.name} is already bought: raise its level instead.`, 125);
      const added = addRecord(b, { ...rec, choices: defaultChoices(rec) });
      const w = pairedEntry(e, lookup);   // an implant weapon brings its weapon (PLAN-M5l): one op, both records
      if (w) { const wr = recordOf(w); addRecord(b, { ...wr, choices: defaultChoices(wr), pairedTo: added }); }
      break;
    }
    case "setItem": {
      const id = ownId(b, op.itemId, r => r.type !== "skill", "item");
      if (b.creation.items[id].pairedTo) throw new Refusal("This weapon is part of its implant: change the implant.");
      const rec = b.creation.items[id], checked = checkChoices(rec, op.choices);
      if (checked.reason) throw new Refusal(checked.reason);
      const into = checked.choices.in;
      if (into && into !== rec.choices.in) {   // an accessory goes only into a cybereye of this character (core p.247)
        const eye = Object.keys(b.creation.items).find(k => k === into);
        if (!eye || !isCybereye(b.creation.items[eye])) throw new Refusal("Place it in a cybereye of this character.");
      }
      const limb = checked.choices.limb;   // a cyberlimb option goes into a cyberlimb of THIS character (PLAN-M5j)
      if (limb !== undefined && limb !== (rec.choices.limb ?? "")) {
        if (limb && !(Object.hasOwn(b.creation.items, limb) && b.creation.items[limb].type === "cyberware" && limbTypeOf(b.creation.items[limb])))
          throw new Refusal("Build it into one of this character's cyberlimbs (Cybertechnology p.31).");
        // Recorded when it is attached, against the cyberware then held (Foundry's placement hook; Draft 2, r1 #3).
        const sib = b.actor.items.filter(i => i.type === "cyberware" && i._id !== id).map(i => ({ id: i._id, kind: i.system.limbOption ? optionKindOf(i) : null,
          linkedLimbId: i.system.linkedLimbId ?? "", limbType: limbTypeOf(i), side: i.system.side }));
        rec.placement = limb ? placementFacts(optionKindOf(rec), limb, sib) : { limbSurcharge: false, limbAdjacent: false };
      }
      const spell = checked.choices.spell;   // a specific spell focus bonds to a spell of THIS character (r1 #5)
      if (spell && !Object.keys(b.creation.items).some(k => k === spell && b.creation.items[k].type === "spell")) throw new Refusal("Bond it to one of this character's spells.", 137);
      const weapon = checked.choices.weapon;   // a weapon focus is one melee weapon of THIS character, one focus each (p.147)
      if (weapon && weapon !== rec.choices.weapon) {
        const w = Object.hasOwn(b.creation.items, weapon) ? b.creation.items[weapon] : null;
        if (w?.type !== "weapon" || w.snapshot?.weaponType !== "melee") throw new Refusal("Bond it to one of this character's melee weapons.", 137);
        if (w.choices?.quantity > 1) throw new Refusal("A focus is one weapon: buy that weapon with quantity 1.", 137);
        if (Object.entries(b.creation.items).some(([k, r]) => k !== id && r.choices?.weapon === weapon)) throw new Refusal("That weapon is already a focus.", 137);
      }
      const skill = rec.type === "adept_power" ? checked.choices.skill : null;   // Improved Ability: a skill of THIS character, once (p.125)
      if (skill && skill !== rec.choices.skill) {
        if (!Object.hasOwn(b.creation.items, skill) || b.creation.items[skill].type !== "skill") throw new Refusal("Choose one of this character's skills.", 125);
        if (Object.entries(b.creation.items).some(([k, r]) => k !== id && r.type === "adept_power" && r.choices?.skill === skill)) throw new Refusal("That skill already has Improved Ability: raise its dice instead.", 125);
      }
      const dev = checked.choices.device;   // a built-in device: one gear record of this character, built into one option (R15)
      if (dev && dev !== rec.choices.device) {
        const g = Object.hasOwn(b.creation.items, dev) ? b.creation.items[dev] : null, why = deviceReason(g);
        if (why) throw new Refusal(why);
        if (Object.entries(b.creation.items).some(([k, r]) => k !== id && r.choices?.device === dev)) throw new Refusal("That item is already built into a limb.");
      }
      const rs = isRecorder(rec) ? checked.choices.skill : null;   // a Reflex Recorder learns one ACTIVE skill of this character (p.27)
      if (rs && rs !== rec.choices.skill) {
        const sk = Object.hasOwn(b.creation.items, rs) ? b.creation.items[rs] : null;
        if (sk?.type !== "skill" || sk.snapshot?.category !== "active") throw new Refusal("Choose one of this character's Active skills (not Build/Repair, Knowledge or Language).");
      }
      rec.choices = checked.choices;
      break;
    }
    case "addVehicle": {   // p.46, p.264: bought at its list price; the whole source kept for the Foundry connector
      const e = lookup(op.catalogId);
      if (!e || e.type !== "vehicle") throw new Refusal("That isn't a vehicle in the catalog.");
      if (e.book !== CORE) throw new Refusal("Only the core book's vehicles for now: sourcebooks arrive with the book toggles.");
      if (!e.actorSource) throw new Refusal("This vehicle's full data isn't available on this server.");
      if (!(Number(e.actorSource.system?.cost) > 0)) throw new Refusal(`${e.name} has no list price (the book prints “Restricted”): it can't be bought at creation.`, 264);
      if (!b.creation.vehicles) { b.creation.vehicles = {}; b.creation.vehicleBase = structuredClone(sys.chargen.vehicles ?? []); }   // receipts the app didn't write stay (r1 #1)
      if (Object.keys(b.creation.vehicles).length >= MAX_VEHICLES) throw new Refusal(`A character buys at most ${MAX_VEHICLES} vehicles here.`);
      let n = b.creation.nextVehicle ?? 1;
      while (Object.hasOwn(b.creation.vehicles, vehicleKey(n))) n++;
      b.creation.vehicles[vehicleKey(n)] = { catalogId: e.id, uuid: e.uuid ?? "", source: structuredClone(e.actorSource) };
      b.creation.nextVehicle = n + 1;
      break;
    }
    case "removeVehicle": {
      if (typeof op.vehicleId !== "string" || !Object.hasOwn(b.creation.vehicles ?? {}, op.vehicleId)) throw new Refusal("No such vehicle on this character.");
      delete b.creation.vehicles[op.vehicleId];
      break;
    }
    case "addExtra": {   // a gang or tribe (p.44, members 2D6 rolled by the server) or followers (five archetypes)
      if (!["gang", "follower"].includes(op.kind)) throw new Refusal("An extra is a gang or tribe, or followers.", 44);
      const name = shortText(op.name, "A name");
      if (!name) throw new Refusal("Name the gang or the followers.", 44);
      const members = op.kind === "gang" ? Number(roll) : 0;
      if (op.kind === "gang" && !(Number.isInteger(members) && members >= 2 && members <= 12)) throw new Refusal("The server rolls the gang's members (2D6).", 44);
      addRecord(b, { type: "contact", name, img: null, catalogId: null, source: null, flags: {},
        snapshot: { contactType: op.kind, members, archetypes: [], loyalty: 1, influence: 1, notes: "" }, choices: {} });
      break;
    }
    case "setExtra": {
      const id = ownId(b, op.itemId, r => r.type === "contact" && r.snapshot?.contactType === "follower", "followers");
      if (!Array.isArray(op.archetypes) || op.archetypes.length > 5) throw new Refusal("Followers come from five archetypes.", 44);
      b.creation.items[id].choices = { archetypes: op.archetypes.map(a => shortText(a, "An archetype")) };
      break;
    }
    case "setAllergy": {   // p.46, metahumans only: every field from the system's own choices
      const a = {};
      for (const k of Object.keys(NO_ALLERGY)) {
        if (typeof op[k] !== "string") throw new Refusal("Allergy fields are text.", 46);
        a[k] = k === "substance" ? shortText(op[k], "The substance") : op[k];
      }
      const list = { rarity: ALLERGY.rarity, severity: ALLERGY.severity, rarityBonus: ALLERGY.bonus, severityBonus: ALLERGY.bonus };
      for (const [k, vs] of Object.entries(list)) if (a[k] && !vs.includes(a[k])) throw new Refusal("That isn't on the Allergy and Severity Table.", 46);
      if (["human", "shapeshifter"].includes(sys.race) && Object.values(a).some(Boolean)) throw new Refusal("Only a metahuman takes an allergy for points.", 46);
      sys.chargen.allergy = a;
      break;
    }
    case "finish": {   // p.47: a clean rules check; unspent Resources at 10:1 + 3D6 × 1,000¥; creation ends
      const dice = Number(roll);
      if (!(Number.isInteger(dice) && dice >= 3 && dice <= 18)) throw new Refusal("The server rolls the 3D6.", 47);
      rebuildItems(b);
      const v = validate(b);
      if (!v.finishable) throw new Refusal("Fix every error and to-do in the rules check first.", 47);
      const leftover = Math.max(0, v.budgets.resources.remaining);
      sys.nuyen = startingMoney(leftover, dice);
      sys.chargen.inProgress = false;
      // The ratings stay as finished: Foundry stops deriving them from the creation points (finalizePendingSkills).
      for (const i of b.actor.items) if (i.type === "skill") i.system.ratingsFinalized = true;
      b.actor.flags = { ...(b.actor.flags ?? {}), sr2e: { ...(b.actor.flags?.sr2e ?? {}), startingMoneyGranted: true } };   // Foundry never offers it again
      monitorOf(b);   // unwounded (PLAN-M4c Draft 2)
      b.creation.finished = { at: now, leftover, roll: dice, nuyen: sys.nuyen, karmaPool: startingKarmaPool(sys.race, !!b.creation.options.moreMetahumans),
        ...(v.budgets.buildingPoints ? { buildingPoints: v.budgets.buildingPoints.spent } : {}) };   // the sheet prints it after finishing
      return b;
    }
    case "removeItem": {
      const id = ownId(b, op.itemId, r => r.type !== "skill", "item");
      if (b.creation.items[id].pairedTo && Object.hasOwn(b.creation.items, b.creation.items[id].pairedTo)) throw new Refusal("This weapon is part of its implant: remove the implant.");
      const gone = new Set([id]);
      for (const [k, r] of Object.entries(b.creation.items)) if (r.pairedTo === id) gone.add(k);   // an implant's weapon goes with it (PLAN-M5l)
      for (const [k, r] of Object.entries(b.creation.items)) if (r.choices?.in === id) gone.add(k);   // its accessories go with an eye
      for (const r of Object.values(b.creation.items)) if (r.choices?.weapon === id) r.choices.weapon = "";   // its focus is unbonded
      for (const k of gone) delete b.creation.items[k];
      b.actor.items = b.actor.items.filter(i => !gone.has(i._id));
      break;
    }
  }
  rebuildItems(b);
  return b;
}

/* ── Items: the app's record beside each Foundry item source (docs/PLAN-M2.md §2) ──────────────────────────── */

const shortText = (v, what) => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (t.length > 60) throw new Refusal(`${what} is at most 60 characters.`);
  return t;
};
/**
 * A finished character (PLAN-M4a Draft 2, r1 #4): the creation checks (budgets, the racial maximum, the skill cap) no
 * longer apply. What stays true in play: Essence ≥ 0; an attribute above 1.5 × the racial maximum is discouraged
 * (p.190, a warning).
 */
function validateInPlay(body, add, problems) {
  const sys = body.actor.system, items = body.actor.items, mtype = sys.magic.type;
  // Only INSTALLED cyberware takes Essence: a spare bought in play waits for surgery (PLAN-M4b Draft 3, r2 #2).
  const essence = Math.round((6 - items.filter(i => i.type === "cyberware" && i.system.installed !== false).reduce((t, i) => t + essenceOf(i, items, sys.race), 0) - (mtype !== "none" ? bodyIndexOf(items) : 0)) * 1000) / 1000;
  const magic = mtype === "none" ? 0 : Math.max(0, Math.min(6, Math.floor(essence + 1e-9)));
  if (essence < 0) add("resources", "error", `Essence is ${essence}.`, 46);
  wareWarnings(items, add);
  limbChecks(body.actor, add, false);
  // Overstress stays a warning in play too (Shadowtech p.6; code review M5e r1 #2).
  const bodyMax = withRacial(sys, "body", items) + formMod(sys, "body"), over = overstressPenalty(bodyIndexOf(items), bodyMax);
  if (over) add("resources", "warning", `Body Index ${Math.round(bodyIndexOf(items) * 1000) / 1000} is over the Body of ${bodyMax}: overstress, +${over} to Body tests.`, 6, "st");
  const max = racialProfile(sys, TABLES).maxes;
  for (const a of ATTRIBUTES) if (withRacial(sys, a, items) > 1.5 * max[a]) add("karma", "warning", `${ATTR_NAMES[a]} ${withRacial(sys, a, items)} is beyond 1.5 × the racial maximum: the book discourages it.`, 190);
  const budgets = {};
  if (mtype === "physical_adept") {   // a lost Magic point costs one point of improvements (p.126): still reported
    const pb = adeptPowerBudget({ items, maxes: max, natural: Object.fromEntries(["body", "quickness", "strength"].map(a => [a, withRacial(sys, a, items) + formMod(sys, a)])), magic });
    budgets.powerPoints = { spent: pb.used, total: magic, over: pb.used > magic, costs: pb.costs };
    if (pb.used > magic) add("magic", "error", `${pb.used} power points used; the Magic Rating gives ${magic}: give up improvements to match.`, 126);
  }
  return { budgets, essence, magic, problems, finishable: false };
}

/* ── After creation: Karma (docs/PLAN-M4a.md) ───────────────────────────────────────────────────────────────── */

/** The context the system's Karma transition prices with: bought + racial rating; after creation no clamp (p.192). */
export function karmaContext(body) {
  const sys = body.actor.system, items = body.actor.items, max = racialProfile(sys, TABLES).maxes, attributes = {};
  for (const a of ATTRIBUTES) { const natural = withRacial(sys, a, items); attributes[a] = { natural, next: natural + 1, overMax: natural + 1 > max[a] + edgeMax(items, a), stuck: false }; }
  return { moreMetahumans: !!body.creation.options.moreMetahumans, race: sys.race, attributes };
}
/** The actor as the transition reads it. */
export const karmaSource = (body) => ({ system: body.actor.system, items: body.actor.items });
/** Every advancement this character can buy now, with its price (the system's own list). */
export const karmaOptions = (body) => advancementOptions(karmaSource(body), karmaContext(body));
const setPath = (obj, path, v) => { const ks = path.split("."); let o = obj; for (const k of ks.slice(0, -1)) o = o[k] ??= {}; o[ks.at(-1)] = v; };
/** The latest entry that can be undone: an ORIGINAL (not an undo) not yet undone (PLAN-M4a Draft 3). */
export const undoable = (body) => [...(body.ledger ?? [])].reverse().find(e => !e.undoes && !e.undoneBy) ?? null;

const sameJson = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const nuyenOf = (b) => Math.max(0, Number(b.actor.system.nuyen) || 0);
/** A fresh item id that no item (ours or a foreign one) and no creation record holds. */
function freshItemId(b) {
  const taken = new Set(b.actor.items.map(i => i._id));
  let n = b.creation.nextItem ?? 1;
  while (taken.has(itemId(n)) || Object.hasOwn(b.creation.items, itemId(n))) n++;
  b.creation.nextItem = n + 1;
  return itemId(n);
}
/** Append a ledger entry (who did it is the library's revision; `shown` = what the screen offered). */
function ledgerAdd(b, now, entry) {
  b.ledger ??= [];
  const id = `k${String(b.ledger.length + 1).padStart(5, "0")}`;
  b.ledger.push({ id, at: now, by: LEDGER_BY.value, note: "", ...entry });
  if (entry.undoes) b.ledger.find(e => e.id === entry.undoes).undoneBy = id;
  return id;
}

/** Who is making the change (the server's signed-in handle; PLAN-M4b Draft 2's audit), set for one playOp call. */
const LEDGER_BY = { value: "" };
function playOp(b, op, lookup, now, saleMode, by = "") {
  LEDGER_BY.value = typeof by === "string" ? by.slice(0, 32) : "";
  if (!b.creation.finished) throw new Refusal("Karma and money after creation start once the character is finished.", 190);
  if (op.op === "buyItem" || op.op === "sellItem" || op.op === "nuyen") return moneyOp(b, op, lookup, now, saleMode);
  if (op.op === "damage" || op.op === "heal") return woundOp(b, op);
  if (op.op === "useAmmo") return ammoOp(b, op);
  if (op.op === "installWare") return surgeryOp(b, op, now);
  if (op.op === "undo") {
    const e = undoable(b);
    if (!e || e.id !== op.entryId) throw new Refusal("Only the latest change that isn't undone can be undone.");
    if (["buy", "sell", "nuyen"].includes(e.kind)) return undoMoney(b, e, now);
    if (e.kind === "surgery") return undoSurgery(b, e, now);
  }
  const source = karmaSource(b), ctx = karmaContext(b);
  let action, note = "", undoes = null;
  if (op.op === "awardKarma") { action = { award: op.amount }; note = shortText(op.note ?? "", "A note"); }
  else if (op.op === "undo") { const e = undoable(b); action = { revert: e.record }; undoes = e.id; }
  else {
    const t = op.target && typeof op.target === "object" ? { ...op.target } : {};
    if (typeof t.newSkill === "string") {   // a core skill from the catalog, or a named Knowledge/Language skill
      const e = lookup(t.newSkill);
      if (!e || e.type !== "skill" || e.book !== CORE) throw new Refusal("That isn't a core skill.");
      t.newSkill = { type: "skill", name: e.name, img: e.img ?? null, system: structuredClone(e.system), flags: {}, effects: [], _stats: { compendiumSource: e._stats?.compendiumSource ?? null } };
    } else if (t.newCustomSkill) {
      const { category, name } = t.newCustomSkill;
      if (!CUSTOM_SKILL_CATEGORIES.includes(category)) throw new Refusal("Name a Knowledge, Language or Build/Repair skill.", 66);
      const n = shortText(name, "A skill's name");
      if (!n) throw new Refusal("A skill needs a name.");
      t.newSkill = { type: "skill", name: n, img: null, flags: {}, effects: [], _stats: { compendiumSource: null },
        system: { category, linkedAttribute: "intelligence", rating: 0, concentration: { name: "", rating: 0 }, specialization: { name: "", rating: 0 }, isMagical: false, notes: "" } };
      delete t.newCustomSkill;
    }
    if (t.newSkill) t.newId = freshItemId(b);
    action = { advance: t };
  }
  const r = karmaTransition(source, action, ctx);
  if (!r.ok) throw new Refusal(r.reason, 190);
  const rec = r.record;
  // Apply the AFTER values (an undo's record is already inverted).
  for (const [path, [, after]] of Object.entries(rec.actor)) setPath(b.actor, path, after);
  for (const it of rec.items) { const item = b.actor.items.find(i => i._id === it._id); for (const [path, [, after]] of Object.entries(it.set)) setPath(item, path, after); }
  if (rec.create) b.actor.items.push({ effects: [], flags: {}, ...rec.create });
  if (rec.remove) b.actor.items = b.actor.items.filter(i => i._id !== rec.remove);
  ledgerAdd(b, now, { kind: rec.kind, summary: rec.summary, note, record: rec, ...(undoes ? { undoes } : {}) });
  return b;
}

/** Nuyen after creation (PLAN-M4b, R6/R7): every change a typed ledger entry with its own inverse. */
function moneyOp(b, op, lookup, now, saleMode) {
  const money = (v, lo, hi, what) => { if (!Number.isInteger(v) || v < lo || v > hi) throw new Refusal(`${what} is a whole number of nuyen from ${lo.toLocaleString("en-US")} to ${hi.toLocaleString("en-US")}.`); return v; };
  const sys = b.actor.system, have = nuyenOf(b), yen = (n) => `${n.toLocaleString("en-US")}¥`;
  if (op.op === "nuyen") {
    const amount = money(op.amount, -MAX_MONEY, MAX_MONEY, "An amount");
    if (amount === 0) throw new Refusal("An amount other than 0.");
    if (have + amount < 0) throw new Refusal(`Only ${yen(have)} to spend.`);
    sys.nuyen = have + amount;
    ledgerAdd(b, now, { kind: "nuyen", summary: amount > 0 ? `Received ${yen(amount)}` : `Paid ${yen(-amount)}`, note: shortText(op.note ?? "", "A note"), record: { amount } });
    return b;
  }
  if (op.op === "buyItem") {   // p.184, R7: the street price shown; the price agreed entered by the player
    const e = lookup(op.catalogId);
    if (!e || !PLAY_GEAR.includes(e.type)) throw new Refusal("In play, money buys weapons, armor, gear, ammunition, cyberware and programs.");
    const why = offerReason(e, booksOf(b), { inPlay: true });   // the books turned on; no fixed price… as at creation (M4b r1 #1)
    if (why) throw new Refusal(why);
    const rec = recordOf(e), checked = checkChoices(rec, { ...defaultChoices(rec, { inPlay: true }), ...(op.choices ?? {}) }, { inPlay: true });
    if (checked.reason) throw new Refusal(checked.reason);
    if (checked.choices.side === "") throw new Refusal(`${rec.name}: choose its side, left or right (Cybertechnology p.30).`);   // M5j r1 #2
    const price = money(op.price, 0, MAX_MONEY, "A price");
    if (price > have) throw new Refusal(`${yen(price)} needed, ${yen(have)} to spend.`);
    const projected = project(rec, checked.choices, b.creation.items), s = projected.system;
    if (rec.type === "cyberware") s.installed = false;   // a spare until surgery (M4c, p.115–116)
    const street = streetOf(rec, projected, b.actor.items);
    const id = freshItemId(b);
    const flags = { ...projected.flags, sr2e: { ...(projected.flags.sr2e ?? {}), paid: price, ...(rec.type === "ammo" ? { acquiredQuantity: s.quantity } : {}) } };
    const item = { _id: id, name: rec.name, type: rec.type, img: rec.img, system: s, flags, effects: [], _stats: { compendiumSource: rec.source } };
    b.actor.items.push(item);
    // An implant weapon brings its 0¥ weapon, linked by flag (PLAN-M5l Draft 2): both in this one ledger entry.
    const w = pairedEntry(e, lookup);
    let paired = null;
    if (w) {
      const wid = freshItemId(b), wr = recordOf(w), wp = project(wr, defaultChoices(wr, { inPlay: true }), b.creation.items);
      const witem = { _id: wid, name: w.name, type: "weapon", img: wr.img, system: wp.system, flags: { ...wp.flags, sr2e: { ...(wp.flags.sr2e ?? {}), pairedItem: id } }, effects: [], _stats: { compendiumSource: wr.source } };
      b.actor.items.push(witem);
      paired = { itemId: wid, source: structuredClone(witem) };
    }
    sys.nuyen = have - price;
    ledgerAdd(b, now, { kind: "buy", summary: `Bought ${rec.name} for ${yen(price)} (street price ${yen(street)})`, record: { itemId: id, source: structuredClone(item), price, street, ...(paired ? { paired } : {}) } });
    return b;
  }
  // sellItem (p.188, R6): the server's sale mode; the client's quote must match it.
  const item = typeof op.itemId === "string" ? b.actor.items.find(i => i._id === op.itemId) : null;
  if (!item || !PLAY_GEAR.includes(item.type)) throw new Refusal("That isn't something to sell.");
  const owner = item.flags?.sr2e?.pairedItem;   // an implant weapon goes with its implant (PLAN-M5l)
  if (owner && b.actor.items.some(i => i._id === owner)) throw new Refusal("This weapon is part of its implant: sell the implant.");
  const pairedWeapon = b.actor.items.find(i => i.type === "weapon" && i.flags?.sr2e?.pairedItem === item._id) ?? null;
  if (item.type === "cyberware" && item.system.installed !== false) throw new Refusal("Installed cyberware comes out by surgery, not a sale.", 114);
  if (op.shownMode !== saleMode) throw new Refusal("The GM changed how selling works: look at the price again.");
  if (saleMode === "fence" && op.pct == null) throw new Refusal("A fence sale needs the agreed percentage.", 188);
  const priced = pricedItems(b.actor.items);   // a limb option at its placement price (M5j r1 #3)
  const q = saleQuoteOf(priced.find(i => i._id === item._id), { mode: saleMode, pct: op.pct ?? 30, items: priced });
  if (q.price == null) throw new Refusal("A fence pays 10–50%, in steps of 5 (p.188).", 188);
  if (q.price !== op.quoted) throw new Refusal("The price changed: sell again to see the new one.");
  b.actor.items = b.actor.items.filter(i => i._id !== item._id && i._id !== pairedWeapon?._id);
  sys.nuyen = have + q.price;
  ledgerAdd(b, now, { kind: "sell", summary: `Sold ${item.name} for ${yen(q.price)}${saleMode === "fence" ? ` (a fence, ${op.pct}%)` : " (refund)"}`,
    record: { source: structuredClone(item), price: q.price, mode: saleMode, pct: saleMode === "fence" ? op.pct : null, ...(pairedWeapon ? { pairedSource: structuredClone(pairedWeapon) } : {}) } });
  return b;
}
/** The street price shown for a purchase (p.184): list × the rating's Street Index. */
function streetOf(rec, projected, items) {
  const s = projected.system, list = price(rec, projected, items);
  return Math.round(streetPrice(list, ratedStreetIndex(s.ratingStats, s.rating, s.streetIndex)));
}
/** Undo a money entry (PLAN-M4b Draft 2, r1 #9): its own inverse, only while it is still exact. */
function undoMoney(b, e, now) {
  const sys = b.actor.system, have = nuyenOf(b), r = e.record;
  if (e.kind === "nuyen") {
    if (have - r.amount < 0) throw new Refusal("That money is already spent: undo the later change first.");
    sys.nuyen = have - r.amount;
  } else if (e.kind === "buy") {
    const item = b.actor.items.find(i => i._id === r.itemId), w = r.paired ? b.actor.items.find(i => i._id === r.paired.itemId) : null;
    if (!item || !sameJson(item, r.source) || (r.paired && (!w || !sameJson(w, r.paired.source)))) throw new Refusal("The item has changed since it was bought: that can't be undone now.");
    b.actor.items = b.actor.items.filter(i => i._id !== r.itemId && i._id !== r.paired?.itemId);
    sys.nuyen = have + r.price;
  } else {
    if (have < r.price) throw new Refusal("That money is already spent: undo the later change first.");
    const book = r.source.system?.citation?.book;
    if (book && book !== CORE && !booksOf(b).includes(book)) throw new Refusal("That item's sourcebook is turned off: turn it back on first.");   // M5a r1 #10
    const back = structuredClone(r.source);
    if (r.pairedSource) {   // an implant and its weapon come back together, with their ids (the link names them; PLAN-M5l)
      if (b.actor.items.some(i => i._id === back._id || i._id === r.pairedSource._id)) throw new Refusal("Something else holds that implant's place now: that can't be undone.");
      b.actor.items.push(back, structuredClone(r.pairedSource));
    } else {
      if (b.actor.items.some(i => i._id === back._id)) back._id = freshItemId(b);
      b.actor.items.push(back);
    }
    sys.nuyen = have - r.price;
  }
  ledgerAdd(b, now, { kind: "revert", summary: `Undone: ${e.summary}`, record: { of: e.kind }, undoes: e.id });
  return b;
}

/* ── Sourcebooks (docs/PLAN-M5a.md) ───────────────────────────────────────────────────────────────────────── */

/** The sourcebooks turned on for this character (core is always on, never listed). */
export const booksOf = (b) => b.creation.options.books ?? [];
/** Every sourcebook something on the character comes from: creation records, items, vehicles. */
function booksInUse(b, lookup) {
  const used = new Set();
  // After finishing the actor is the authority: a record whose item was sold no longer holds its book (code r1 #1).
  if (!b.creation.finished) for (const r of Object.values(b.creation.items ?? {})) used.add(lookup(r.catalogId)?.book ?? r.snapshot?.citation?.book);
  for (const i of b.actor.items ?? []) used.add(i.system?.citation?.book);
  for (const v of Object.values(b.creation.vehicles ?? {})) used.add(v.source?.system?.citation?.book);
  if (b.actor.system.metavariant?.name) used.add(b.actor.system.metavariant.book);   // PLAN-M5b r1 #6
  if (b.actor.system.race === "shapeshifter") used.add("sc");   // PLAN-M5c r1 #5
  if (["sumto10", "points"].includes(b.actor.system.chargen?.priorityMethod)) used.add("sc");   // sum-to-10 is the Companion's (M5g)
  // A graded implant keeps the Street Samurai Catalog in use (PLAN-M5f Draft 2).
  const graded = b.creation.finished ? (b.actor.items ?? []).filter(i => i.type === "cyberware").map(i => i.system?.grade)
    : Object.values(b.creation.items ?? {}).filter(r => r.type === "cyberware").map(r => r.choices?.grade);
  if (graded.some(g => g === "alpha" || g === "beta")) used.add("ssc");
  if (graded.includes("delta")) used.add("ct");   // delta is Cybertechnology's (p.44)
  used.delete(CORE); used.delete(undefined); used.delete(null);
  return used;
}
function setBooks(b, op, catalogBooks, lookup) {
  const list = op.books;
  if (!Array.isArray(list) || list.length > 20 || new Set(list).size !== list.length) throw new Refusal("A list of different sourcebooks.");
  for (const k of list) if (typeof k !== "string" || k === CORE || !catalogBooks.includes(k)) throw new Refusal("That isn't a sourcebook in the catalog.");
  const off = booksOf(b).filter(k => !list.includes(k)), used = booksInUse(b, lookup);
  const busy = off.filter(k => used.has(k));
  if (busy.length) throw new Refusal(`Something on the character comes from ${busy.join(", ")}: remove or sell it first.`);
  b.creation.options.books = [...list].sort();
  return b;
}

/* ── Damage, ammunition, cybersurgery (docs/PLAN-M4c.md) ───────────────────────────────────────────────────── */

const TRACKS = ["physical", "stun"];
const boxesOf = (n, what) => { if (!Number.isInteger(n) || n < 1 || n > 20) throw new Refusal(`${what} is 1 to 20 boxes.`, 112); return n; };
/** The character's condition monitors, in Foundry's shape; created unwounded when missing (finished before M4c). */
export function monitorOf(b) {
  const sys = b.actor.system, box = () => ({ value: 0, max: 10, overflow: 0 });
  const cm = sys.conditionMonitor ??= {};
  cm.physical ??= box(); cm.stun ??= box(); cm.overflow ??= 0;
  return cm;
}
/** Wounds (p.112): Stun past its monitor rolls into Physical, Physical past its monitor into overflow. Healing takes the overflow first. */
function woundOp(b, op) {
  if (!TRACKS.includes(op.track)) throw new Refusal("Physical or Stun.", 112);
  const n = boxesOf(op.boxes, op.op === "damage" ? "Damage" : "Healing"), cm = monitorOf(b);
  if (op.op === "damage") {
    const o = damageUpdateFor(cm, op.track, n);
    cm.physical.value = o.physical; cm.stun.value = o.stun; cm.overflow = o.overflow;
  } else if (op.track === "stun") cm.stun.value = Math.max(0, cm.stun.value - n);
  else {
    const off = Math.min(cm.overflow, n);
    cm.overflow -= off;
    cm.physical.value = Math.max(0, cm.physical.value - (n - off));
  }
  return b;
}
/** Rounds fired or lost from a box of ammunition; more is bought on the Nuyen step. */
function ammoOp(b, op) {
  const item = typeof op.itemId === "string" ? b.actor.items.find(i => i._id === op.itemId) : null;
  if (!item || item.type !== "ammo") throw new Refusal("That isn't ammunition.");
  if (!Number.isInteger(op.rounds) || op.rounds < 1 || op.rounds > 1000) throw new Refusal("1 to 1,000 rounds.");
  const left = Number(item.system.quantity) || 0;
  if (op.rounds > left) throw new Refusal(`Only ${left} left.`);
  item.system.quantity = left - op.rounds;
  return b;
}
const round2 = (x) => Math.round(x * 100) / 100;
/**
 * What installing a spare would do (Cybertechnology p.53, core p.114; Foundry's `_surgeryPreview`): every number from
 * the whole inventory with the implant in, so a limb changing muscle's Essence counts (Draft 2).
 */
export function surgeryPreview(body, itemId, successes = 2) {
  const items = body.actor.items, item = items.find(i => i._id === itemId);
  if (!item || item.type !== "cyberware" || item.system.installed !== false) return null;
  const pct = surgeryEssencePct(successes);
  const at = (p) => {
    const cand = { ...item, system: { ...item.system, installed: true, surgeryEssencePct: p } };
    const after = items.map(i => (i._id === itemId ? cand : i));
    const total = after.filter(i => i.type === "cyberware" && i.system.installed !== false).reduce((t, i) => t + essenceOf(i, after, body.actor.system.race), 0);
    return { cost: essenceOf(cand, after, body.actor.system.race), end: round2(6 - total) };
  };
  const plain = at(0), now = at(pct);   // the TN from the Essence it ends with at 0%: its own result can't move it
  return { pct, cost: now.cost, end: now.end, tn: surgeonTN(plain.end), category: surgeryCategory(now.cost) };
}
function surgeryOp(b, op, now) {
  const item = typeof op.itemId === "string" ? b.actor.items.find(i => i._id === op.itemId) : null;
  if (!item || item.type !== "cyberware" || item.system.installed !== false) throw new Refusal("That isn't a spare implant.");
  if (b.actor.system.race === "shapeshifter") throw new Refusal("A shapeshifter's body rejects all cyberware (Companion p.38).");
  if (!Number.isInteger(op.successes) || op.successes < 0 || op.successes > 30) throw new Refusal("The surgeon's successes: 0 to 30.");
  const pv = surgeryPreview(b, item._id, op.successes), have = nuyenOf(b), yen = (n) => `${n.toLocaleString("en-US")}¥`;
  if (pv.end < 0) throw new Refusal("The surgery would leave the character below 0 Essence: it's aborted (Cybertechnology p.53).", 114);
  const fee = op.fee === false ? 0 : pv.category.fee;
  if (fee > have) throw new Refusal(`${yen(fee)} needed for the surgery, ${yen(have)} to spend.`);
  const had = b.actor.system.conditionMonitor ? structuredClone(b.actor.system.conditionMonitor) : null;   // none: finished before M4c
  const cm = monitorOf(b), before = { item: structuredClone(item), monitor: had };
  item.system.installed = true;
  item.system.surgeryEssencePct = pv.pct;
  b.actor.system.nuyen = have - fee;
  if (op.wound !== false) { const o = damageUpdateFor(cm, "physical", pv.category.boxes); cm.physical.value = o.physical; cm.overflow = o.overflow; }
  const pctText = pv.pct ? ` (${pv.pct > 0 ? "+" : ""}${pv.pct}%)` : "";
  ledgerAdd(b, now, { kind: "surgery", summary: `Installed ${item.name}: ${pv.category.label} surgery, Essence ${pv.cost}${pctText}${fee ? `, ${yen(fee)}` : ""}${op.wound !== false ? `, a ${pv.category.wound} wound` : ""}`,
    record: { itemId: item._id, fee, before, after: { item: structuredClone(item), monitor: structuredClone(cm) } } });
  return b;
}
/** Undo a surgery (Draft 2, r1 #5): only while the implant and the monitors are exactly as it left them. */
function undoSurgery(b, e, now) {
  const r = e.record, at = b.actor.items.findIndex(i => i._id === r.itemId);
  if (at < 0 || !sameJson(b.actor.items[at], r.after.item) || !sameJson(monitorOf(b), r.after.monitor))
    throw new Refusal("The implant or the wounds changed since the surgery: that can't be undone now.");
  b.actor.items[at] = structuredClone(r.before.item);
  if (r.before.monitor) b.actor.system.conditionMonitor = structuredClone(r.before.monitor);
  else delete b.actor.system.conditionMonitor;   // exactly as it was (code review r1)
  b.actor.system.nuyen = nuyenOf(b) + r.fee;
  ledgerAdd(b, now, { kind: "revert", summary: `Undone: ${e.summary}`, record: { of: e.kind }, undoes: e.id });
  return b;
}

/** A vehicle's key in `creation.vehicles`: fixed width, so the order survives a database that sorts JSON keys. */
const vehicleKey = (n) => `v${n.toString(36).padStart(5, "0")}`;
/** A Foundry-shaped id (16 letters and digits), the same on the server and in the browser: a counter, not a random. */
const itemId = (n) => `cg${n.toString(36).padStart(14, "0")}`;
/**
 * The app's record of each bought thing is `creation.items[id] = { type, name, img, source, flags, catalogId,
 * snapshot, choices }`; `actor.items` is REGENERATED from the records after every operation (rebuildItems), in id
 * order (ids are fixed-width, so the order survives a database that sorts JSON keys).
 */
function addRecord(b, rec) {
  if (Object.keys(b.creation.items).length >= MAX_ITEMS) throw new Refusal(`A character holds at most ${MAX_ITEMS} items.`);
  // Never an id an existing item already has (a Foundry item could carry one of ours by chance, card r1 #4).
  const taken = new Set(b.actor.items.map(i => i._id));
  let n = b.creation.nextItem ?? 1;
  while (Object.hasOwn(b.creation.items, itemId(n)) || taken.has(itemId(n))) n++;
  b.creation.nextItem = n + 1;
  b.creation.items[itemId(n)] = { ...rec, snapshot: structuredClone(rec.snapshot), flags: structuredClone(rec.flags ?? {}) };
  return itemId(n);
}
/** An implant weapon's 0¥ weapon entry (PLAN-M5l), or null; refused when the catalog lacks it. */
function pairedEntry(e, lookup) {
  if (!e.pairedWeaponId) return null;
  const w = lookup(e.pairedWeaponId);
  if (!w || w.type !== "weapon") throw new Refusal(`${e.name}'s weapon isn't in this server's catalog.`);
  return w;
}
const recordOf = (e) => ({ type: e.type, name: e.name, img: e.img ?? null, source: e._stats?.compendiumSource ?? null, flags: e.flags ?? {}, catalogId: e.id, snapshot: e.system });
const ITEM_ID = /^cg[0-9a-z]{14}$/;
/** The stored id of this character's record (never the request's string as a key), or a refusal. */
function ownId(b, id, ok, what) {
  const key = typeof id === "string" && ITEM_ID.test(id) ? Object.keys(b.creation.items).find(k => k === id) : undefined;
  if (!key || !ok(b.creation.items[key])) throw new Refusal(`No such ${what} on this character.`);
  return key;
}
const skillRecord = (b, id) => b.creation.items[ownId(b, id, r => r.type === "skill", "skill")];

/** A skill's `system`: ratings from the allocation by p.70 (the system's own), still pending as in Foundry's creation;
 * a free native language at Intelligence + 2, a dialect ½ Intelligence (p.74). */
function skillSystem(rec, int) {
  const c = rec.choices, free = c.freeLanguage;
  const t = skillTiersFromAllocation(c.allocated, !!c.concentration, !!c.specialization);
  const rating = free === "native" ? int + 2 : free === "dialect" ? Math.floor(int / 2) : Math.max(0, t.general);
  return { ...structuredClone(rec.snapshot), rating, allocated: free ? null : c.allocated, ratingsFinalized: false, freeLanguage: free,
    concentration: { name: c.concentration, rating: c.concentration ? t.concentration : 0 },
    specialization: { name: c.specialization, rating: c.specialization ? t.specialization : 0 } };
}
/** Records made before items carried their own shell data (M2b skills) take it from their item. */
function fillLegacyRecords(b) {
  const shells = new Map(b.actor.items.map(i => [i._id, i]));
  for (const [id, r] of Object.entries(b.creation.items)) {
    const sh = shells.get(id);
    if (!r.type && sh) Object.assign(r, { type: sh.type, name: sh.name, img: sh.img ?? null, source: sh._stats?.compendiumSource ?? null, flags: {} });
  }
}
/** Regenerate `actor.items` from the records: skills, bought items, and eye accessories as rows of their eye. */
function rebuildItems(b) {
  // Intelligence for the free languages: human form (M5c Draft 3) and a Bonus Attribute Point on it (PLAN-M5d Draft 3).
  const recs = b.creation.items, sys0 = b.actor.system, int = withRacial(sys0, "intelligence") + formMod(sys0, "intelligence")
    + Object.values(recs).filter(r => r.type === "quality" && r.choices?.attribute === "intelligence").reduce((t, r) => t + (Number(r.choices.gain) || 0), 0);
  const ids = Object.keys(recs).sort();
  const rows = new Map(), out = [];
  const builtIn = new Set(Object.values(recs).map(r => r.choices?.device).filter(d => d && Object.hasOwn(recs, d) && !deviceReason(recs[d])));
  const devices = new Map();
  for (const id of ids) {
    const r = recs[id];
    const { system, flags } = r.type === "skill" ? { system: skillSystem(r, int), flags: {} } : project(r, r.choices, recs);
    if (builtIn.has(id)) { devices.set(id, { name: r.name, system }); continue; }   // inside its limb option (R15)
    const eye = r.choices?.in;
    if (eye && Object.hasOwn(recs, eye) && isCybereye(recs[eye])) {
      if (!rows.has(eye)) rows.set(eye, []);
      rows.get(eye).push(eyeRow(id, r, { system }));
      continue;
    }
    // An implant weapon's link to its implant, kept on the item so it survives export and import (PLAN-M5l r1 #3).
    if (r.pairedTo) flags.sr2e = { ...(flags.sr2e ?? {}), pairedItem: r.pairedTo };
    out.push({ _id: id, name: r.name, type: r.type, img: r.img, system, flags, effects: [], _stats: { compendiumSource: r.source } });
  }
  for (const item of out) if (item.type === "cyberware" && (item.system.capacity ?? 0) > 0) item.system.modules = rows.get(item._id) ?? [];
  // A built-in device (core p.261): the option carries the device's normal price; Foundry prices it × 4.
  for (const item of out) {
    const d = devices.get(recs[item._id]?.choices?.device);
    if (!d) continue;
    item.system.cost = ratedRow(d.system.ratingStats, d.system.rating)?.cost ?? (Number(d.system.cost) || 0);
    item.system.notes = `<p>Device: ${d.name}${Number(d.system.rating) > 1 ? ` (Rating ${d.system.rating})` : ""}.</p>${item.system.notes ?? ""}`;
  }
  // A Bonus Attribute Point's price (Companion p.24): 1 per +1 up to the ORIGINAL racial maximum, 2 past it.
  const maxes = racialProfile(sys0, TABLES).maxes;
  for (const item of out) if (item.type === "quality" && qualityRule(item.system.rule, item._stats?.compendiumSource) === "bonus-attribute-point" && item.system.attribute)
    item.system.pointValue = bonusAttributeCost({ natural: withRacial(sys0, item.system.attribute) + formMod(sys0, item.system.attribute),
      originalMax: maxes[item.system.attribute] ?? 6, gain: Number(item.system.attributeBonus) || 0 });
  // Items the app has no record of (a character made elsewhere, e.g. a Foundry pregen) are kept exactly as they are:
  // the rebuild never drops data it didn't make.
  const foreign = b.actor.items.filter(i => !Object.hasOwn(recs, i._id));
  b.actor.items = [...foreign, ...out];
  // Vehicles bought here become the system's receipts (S9), in id order; a character the app didn't make keeps its own.
  if (b.creation.vehicles) b.actor.system.chargen.vehicles = [...(b.creation.vehicleBase ?? []), ...Object.keys(b.creation.vehicles).sort().map(k => {
    const v = b.creation.vehicles[k];
    return { name: v.source.name, source: v.source._stats?.compendiumSource || v.uuid, cost: Number(v.source.system?.cost) || 0 };
  })];
  // The lifestyle bought, or the street (p.46: no lifestyle bought = living on the street), never Foundry's "low".
  b.actor.system.lifestyle = b.actor.items.find(i => i.type === "lifestyle")?.system.level || "streets";
}

/* ── Validation: the rules panel ─────────────────────────────────────────────────────────────────────────────── */

/**
 * The magic type a Magic priority buys (core p.45 and the Master Table p.47; More Metahumans, p.46): exactly the
 * table's entry — human A magician, B adept; metahuman B magician, C adept; More Metahumans A magician, B adept for
 * every race (code review M2a #4: the table assigns a type to a letter, it doesn't set a minimum).
 */
export function magicAllowed(letter, race, moreMetahumans) {
  // A shapeshifter's own table (Companion p.36): B magician, C adept ("adept" there is the physical adept), whatever
  // More Metahumans says (PLAN-M5c Draft 2).
  if (race === "shapeshifter") return { B: ["full_magician"], C: ["physical_adept"] }[letter] ?? [];
  const table = moreMetahumans || race === "human" ? { A: "full_magician", B: "physical_adept" } : { B: "full_magician", C: "physical_adept" };
  return table[letter] ? [table[letter]] : [];
}
/** Does the Race priority allow this metatype (p.44; More Metahumans moves it to C, p.46)? */
export const metatypeAllowed = (letter, race, moreMetahumans) =>
  race === "shapeshifter" ? letter === "A" : race === "human" || (moreMetahumans ? ["A", "B", "C"].includes(letter) : letter === "A");

/**
 * Move-by-wire and the reflex enhancers (Cybertechnology p.38–39, p.56–57; PLAN-M5i): Foundry's own texts, read by
 * `wareRule` as Foundry reads it (an implant with no rule key isn't counted there either).
 */
const REFLEX = /^(wired-reflexes|boosted-reflexes|reaction-enhancer|synaptic-accelerator|adrenal-pump|suprathyroid)(:|$)/;
/** The SSC's Boosted Reflexes: Foundry gives them no rule key (by source; PLAN-M5k Draft 2). */
const SSC_BOOSTED = new Set(["d80c870280d415b7", "f0e85c37c0ed59eb", "fb6236aac8123518"].map(id => `Compendium.sr2e-street-samurai-catalog.ssc-cyberware.Item.${id}`));
function wareWarnings(items, add, creation = false) {
  const ware = items.filter(i => (i.type === "cyberware" || i.type === "bioware") && i.system.installed !== false && !(i.type === "cyberware" && i.system.secondhandFailed))
    .map(i => ({ i, rule: wareRule(i.flags, i._stats?.compendiumSource ?? null) ?? "" }));
  const mbw = ware.filter(w => w.i.type === "cyberware" && /^move-by-wire:/.test(w.rule));
  if (mbw.length > 1) add("resources", "error", "Only one move-by-wire system: Foundry counts the first.", 39, "ct");
  if (mbw.length) for (const { i, rule } of ware) {
    if (i === mbw[0].i || !REFLEX.test(rule)) continue;
    const stop = rule === "adrenal-pump" || rule === "suprathyroid";
    add("resources", "warning", stop ? `${i.name}: doesn't work with move-by-wire.`
      : rule === "synaptic-accelerator" && (i.system.rating ?? 1) <= 1 ? `${i.name}: Level 1 combines with move-by-wire only at triple cost, implanted together.`
      : `${i.name}: not compatible with move-by-wire; still counted, the GM's call.`, stop || rule === "synaptic-accelerator" ? 56 : 39, "ct");
  }
  // The synaptic accelerator (PLAN-M5k Draft 2, RAW): incompatible with boosted or wired reflexes (Shadowtech p.28);
  // with move-by-wire only at Level 1, at triple cost (priced so), implanted together (Cybertechnology p.57).
  const sev = creation ? "error" : "warning";
  for (const { i } of ware.filter(w => w.i.type === "bioware" && w.rule === "synaptic-accelerator")) {
    const reflex = ware.find(w => w.i.type === "cyberware" && (/^(wired-reflexes|boosted-reflexes)(:|$)/.test(w.rule) || SSC_BOOSTED.has(w.i._stats?.compendiumSource)));
    if (reflex) add("resources", sev, `${i.name} is incompatible with ${reflex.i.name} (Shadowtech p.28).`, 28, "st");
    if (mbw.length && (Number(i.system.rating) || 1) > 1) add("resources", sev, `${i.name} Level ${i.system.rating} can't combine with move-by-wire: only Level 1, at triple cost (Cybertechnology p.57).`, 57, "ct");
  }
  const enh = ware.filter(w => w.i.type === "cyberware" && w.rule === "reaction-enhancer").reduce((t, w) => t + (Number(w.i.system.attributeMods?.reaction) || 0), 0);
  if (enh > 6) add("resources", "warning", `Reaction Enhancers give +${enh}: +6 at most counts for a player character (+${enh - 6} lost).`, 38, "ct");
}
/**
 * Cyberlimbs (PLAN-M5j): the system model's reasons. At creation a sided limb needs its side, limbs may not overlap, and
 * an option must be in an installed limb (errors); in play the same are warnings (the GM fits limbs in Foundry). A
 * rejected duplicate option and a capped average are warnings either way (Cybertechnology p.31, p.50–51).
 */
function limbChecks(actor, add, creation) {
  if (!actor.items.some(i => i.type === "cyberware" && (i.system.limbOption || i.system.location === "cyberlimb"))) return;
  const model = limbModelOf(actor.items), sev = creation ? "error" : "warning", name = (id) => actor.items.find(i => i._id === id)?.name ?? "a part";
  for (const l of model.limbs) {
    if (!l.classified) add("resources", sev, `${l.name}: set its limb type (Foundry's sheet), or its rules don't apply.`, 30, "ct");   // r1 #4
    else if (!l.sideKnown) add("resources", sev, `${l.name}: choose its side (left or right).`, 30, "ct");
  }
  for (const c of model.conflicts) add("resources", sev, `${c.ids.map(name).join(" and ")} overlap on the ${c.side === "none" ? "body" : c.side} (${c.slot}).`, 30, "ct");
  for (const o of model.orphans) {
    // A cybergun with no link sits in a natural limb: legal, at the p.52 table's Essence (PLAN-M5l Draft 2).
    const src = actor.items.find(i => i._id === o.id)?._stats?.compendiumSource;
    if (!o.linkedLimbId && Object.hasOwn(OUTSIDE_LIMB_ESSENCE, src ?? "")) add("resources", "note", `${o.name}: in a natural limb, ${OUTSIDE_LIMB_ESSENCE[src]} Essence (build it into a cyberlimb for 0).`, 52, "ct");
    else add("resources", sev, `${o.name}: ${o.reason}.`, 31, "ct");
  }
  const d = derive({ actor });
  for (const r of d.limbs.selection?.rejected ?? []) add("resources", "warning", `${name(r.id)}: ${r.reason}.`, 31, "ct");
  for (const c of d.limbs.caps) add("resources", "warning", `The limbs' average ${c.attr} ${c.was} is over its limit: ${c.cap} counts.`, 51, "ct");
}
/** The bioware Body Index (Shadowtech p.6), unrounded as Foundry keeps it; the Awakened lose it in Essence too. */
export const bodyIndexOf = (items) => bodyIndexOfItems(items);   // the muscle discount and culturing per item (PLAN-M5k)
/** The value an attribute has after racial modifiers (p.45: applied after allocation). */
export const withRacial = (sys, attr, items = []) => (Number(sys[attr]?.base) || 0) + (racialProfile(sys, TABLES).mods[attr] ?? 0) + edgeBonus(items, attr);
/** The attribute Edges (Companion p.24; PLAN-M5d): Bonus Attribute Point raises the natural rating, Exceptional Attribute the maximum. */
export const edgeBonus = (items, attr) => items.filter(i => i.type === "quality" && i.system?.attribute === attr).reduce((t, i) => t + (Number(i.system.attributeBonus) || 0), 0);
export const edgeMax = (items, attr) => items.filter(i => i.type === "quality" && i.system?.attribute === attr).reduce((t, i) => t + (Number(i.system.maximumBonus) || 0), 0);
/** A shapeshifter's human-form modifier (Companion p.36), 0 for anyone else: on top of `withRacial`; it counts for adept
 * power pricing (R4) and the free language, never for Karma prices. The system's own function. */
export const formMod = humanFormMod;
/** The priority table this character uses: a shapeshifter's own (Companion p.36), else the core table. */
export const priorityTable = (sys) => (shapeshifterOf("character", sys) ? SHAPESHIFTER_PRIORITIES : TABLES.priorities);
/** Free contacts at creation (p.43): two; a shapeshifter none (Companion p.38). */
export const freeContacts = (sys) => (shapeshifterOf("character", sys) ? 0 : 2);

/**
 * The budgets and every problem: `{ budgets, problems: [{ step, severity, text, cite }], finishable }`. `severity`:
 * "error" (a rule broken), "todo" (not done yet) or "warning" (legal, but probably not meant). Finishing needs no
 * error and no todo.
 */
export function validate(body) {
  const sys = body.actor.system, pr = sys.chargen.priorities, opts = body.creation.options, problems = [];
  // `book`: the citation's book — "sc" for the Shadowrun Companion's rules (shapeshifters, Edges and Flaws).
  const add = (step, severity, text, page, book = CORE) => problems.push({ step, severity, text, cite: { book, page: String(page) } });
  if (body.creation.finished) return validateInPlay(body, add, problems);
  const table = priorityTable(sys), shifter = sys.race === "shapeshifter";
  // Point-based design (Companion p.20–21; PLAN-M5h): no priority letters — the Building Points buy every part.
  const points = sys.chargen.priorityMethod === "points";

  // Priorities (p.44): every category, each letter once.
  const missing = CATEGORIES.filter(c => !pr[c]);
  if (missing.length && !points) add("priorities", "todo", `Choose a priority for ${missing.map(c => CATEGORY_NAMES[c]).join(", ")}.`, 44);
  const seen = {};
  for (const c of CATEGORIES) if (pr[c]) (seen[pr[c]] ??= []).push(c);
  if (points) { /* no letters */ } else if (sys.chargen.priorityMethod === "sumto10") {   // Companion p.20: A 4, B 3, C 2, D 1, E 0; at most 10 in all
    const sum = CATEGORIES.reduce((t, c) => t + ({ A: 4, B: 3, C: 2, D: 1, E: 0 }[pr[c]] ?? 0), 0);
    if (sum > 10) add("priorities", "error", `The priority levels add up to ${sum}: at most 10 under sum-to-10.`, 20, "sc");
    if (sys.race === "shapeshifter") add("priorities", "error", "The shapeshifter's table has no sum-to-10 option: use standard priorities.", 36, "sc");
  } else for (const [l, cs] of Object.entries(seen)) if (cs.length > 1) add("priorities", "error", `Priority ${l} is used twice (${cs.map(c => CATEGORY_NAMES[c]).join(" and ")}): each letter once.`, 44);

  // Metatype (p.44, p.46).
  // A magical oni may take Race B with Resources A and Magic C (a metahuman adept), at the GM's discretion (Companion p.42).
  const oniB = !!opts.oniPriority && !points && sys.chargen.priorityMethod !== "sumto10" && pr.race === "B" && pr.resources === "A" && pr.magic === "C" && sys.magic.type === "physical_adept"
    && racialProfile(sys, TABLES).source === ONI_SOURCE;
  if (points) { /* the Building Points price the metatype */ } else if (shifter) {
    if (!shapeshifterOf("character", sys)) add("metatype", "todo", "Choose the shapeshifter's species.", 36, "sc");
    if (pr.race && pr.race !== "A") add("metatype", "error", "A shapeshifter needs Priority A in Race.", 36, "sc");
  } else if (pr.race && !oniB && !metatypeAllowed(pr.race, sys.race, opts.moreMetahumans))
    add("metatype", "error", `${cap(aRace(sys.race))} needs Priority ${opts.moreMetahumans ? "C or better" : "A"} in Race.`, opts.moreMetahumans ? 46 : 44);

  // Magic (p.44–46).
  const mtype = sys.magic.type;
  if (pr.magic && !points) {
    const allowed = magicAllowed(pr.magic, sys.race, opts.moreMetahumans);
    if (mtype !== "none" && !allowed.includes(mtype))
      add("magic", "error", `Priority ${pr.magic} in Magic doesn't buy a ${MAGIC_NAMES[mtype]} for ${aRace(sys.race)}.`, opts.moreMetahumans ? 46 : 45);
    if (mtype === "none" && allowed.length) add("magic", "warning", `Priority ${pr.magic} in Magic buys magic, but this character is mundane: the priority is wasted.`, 45);
  }
  if (mtype === "full_magician" && !TRADITIONS.includes(sys.magic.tradition)) add("magic", "todo", "Choose hermetic or shamanic.", 44);
  if (mtype === "full_magician" && sys.magic.tradition === "shamanic" && !sys.magic.totem) add("magic", "todo", "A shaman chooses a totem.", 44);

  // Attributes (p.43, p.45).
  const items = body.actor.items;
  const max = racialProfile(sys, TABLES).maxes;
  for (const a of ATTRIBUTES) {
    const base = Number(sys[a]?.base) || 0, v = withRacial(sys, a, items);
    if (base < 1) add("attributes", "error", `${ATTR_NAMES[a]} must be at least 1.`, 45);
    // A shapeshifter: the BASE may not exceed 6; the form modifiers apply after, uncapped (Companion p.36).
    // Exceptional Attribute raises the maximum (Companion p.24).
    if (shifter ? base > 6 : v > max[a] + edgeMax(items, a)) add("attributes", "error", shifter ? `${ATTR_NAMES[a]} is bought at ${base}: a shapeshifter's base attributes may not exceed 6.`
      : `${ATTR_NAMES[a]} is ${v} after racial modifiers${edgeBonus(items, a) ? " and Edges" : ""}; ${aRace(sys.race)}'s maximum is ${max[a] + edgeMax(items, a)}.`, shifter ? 36 : 43, shifter ? "sc" : CORE);
    if (v < 1) add("attributes", "error", `${ATTR_NAMES[a]} is ${v} after racial modifiers: raise it to at least 1.`, 45);
  }

  // Essence and Magic (p.45–46): computed first — Sorcery, spells and foci need a Magic Rating of at least 1.
  // The Awakened pay the bioware Body Index in Essence too (Shadowtech p.6; PLAN-M5e).
  const bodyIndex = bodyIndexOf(items);
  const essence = Math.round((6 - items.filter(i => i.type === "cyberware").reduce((t, i) => t + essenceOf(i, items, sys.race), 0) - (mtype !== "none" ? bodyIndex : 0)) * 1000) / 1000;
  const magic = mtype === "none" ? 0 : Math.max(0, Math.min(6, Math.floor(essence + 1e-9)));
  if (essence < 0) add("resources", "error", `Essence is ${essence}: cyberware can't take it below 0.`, 46);
  wareWarnings(items, add, true);
  limbChecks(body.actor, add, true);
  // Cyberware grades (SSC p.98; PLAN-M5f): the book on; an accessory inside an eye takes the eye's grade.
  for (const [id, r] of Object.entries(body.creation.items)) {
    if (r.type !== "cyberware" || !r.choices?.grade || r.choices.grade === "standard") continue;
    if (r.choices.grade === "delta") {   // Cybertechnology p.44: "far more difficult to acquire" — a corp has to want you there
      if (!(opts.books ?? []).includes("ct")) add("resources", "error", `${r.name} is delta: the delta grade comes from Cybertechnology — turn it on.`, 44, "ct");
      else add("resources", "warning", `${r.name} is delta: only a delta clinic installs it, and a corp has to want the character there. Ask the GM.`, 44, "ct");
    } else if (!(opts.books ?? []).includes("ssc")) add("resources", "error", `${r.name} is ${r.choices.grade}: alpha and beta grades come from the Street Samurai Catalog — turn it on.`, 98, "ssc");
    if (r.choices.in) add("resources", "error", `${r.name} is inside a cybereye: it takes the eye's grade, not its own.`, 98, "ssc");
    void id;
  }
  // Body Index over the natural Body: overstress, shown not refused, as Foundry (Shadowtech p.6).
  const bodyMax = withRacial(sys, "body", items) + formMod(sys, "body"), over = overstressPenalty(bodyIndex, bodyMax);
  if (over) add("resources", "warning", `Body Index ${Math.round(bodyIndex * 1000) / 1000} is over the Body of ${bodyMax}: overstress, +${over} to Body tests.`, 6, "st");
  for (const i of items.filter(i => i.type === "bioware" && RATING_UP_TO_BODY.has(i._stats?.compendiumSource)))
    if ((Number(i.system.rating) || 1) > bodyMax) add("resources", "error", `${i.name} is Rating ${i.system.rating}: at most the unaugmented Body (${bodyMax}).`, Number(i.system.citation?.page) || 6, "st");
  if (shifter && items.some(i => i.type === "cyberware")) add("resources", "error", "A shapeshifter's body rejects all cyberware: remove it.", 38, "sc");
  if (mtype !== "none" && magic < 1) add("magic", "error", `Essence ${essence} leaves no Magic Rating: this character's magic is gone.`, 45);

  // Skills (p.45, p.66, p.70, p.74).
  const skills = body.actor.items.filter(i => i.type === "skill");
  const names = new Set();
  let natives = 0, dialects = 0;
  for (const item of skills) {
    const s = item.system, c = body.creation.items[item._id]?.choices ?? {}, nm = item.name;
    const key = `${s.category}:${nm.toLowerCase()}`;
    if (names.has(key)) add("skills", "error", `${nm} is listed twice: one entry per skill.`, 66);
    names.add(key);
    if (s.freeLanguage === "native") natives++;
    if (s.freeLanguage === "dialect") dialects++;
    if (s.freeLanguage) continue;
    // The cap is on the general Skill Rating AFTER p.70's reduction: only a concentration or specialization goes
    // above 6 (p.45; docs/RULINGS.md R1).
    if (c.allocated < 1) add("skills", "error", `${nm}: a starting skill is at least 1.`, 45);
    else if (s.rating > 6) add("skills", "error", `${nm} is ${s.rating}: no starting skill above 6 (only a concentration or specialization may go higher).`, 45);
    const ok = validateSkillAllocation(c.allocated, !!c.concentration, !!c.specialization);
    if (c.allocated >= 1 && !ok.ok) add("skills", "error", `${nm}: ${ok.reason}`, 70);
    if (s.isMagical && magic < 1) add("skills", "error", `${nm} needs a Magic Rating.`, 45);
  }
  if (natives > 1) add("skills", "error", "Only one native language is free.", 74);
  if (dialects > 1) add("skills", "error", "Only one local dialect is free.", 74);
  if (dialects && sys.lifestyle !== "streets") add("skills", "error", "A free local dialect comes with a Street lifestyle.", 74);
  if (!natives) add("skills", "todo", "Add your native language and mark it free (Intelligence + 2).", 74);

  // Resources (p.46, p.137): what each bought thing needs.
  const spellIds = new Set(items.filter(i => i.type === "spell").map(i => i._id));
  for (const i of items) {
    const c = body.creation.items[i._id]?.choices ?? {};
    if (i.type === "spell" && mtype !== "full_magician") add("resources", "error", `${i.name}: only a full magician learns spells.`, 46);
    // Adepts are magicians (p.124) and get Force Points (p.46); a physical adept's only useful focus is a weapon focus (p.124).
    if (i.type === "focus" && mtype === "none") add("resources", "error", `${i.name}: only a magician bonds a focus.`, 46);
    else if (i.type === "focus" && mtype === "physical_adept" && i.system.focusType !== "weapon") add("resources", "error", `${i.name}: a physical adept can use only a weapon focus.`, 124);
    if (i.type === "focus" && i.system.focusType === "spell") {
      if (!c.spell) add("resources", "todo", `${i.name}: choose the spell it's bonded to.`, 137);
      else if (!spellIds.has(c.spell)) add("resources", "error", `${i.name}: its spell is no longer on this character.`, 137);
    }
    if (i.type === "focus" && i.system.focusType === "weapon") {
      const w = items.find(x => x._id === c.weapon && x.type === "weapon" && x.system.weaponType === "melee");
      if (!w) add("resources", "todo", `${i.name}: choose the melee weapon it's bonded to.`, 137);
      else if ((w.system.quantity ?? 1) > 1) add("resources", "error", `${i.name}: a focus is one weapon, but ${w.name} has quantity ${w.system.quantity}.`, 137);
    }
    if (i.type === "bioware" && isRecorder(body.creation.items[i._id] ?? { type: i.type, flags: i.flags, source: i._stats?.compendiumSource })) {
      const conc = i.system.recorderSize === "concentration";   // Shadowtech p.27: one skill (or concentration), not cumulative
      if (!c.skill && !i.system.recordedSkill) add("resources", "todo", `${i.name}: choose the skill it learns.`, 27, "st");
      else if (!i.system.recordedSkill) add("resources", "error", `${i.name}: its skill is no longer on this character.`, 27, "st");
      else if (conc && !i.system.recordedConcentration) add("resources", "error", `${i.name}: give ${i.system.recordedSkill} a concentration (it learns that concentration).`, 27, "st");
      else if (items.some(o => o !== i && o.type === "bioware" && o.system.recordedSkill === i.system.recordedSkill && (o.system.recorderSize === "concentration") === conc
        && (!conc || o.system.recordedConcentration === i.system.recordedConcentration) && items.indexOf(o) < items.indexOf(i)))
        add("resources", "error", `${i.name}: ${i.system.recordedSkill}${conc ? ` (${i.system.recordedConcentration})` : ""} already has a recorder; they aren't cumulative.`, 27, "st");
    }
    if (i.type === "cyberware" && "device" in c) {   // a built-in device (core p.261, R15)
      const g = c.device && Object.hasOwn(body.creation.items, c.device) ? body.creation.items[c.device] : null;
      if (!c.device) add("resources", "todo", `${i.name}: choose the gear item built into the limb.`, 261);
      else if (!g) add("resources", "error", `${i.name}: its device is no longer on this character.`, 261);
      else if (deviceReason(g)) add("resources", "error", `${i.name}: ${g.name}: ${deviceReason(g)}`, 261);
    }
    if (i.type === "bioware" && i._stats?.compendiumSource === TOXIN_EXHALER) {   // Shadowtech p.32: chosen before implantation
      const t = EXHALER_TOXINS[c.toxin];
      if (!t) add("resources", "todo", `${i.name}: choose the toxin it makes.`, 32, "st");
      else if (!booksOf(body).includes(t.book)) add("resources", "error", `${i.name}: ${c.toxin} is from a sourcebook that isn't turned on.`, t.page, t.book);
    }
    if (i.type === "adept_power") {
      const key = powerKeyOf(body.creation.items[i._id] ?? i);
      if (mtype !== "physical_adept") add("magic", "error", `${i.name}: only a physical adept has powers.`, 124);
      if (key === "improved_ability" && !c.skill) add("magic", "todo", `${i.name}: choose the skill it improves.`, 125);
      else if (key === "improved_ability" && !i.system.improvedSkill) add("magic", "error", `${i.name}: its skill is no longer on this character.`, 125);
      if (key === "improved_senses") {   // p.125: each sense once (no package deals); nothing radio or technological
        const list = sensesOf(c.senses), norm = list.map(x => x.toLowerCase().replace(/[^a-z]/g, ""));   // "low-light" = "low light"
        if (!list.length) add("magic", "todo", `${i.name}: name the improvements (low-light vision, thermographic vision…).`, 125);
        if (new Set(norm).size < norm.length) add("magic", "error", `${i.name}: each improvement is named once.`, 125);
        const tech = list.find(x => /radio|transmi|technolog|camera|digital|electronic/i.test(x));   // shortcut: a keyword list; the GM judges the rest
        if (tech) add("magic", "error", `${i.name}: "${tech}" — nothing radio or technological can be improved by this power.`, 125);
      }
    }
    if (["gear", "cyberware", "weapon", "armor"].includes(i.type) && Number(i.system.rating) > 6) add("resources", "error", `${i.name} is Rating ${i.system.rating}: no starting gear above 6.`, 44);
    if (i.type === "gear" && i.system.category === "skillsoft" && !c.skill) add("resources", "todo", `${i.name}: name the skill on the chip.`, 243);
  }

  // Contacts and extras (p.43–44), lifestyle (p.46), the allergy (p.46).
  const contacts = items.filter(i => i.type === "contact"), kind = (i) => i.system.contactType ?? "contact";
  const free = freeContacts(sys) + qualityEffects(items).extraContacts;   // Extra Contact (Companion p.31)
  if (contacts.filter(i => kind(i) === "contact").length < free) add("contacts", "todo", `Choose your ${free === 2 ? "two" : free} free contacts.`, 43);

  // Edges and Flaws (Companion p.22–35; PLAN-M5d): the system's audit, as Foundry's creation panel shows it.
  for (const p of qualityAudit({ system: sys, items, natural: (a) => withRacial(sys, a) + formMod(sys, a), maximum: (a) => max[a] ?? 6 }))
    add("concept", "error", p.text.replace(/ \(p\.\d+\)/, ""), p.page, p.book ?? "sc");
  const ev = attributeEdgeViolations(items.filter(i => i.type === "quality").map(i => ({ attribute: i.system.attribute, attributeBonus: i.system.attributeBonus, maximumBonus: i.system.maximumBonus })));
  if (ev.bonusOverCap) add("concept", "error", `${ev.bonusTotal} bonus Attribute Points: no more than 5.`, 24, "sc");
  if (qualityEffects(items).skillPoints > 5) add("concept", "error", "No more than 5 bonus Skill Points.", 24, "sc");
  if (contacts.filter(i => kind(i) === "buddy").length > 1) add("contacts", "error", "Only one buddy can be bought at creation.", 43);
  for (const f of contacts.filter(i => kind(i) === "follower")) {
    const names = (f.system.archetypes ?? []).filter(Boolean), norm = names.map(n => n.toLowerCase());
    if (names.length < 5) add("contacts", "todo", `${f.name}: name the five archetypes the followers come from.`, 44);
    if (new Set(norm).size < norm.length) add("contacts", "error", `${f.name}: the five archetypes must all be different.`, 44);
  }
  if (!items.some(i => i.type === "lifestyle")) add("contacts", "warning", "No lifestyle bought: the character lives on the street.", 46);
  const al = sys.chargen.allergy ?? NO_ALLERGY;
  if (Object.values(al).some(Boolean)) {
    const missing = [["substance", "the substance"], ["rarity", "how common it is"], ["severity", "its severity"], ["rarityBonus", "the bonus for how common"], ["severityBonus", "the bonus for the severity"]].filter(([k]) => !al[k]).map(([, t]) => t);
    if (missing.length) add("metatype", "todo", `Allergy: choose ${missing.join(", ")}.`, 46);
  }

  // Budgets: the system's own chargenBudget, the call Foundry's panel makes (core p.44–46; M2d §1).
  const spend = chargenBudget({ system: sys, items: pricedItems(items), table });   // limb options at their placement price (PLAN-M5j)
  for (const p of spend.resources.vehicleProblems ?? []) add("resources", "error", p, 264);
  if ((points || pr.resources) && spend.resources.over) add("resources", "error", `${spend.resources.spent.toLocaleString("en-US")}¥ spent; ${points ? "the nuyen tier" : `Priority ${pr.resources}`} gives ${spend.resources.total.toLocaleString("en-US")}¥.`, 46);
  if (points && spend.buildingPoints) {   // the overrun blocks finishing (PLAN-M5h r1 #4)
    const bp = spend.buildingPoints;
    if (bp.over) add("priorities", "error", `${bp.spent} Building Points spent; the allotment is ${bp.total}.`, 20, "sc");
    else if (bp.remaining > 0) add("priorities", "warning", `${bp.remaining} Building Point${bp.remaining === 1 ? "" : "s"} unspent.`, 20, "sc");
    for (const t of bp.problems) add("priorities", "error", t, 20, "sc");
  }
  if (mtype !== "none" && (points || pr.resources) && spend.forcePoints.remaining > 0)
    add("resources", "warning", `${spend.forcePoints.remaining} Force Points unspent: only unspent nuyen carries into play.`, 47);
  if (spend.forcePoints.over) add("resources", "error", `${spend.forcePoints.spent} Force Points spent (spells' Force and foci bonding); ${mtype !== "none" ? `${points ? "The Building Points give" : `Priority ${pr.resources || "—"} gives`} ${spend.forcePoints.total}` : "only magicians receive Force Points"}.`, 46);
  if (pr.attributes) {
    if (spend.attributes.over) add("attributes", "error", `${spend.attributes.spent} Attribute Points spent; Priority ${pr.attributes} gives ${spend.attributes.total}.`, 45);
    else if (spend.attributes.remaining > 0) add("attributes", "todo", `${spend.attributes.remaining} Attribute Point${spend.attributes.remaining === 1 ? "" : "s"} left to spend.`, 47);
  }
  if (pr.skills) {
    if (spend.skills.over) add("skills", "error", `${spend.skills.spent} Skill Points spent; Priority ${pr.skills} gives ${spend.skills.total}.`, 45);
    else if (spend.skills.remaining > 0) add("skills", "todo", `${spend.skills.remaining} Skill Point${spend.skills.remaining === 1 ? "" : "s"} left to spend.`, 47);
  }
  // A physical adept's power points (p.124–126): the system's own costs and reports, against the Magic Rating.
  if (mtype === "physical_adept") {
    const pb = adeptPowerBudget({ items, maxes: max, natural: Object.fromEntries(["body", "quickness", "strength"].map(a => [a, withRacial(sys, a, items) + formMod(sys, a)])), magic });
    spend.powerPoints = { spent: pb.used, total: magic, over: pb.used > magic, costs: pb.costs };
    for (const p of pb.problems) add("magic", "error", p, Number(/p\.(\d+)/.exec(p)?.[1] ?? 125));
    if (pb.used < magic) add("magic", "warning", `${magic - pb.used} power point${magic - pb.used === 1 ? "" : "s"} unspent.`, 124);
  }
  return { budgets: spend, essence, magic, problems, finishable: !problems.some(p => p.severity !== "warning") };
}

export const CATEGORY_NAMES = { race: "Race", magic: "Magic", attributes: "Attributes", skills: "Skills", resources: "Resources" };
export const RACE_NAMES = { human: "human", dwarf: "dwarf", elf: "elf", ork: "ork", troll: "troll" };
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const aRace = (race) => `${/^[aeiou]/.test(RACE_NAMES[race]) ? "an" : "a"} ${RACE_NAMES[race]}`;
export const MAGIC_NAMES = { none: "mundane", full_magician: "full magician", physical_adept: "physical adept" };
export const ATTR_NAMES = { body: "Body", quickness: "Quickness", strength: "Strength", charisma: "Charisma", intelligence: "Intelligence", willpower: "Willpower" };
/** The totem names, from the system's labels. */
export const totemNames = () => Object.fromEntries(CORE_TOTEMS.map(k => [k, label(TABLES.totems[k].label)]));
