/**
 * Character creation with the core Priority system (docs/PLAN-M2.md; rules: docs/RULES-CHARGEN.md, core pp.43–47).
 * Pure: the same code runs on the server (the authority) and in the browser (for a fast screen).
 *   - `newCharacter(name)` — a fresh character document body.
 *   - `applyOp(body, op)` — the next body, or throws a `Refusal` (an impossible change).
 *   - `validate(body)` — the budgets and every problem, each with its page.
 * A character is the Foundry system's own `character` source shapes (`actor`), so the system's functions read it
 * unchanged; the app's own record sits beside it (`creation`).
 */
import { TABLES, chargenSpend, label } from "./rules.mjs";

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
    creation: { method: "priority", options: { moreMetahumans: false }, finished: null, items: {} },
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
  setAttribute: { attr: "string", base: "integer" }
});
const OPTIONS = ["moreMetahumans"];

/**
 * Apply one operation. Refused only when it is impossible (an unknown value, a number outside what any character
 * could have); rules a player may break while building are reported by `validate`, never refused. A finished
 * character takes no creation operation (changes after creation are milestone 4's).
 */
export function applyOp(body, op) {
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
  }
  return b;
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

  // Budgets through the system's own function (core p.44–46).
  const allot = { attributes: table[pr.attributes]?.attributes ?? 0, skills: table[pr.skills]?.skills ?? 0,
    resources: table[pr.resources]?.resources ?? 0, forcePoints: mtype === "full_magician" ? table[pr.resources]?.forcePoints ?? 0 : 0 };
  const spend = chargenSpend({ attributes: ATTRIBUTES.map(a => ({ base: Number(sys[a]?.base) || 0 })), skills: [], items: [] }, allot);
  if (pr.attributes) {
    if (spend.attributes.over) add("attributes", "error", `${spend.attributes.spent} Attribute Points spent; Priority ${pr.attributes} gives ${spend.attributes.total}.`, 45);
    else if (spend.attributes.remaining > 0) add("attributes", "todo", `${spend.attributes.remaining} Attribute Point${spend.attributes.remaining === 1 ? "" : "s"} left to spend.`, 47);
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
