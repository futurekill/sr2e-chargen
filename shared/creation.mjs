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
  removeSkill: { itemId: "string" }
});
const OPTIONS = ["moreMetahumans"];

/**
 * Apply one operation. Refused only when it is impossible (an unknown value, a number outside what any character
 * could have); rules a player may break while building are reported by `validate`, never refused. A finished
 * character takes no creation operation (changes after creation are milestone 4's).
 */
export function applyOp(body, op, lookup = () => null) {
  if (!op || typeof op !== "object" || !(op.op in OPS)) throw new Refusal("Unknown operation.");
  if (body.creation.finished && op.op !== "setNotes") throw new Refusal("This character is finished: creation can't change it.");
  const b = structuredClone(body), sys = b.actor.system;
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
      addItem(b, { name: e.name, img: e.img ?? null, snapshot: e.system, catalogId: e.id, source: e._stats?.compendiumSource ?? null,
        choices: { allocated: 1, concentration: "", specialization: "", freeLanguage: "" } });
      break;
    }
    case "addCustomSkill": {
      if (!CUSTOM_SKILL_CATEGORIES.includes(op.category)) throw new Refusal("Name a Knowledge, Language or Build/Repair skill.", 66);
      const name = shortText(op.name, "A skill's name");
      if (!name) throw new Refusal("A skill needs a name.");
      addItem(b, { name, img: null, catalogId: null, source: null,
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
      rec.choices = { allocated: op.allocated, concentration: conc, specialization: spec, freeLanguage: op.freeLanguage };
      break;
    }
    case "removeSkill":
      skillRecord(b, op.itemId);
      delete b.creation.items[op.itemId];
      b.actor.items = b.actor.items.filter(i => i._id !== op.itemId);
      break;
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
function addItem(b, { name, img, snapshot, catalogId, source, choices }) {
  if (b.actor.items.length >= MAX_ITEMS) throw new Refusal(`A character holds at most ${MAX_ITEMS} items.`);
  const n = b.creation.nextItem ?? 1;
  b.creation.nextItem = n + 1;
  const _id = itemId(n);
  b.creation.items[_id] = { catalogId, snapshot: structuredClone(snapshot), choices };
  b.actor.items.push({ _id, name, type: "skill", img, system: {}, flags: {}, effects: [], _stats: { compendiumSource: source } });
}
function skillRecord(b, id) {
  const item = b.actor.items.find(i => i._id === id);
  if (!item || item.type !== "skill" || !Object.hasOwn(b.creation.items, id)) throw new Refusal("No such skill on this character.");
  return b.creation.items[id];
}

/**
 * Every item's `system`, rebuilt from its snapshot and the player's choices (never stored as typed): a skill's ratings
 * come from its allocation by p.70 (`skillTiersFromAllocation`, the system's own), still pending (`ratingsFinalized`
 * false) as in Foundry's creation; a free native language is rated Intelligence + 2, a dialect ½ Intelligence (p.74).
 */
function rebuildItems(b) {
  const sys = b.actor.system, int = withRacial(sys, "intelligence");
  for (const item of b.actor.items) {
    const rec = b.creation.items[item._id];
    if (item.type !== "skill" || !rec) continue;
    const c = rec.choices, free = c.freeLanguage;
    const t = skillTiersFromAllocation(c.allocated, !!c.concentration, !!c.specialization);
    const rating = free === "native" ? int + 2 : free === "dialect" ? Math.floor(int / 2) : Math.max(0, t.general);
    item.system = { ...structuredClone(rec.snapshot), rating, allocated: free ? null : c.allocated, ratingsFinalized: false, freeLanguage: free,
      concentration: { name: c.concentration, rating: c.concentration ? t.concentration : 0 },
      specialization: { name: c.specialization, rating: c.specialization ? t.specialization : 0 } };
  }
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

  // Skills (p.45, p.66, p.70, p.74).
  const skills = body.actor.items.filter(i => i.type === "skill");
  const names = {};
  let natives = 0, dialects = 0;
  for (const item of skills) {
    const s = item.system, c = body.creation.items[item._id]?.choices ?? {}, nm = item.name;
    const key = `${s.category}:${nm.toLowerCase()}`;
    if (names[key]) add("skills", "error", `${nm} is listed twice: one entry per skill.`, 66);
    names[key] = true;
    if (s.freeLanguage === "native") natives++;
    if (s.freeLanguage === "dialect") dialects++;
    if (s.freeLanguage) continue;
    if (c.allocated < 1) add("skills", "error", `${nm}: a starting skill is at least 1.`, 45);
    else if (c.allocated > 6) add("skills", "error", `${nm}: no starting skill above 6 (a concentration or specialization may go higher).`, 45);
    const ok = validateSkillAllocation(c.allocated, !!c.concentration, !!c.specialization);
    if (c.allocated >= 1 && !ok.ok) add("skills", "error", `${nm}: ${ok.reason}`, 70);
    if (s.isMagical && mtype === "none") add("skills", "error", `${nm} needs a Magic Rating.`, 45);
  }
  if (natives > 1) add("skills", "error", "Only one native language is free.", 74);
  if (dialects > 1) add("skills", "error", "Only one local dialect is free.", 74);
  if (dialects && sys.lifestyle !== "streets") add("skills", "error", "A free local dialect comes with a Street lifestyle.", 74);
  if (!natives) add("skills", "todo", "Add your native language and mark it free (Intelligence + 2).", 74);

  // Budgets through the system's own function (core p.44–46).
  const allot = { attributes: table[pr.attributes]?.attributes ?? 0, skills: table[pr.skills]?.skills ?? 0,
    resources: table[pr.resources]?.resources ?? 0, forcePoints: mtype === "full_magician" ? table[pr.resources]?.forcePoints ?? 0 : 0 };
  const spend = chargenSpend({ attributes: ATTRIBUTES.map(a => ({ base: Number(sys[a]?.base) || 0 })),
    skills: skills.map(i => ({ category: i.system.category, freeLanguage: i.system.freeLanguage, rating: i.system.rating, allocated: i.system.allocated,
      ratingsFinalized: false, concentration: { name: i.system.concentration.name }, specialization: { name: i.system.specialization.name } })), items: [] }, allot);
  if (pr.attributes) {
    if (spend.attributes.over) add("attributes", "error", `${spend.attributes.spent} Attribute Points spent; Priority ${pr.attributes} gives ${spend.attributes.total}.`, 45);
    else if (spend.attributes.remaining > 0) add("attributes", "todo", `${spend.attributes.remaining} Attribute Point${spend.attributes.remaining === 1 ? "" : "s"} left to spend.`, 47);
  }
  if (pr.skills) {
    if (spend.skills.over) add("skills", "error", `${spend.skills.spent} Skill Points spent; Priority ${pr.skills} gives ${spend.skills.total}.`, 45);
    else if (spend.skills.remaining > 0) add("skills", "todo", `${spend.skills.remaining} Skill Point${spend.skills.remaining === 1 ? "" : "s"} left to spend.`, 47);
  }
  return { budgets: spend, problems, finishable: !problems.some(p => p.severity !== "warning") };
}

export const CATEGORY_NAMES = { race: "Race", magic: "Magic", attributes: "Attributes", skills: "Skills", resources: "Resources" };
export const RACE_NAMES = { human: "human", dwarf: "dwarf", elf: "elf", ork: "ork", troll: "troll" };
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const aRace = (race) => `${/^[aeiou]/.test(RACE_NAMES[race]) ? "an" : "a"} ${RACE_NAMES[race]}`;
export const MAGIC_NAMES = { none: "mundane", full_magician: "full magician", physical_adept: "physical adept" };
export const ATTR_NAMES = { body: "Body", quickness: "Quickness", strength: "Strength", charisma: "Charisma", intelligence: "Intelligence", willpower: "Willpower" };
/** The totem names, from the system's labels. */
export const totemNames = () => Object.fromEntries(CORE_TOTEMS.map(k => [k, label(TABLES.totems[k].label)]));
