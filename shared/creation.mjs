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
import { TABLES, chargenSpend, label, skillTiersFromAllocation, validateSkillAllocation } from "./rules.mjs";
import { defaultChoices, checkChoices, refusalFor, project, priceInput, eyeRow, essenceOf, isCybereye } from "./purchase.mjs";

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
    creation: { method: "priority", options: { moreMetahumans: false }, finished: null, items: {}, nextItem: 1 },
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
  setPriority: { category: "string", letter: "string" },
  setMetatype: { race: "string" },
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
  setCard: { itemId: "string", on: "boolean" }
});
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
const OPTIONS = ["moreMetahumans"];

/**
 * Apply one operation. Refused only when it is impossible (an unknown value, a number outside what any character
 * could have); rules a player may break while building are reported by `validate`, never refused. A finished
 * character takes no creation operation (changes after creation are milestone 4's).
 */
export function applyOp(body, op, lookup = () => null) {
  if (!op || typeof op !== "object" || typeof op.op !== "string" || !Object.hasOwn(OPS, op.op)) throw new Refusal("Unknown operation.");
  if (body.creation.finished && op.op !== "setNotes" && op.op !== "setCard") throw new Refusal("This character is finished: creation can't change it.");
  const b = structuredClone(body), sys = b.actor.system;
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
  fillLegacyRecords(b);   // before the operation looks records up (r1 #2)
  switch (op.op) {
    case "setName": b.name = b.actor.name = cleanName(op.name); break;
    case "setNotes":
      if (typeof op.notes !== "string" || op.notes.length > 20000) throw new Refusal("Notes are at most 20,000 characters.");
      b.notes = op.notes; break;
    case "setOption":
      if (!OPTIONS.includes(op.key) || typeof op.value !== "boolean") throw new Refusal("Unknown option.");
      b.creation.options[op.key] = op.value; break;
    case "setPriority": {
      if (!CATEGORIES.includes(op.category) || !["", ...LETTERS].includes(op.letter)) throw new Refusal("Unknown priority.", 44);
      // Each letter once (p.44): taking a letter another category holds SWAPS the two, so the table stays whole.
      const pr = sys.chargen.priorities, holder = CATEGORIES.find(c => c !== op.category && op.letter && pr[c] === op.letter);
      if (holder) pr[holder] = pr[op.category];
      pr[op.category] = op.letter;
      break;
    }
    case "setMetatype":
      if (!METATYPES.includes(op.race)) throw new Refusal("That isn't a core metatype.", 44);
      sys.race = op.race; break;
    case "setMagic":
      if (!MAGIC_TYPES.includes(op.type)) throw new Refusal("That isn't a core magic type.", 45);
      sys.magic.type = op.type;
      if (op.type !== "full_magician") { sys.magic.tradition = "none"; sys.magic.totem = ""; }   // only a magician has a tradition (p.44–45)
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
      if (e.book !== CORE) throw new Refusal("Only the core book's gear for now: sourcebooks arrive with the book toggles.");
      if (e.type === "skill") throw new Refusal("Add a skill in the Skills step.");
      const why = refusalFor(e);
      if (why) throw new Refusal(why);
      const rec = recordOf(e);
      addRecord(b, { ...rec, choices: defaultChoices(rec) });
      break;
    }
    case "setItem": {
      const id = ownId(b, op.itemId, r => r.type !== "skill", "item");
      const rec = b.creation.items[id], checked = checkChoices(rec, op.choices);
      if (checked.reason) throw new Refusal(checked.reason);
      const into = checked.choices.in;
      if (into && into !== rec.choices.in) {   // an accessory goes only into a cybereye of this character (core p.247)
        const eye = Object.keys(b.creation.items).find(k => k === into);
        if (!eye || !isCybereye(b.creation.items[eye])) throw new Refusal("Place it in a cybereye of this character.");
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
      rec.choices = checked.choices;
      break;
    }
    case "removeItem": {
      const id = ownId(b, op.itemId, r => r.type !== "skill", "item");
      const gone = new Set([id]);
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
  const recs = b.creation.items, int = withRacial(b.actor.system, "intelligence");
  const ids = Object.keys(recs).sort();
  const rows = new Map(), out = [];
  for (const id of ids) {
    const r = recs[id];
    const { system, flags } = r.type === "skill" ? { system: skillSystem(r, int), flags: {} } : project(r, r.choices, recs);
    const eye = r.choices?.in;
    if (eye && Object.hasOwn(recs, eye) && isCybereye(recs[eye])) {
      if (!rows.has(eye)) rows.set(eye, []);
      rows.get(eye).push(eyeRow(id, r, { system }));
      continue;
    }
    out.push({ _id: id, name: r.name, type: r.type, img: r.img, system, flags, effects: [], _stats: { compendiumSource: r.source } });
  }
  for (const item of out) if (item.type === "cyberware" && (item.system.capacity ?? 0) > 0) item.system.modules = rows.get(item._id) ?? [];
  // Items the app has no record of (a character made elsewhere, e.g. a Foundry pregen) are kept exactly as they are:
  // the rebuild never drops data it didn't make.
  const foreign = b.actor.items.filter(i => !Object.hasOwn(recs, i._id));
  b.actor.items = [...foreign, ...out];
}

/* ── Validation: the rules panel ─────────────────────────────────────────────────────────────────────────────── */

/**
 * The magic type a Magic priority buys (core p.45 and the Master Table p.47; More Metahumans, p.46): exactly the
 * table's entry — human A magician, B adept; metahuman B magician, C adept; More Metahumans A magician, B adept for
 * every race (code review M2a #4: the table assigns a type to a letter, it doesn't set a minimum).
 */
export function magicAllowed(letter, race, moreMetahumans) {
  const table = moreMetahumans || race === "human" ? { A: "full_magician", B: "physical_adept" } : { B: "full_magician", C: "physical_adept" };
  return table[letter] ? [table[letter]] : [];
}
/** Does the Race priority allow this metatype (p.44; More Metahumans moves it to C, p.46)? */
export const metatypeAllowed = (letter, race, moreMetahumans) =>
  race === "human" || (moreMetahumans ? ["A", "B", "C"].includes(letter) : letter === "A");

/** The value an attribute has after racial modifiers (p.45: applied after allocation). */
export const withRacial = (sys, attr) => (Number(sys[attr]?.base) || 0) + (TABLES.racialModifiers[sys.race]?.[attr] ?? 0);

/**
 * The budgets and every problem: `{ budgets, problems: [{ step, severity, text, cite }], finishable }`. `severity`:
 * "error" (a rule broken), "todo" (not done yet) or "warning" (legal, but probably not meant). Finishing needs no
 * error and no todo.
 */
export function validate(body) {
  const sys = body.actor.system, pr = sys.chargen.priorities, opts = body.creation.options, problems = [];
  const add = (step, severity, text, page) => problems.push({ step, severity, text, cite: cite(page) });
  const table = TABLES.priorities;

  // Priorities (p.44): every category, each letter once.
  const missing = CATEGORIES.filter(c => !pr[c]);
  if (missing.length) add("priorities", "todo", `Choose a priority for ${missing.map(c => CATEGORY_NAMES[c]).join(", ")}.`, 44);
  const seen = {};
  for (const c of CATEGORIES) if (pr[c]) (seen[pr[c]] ??= []).push(c);
  for (const [l, cs] of Object.entries(seen)) if (cs.length > 1) add("priorities", "error", `Priority ${l} is used twice (${cs.map(c => CATEGORY_NAMES[c]).join(" and ")}): each letter once.`, 44);

  // Metatype (p.44, p.46).
  if (pr.race && !metatypeAllowed(pr.race, sys.race, opts.moreMetahumans))
    add("metatype", "error", `${cap(aRace(sys.race))} needs Priority ${opts.moreMetahumans ? "C or better" : "A"} in Race.`, opts.moreMetahumans ? 46 : 44);

  // Magic (p.44–46).
  const mtype = sys.magic.type;
  if (pr.magic) {
    const allowed = magicAllowed(pr.magic, sys.race, opts.moreMetahumans);
    if (mtype !== "none" && !allowed.includes(mtype))
      add("magic", "error", `Priority ${pr.magic} in Magic doesn't buy a ${MAGIC_NAMES[mtype]} for ${aRace(sys.race)}.`, opts.moreMetahumans ? 46 : 45);
    if (mtype === "none" && allowed.length) add("magic", "warning", `Priority ${pr.magic} in Magic buys magic, but this character is mundane: the priority is wasted.`, 45);
  }
  if (mtype === "full_magician" && !TRADITIONS.includes(sys.magic.tradition)) add("magic", "todo", "Choose hermetic or shamanic.", 44);
  if (mtype === "full_magician" && sys.magic.tradition === "shamanic" && !sys.magic.totem) add("magic", "todo", "A shaman chooses a totem.", 44);

  // Attributes (p.43, p.45).
  const max = TABLES.racialMaximums[sys.race] ?? TABLES.racialMaximums.human;
  for (const a of ATTRIBUTES) {
    const base = Number(sys[a]?.base) || 0, v = withRacial(sys, a);
    if (base < 1) add("attributes", "error", `${ATTR_NAMES[a]} must be at least 1.`, 45);
    if (v > max[a]) add("attributes", "error", `${ATTR_NAMES[a]} is ${v} after racial modifiers; ${aRace(sys.race)}'s maximum is ${max[a]}.`, 43);
    if (v < 1) add("attributes", "error", `${ATTR_NAMES[a]} is ${v} after racial modifiers: raise it to at least 1.`, 45);
  }

  // Essence and Magic (p.45–46): computed first — Sorcery, spells and foci need a Magic Rating of at least 1.
  const items = body.actor.items;
  const essence = Math.round((6 - items.filter(i => i.type === "cyberware").reduce((t, i) => t + essenceOf(i, items), 0)) * 100) / 100;
  const magic = mtype === "none" ? 0 : Math.max(0, Math.min(6, Math.floor(essence + 1e-9)));
  if (essence < 0) add("resources", "error", `Essence is ${essence}: cyberware can't take it below 0.`, 46);
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
    if (i.type === "spell" && mtype !== "full_magician") add("resources", "error", `${i.name}: only magicians learn spells with Force Points.`, 46);
    if (i.type === "focus" && mtype !== "full_magician") add("resources", "error", `${i.name}: only a magician bonds this focus (an adept can use only a weapon focus, p.124).`, 46);
    if (i.type === "focus" && i.system.focusType === "spell") {
      if (!c.spell) add("resources", "todo", `${i.name}: choose the spell it's bonded to.`, 137);
      else if (!spellIds.has(c.spell)) add("resources", "error", `${i.name}: its spell is no longer on this character.`, 137);
    }
    if (i.type === "focus" && i.system.focusType === "weapon") {
      const w = items.find(x => x._id === c.weapon && x.type === "weapon" && x.system.weaponType === "melee");
      if (!w) add("resources", "todo", `${i.name}: choose the melee weapon it's bonded to.`, 137);
      else if ((w.system.quantity ?? 1) > 1) add("resources", "error", `${i.name}: a focus is one weapon, but ${w.name} has quantity ${w.system.quantity}.`, 137);
    }
    if (["gear", "cyberware", "weapon", "armor"].includes(i.type) && Number(i.system.rating) > 6) add("resources", "error", `${i.name} is Rating ${i.system.rating}: no starting gear above 6.`, 44);
    if (i.type === "gear" && i.system.category === "skillsoft" && !c.skill) add("resources", "todo", `${i.name}: name the skill on the chip.`, 243);
  }

  // Budgets through the system's own function (core p.44–46).
  const allot = { attributes: table[pr.attributes]?.attributes ?? 0, skills: table[pr.skills]?.skills ?? 0,
    resources: table[pr.resources]?.resources ?? 0, forcePoints: mtype === "full_magician" ? table[pr.resources]?.forcePoints ?? 0 : 0 };
  const spend = chargenSpend({ attributes: ATTRIBUTES.map(a => ({ base: Number(sys[a]?.base) || 0 })),
    skills: skills.map(i => ({ category: i.system.category, freeLanguage: i.system.freeLanguage, rating: i.system.rating, allocated: i.system.allocated,
      ratingsFinalized: false, concentration: { name: i.system.concentration.name }, specialization: { name: i.system.specialization.name } })),
    items: items.filter(i => i.type !== "skill").map(i => priceInput(i, items)) }, allot);
  if (pr.resources && spend.resources.over) add("resources", "error", `${spend.resources.spent.toLocaleString("en-US")}¥ spent; Priority ${pr.resources} gives ${spend.resources.total.toLocaleString("en-US")}¥.`, 46);
  if (mtype === "full_magician" && pr.resources && spend.forcePoints.remaining > 0)
    add("resources", "warning", `${spend.forcePoints.remaining} Force Points unspent: only unspent nuyen carries into play.`, 47);
  if (spend.forcePoints.over) add("resources", "error", `${spend.forcePoints.spent} Force Points spent (spells' Force and foci bonding); ${mtype === "full_magician" ? `Priority ${pr.resources || "—"} gives ${spend.forcePoints.total}` : "only magicians receive Force Points"}.`, 46);
  if (pr.attributes) {
    if (spend.attributes.over) add("attributes", "error", `${spend.attributes.spent} Attribute Points spent; Priority ${pr.attributes} gives ${spend.attributes.total}.`, 45);
    else if (spend.attributes.remaining > 0) add("attributes", "todo", `${spend.attributes.remaining} Attribute Point${spend.attributes.remaining === 1 ? "" : "s"} left to spend.`, 47);
  }
  if (pr.skills) {
    if (spend.skills.over) add("skills", "error", `${spend.skills.spent} Skill Points spent; Priority ${pr.skills} gives ${spend.skills.total}.`, 45);
    else if (spend.skills.remaining > 0) add("skills", "todo", `${spend.skills.remaining} Skill Point${spend.skills.remaining === 1 ? "" : "s"} left to spend.`, 47);
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
