/**
 * The NPC builder (docs/PLAN-npc-builder.md): a non-player character as its own library document. Pure and shared by the
 * server (the authority) and the client (the preview), like the Garage's vehicle.mjs.
 *
 * Body: `{ schema, schemaVersion, name, notes, source: { catalogId, kind, prRange } | null, nextItem, actor, experience }`.
 * `actor` is the Foundry NPC actor source — the ONE authority. Rules: core p.187 (NPCs), p.68 (Skill Success Table);
 * the numbers come from the system's npc-rules.mjs, which Foundry's NPCData uses too.
 */
import { Refusal } from "./creation.mjs";
import { derive } from "./derive.mjs";
import { NPC_ATTRS, npcExperiencePct, npcExperienced, npcWithEffects, npcDerived, PROFESSIONAL_RATINGS, wornArmorTotals, TABLES, RACE_KEYS } from "./rules.mjs";

export const NPC_SCHEMA = "sr2e-chargen-npc", NPC_SCHEMA_VERSION = 1;
export const MAX_NPC_ITEMS = 200;
const SKILL_CATEGORIES = ["active", "build_repair", "knowledge", "language", "special"];   // the system's SkillData choices
const MAGIC_TYPES = ["none", "full_magician", "physical_adept", "shamanic_adept", "magical_adept"];   // SR2E.magicTypes
const TRADITIONS = ["none", "hermetic", "shamanic"];   // SR2E.magicTraditions
// Input bounds only (r1 #7) — Foundry sets no maximum. shortcut: raise them if a book prints more.
const MAX_ATTR = 99, MAX_SKILL = 99, MAX_THREAT = 20, MAX_NUYEN = 1e9;

/** The operations an NPC document takes (field types for the route schema; its OWN map, never the character's). */
export const NPC_OPS = {
  setName: { name: "string" },
  setNotes: { notes: "string" },
  setRace: { race: "string" },
  setAttribute: { attr: "string", base: "integer" },
  setEssence: { value: "number" },
  setMagic: { value: "integer", type: "string", tradition: "string", totem: "string" },
  setBodyIndex: { value: "number" },
  setArmor: { ballistic: "integer", impact: "integer" },
  setReactionMod: { mod: "integer" },
  setCombatPoolBonus: { bonus: "integer" },
  setInitiativeDice: { dice: "integer" },
  setNuyen: { nuyen: "integer" },
  setProfessionalRating: { rating: "integer" },
  setThreatRating: { rating: "integer" },
  addItem: { catalogId: "string", rating: "integer" },
  addCustomSkill: { name: "string", category: "string", attribute: "string", rating: "integer" },
  setItemRating: { itemId: "string", rating: "integer" },
  setEquipped: { itemId: "string", equipped: "boolean" },
  removeItem: { itemId: "string" },
  applyExperience: { years: "integer", attributes: "boolean", skills: "boolean", resources: "boolean" }
};
export const NPC_OPTIONAL = { addItem: ["rating"] };

const itemKey = (n) => `gn${String(n).padStart(14, "0")}`;   // 16 characters, as Foundry's ids; fixed width keeps order
const whole = (v, lo, hi, what) => { if (!Number.isInteger(v) || v < lo || v > hi) throw new Refusal(`${what} is a whole number from ${lo} to ${hi}.`); return v; };
function cleanName(name, what = "An NPC's name") {
  const n = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!n || n.length > 120) throw new Refusal(`${what} is 1 to 120 characters.`);
  return n;
}
/** Every system field the builder and npcDerived read, with Foundry's NPC defaults where the source has none. */
function filled(sys = {}) {
  const s = structuredClone(sys);
  for (const a of NPC_ATTRS) s[a] = { base: 3, mod: 0, ...(s[a] ?? {}) };
  s.reaction = { mod: 0, ...(s.reaction ?? {}) };
  s.initiative = { dice: 1, mod: 0, ...(s.initiative ?? {}) };
  s.armor = { ballistic: 0, impact: 0, ...(s.armor ?? {}) };
  s.essence = { value: 6, max: 6, ...(s.essence ?? {}) };
  s.bodyIndex = { value: 0, ...(s.bodyIndex ?? {}) };
  s.magic = { value: 0, max: 0, type: "none", tradition: "none", totem: "", ...(s.magic ?? {}) };
  s.race ??= "human"; s.professionalRating ??= 1; s.combatPoolBonus ??= 0; s.nuyen ??= 0; s.biography ??= "";
  s.threatRating ??= 0;   // the contacts print none; Foundry's default would be 1 (r2 #2)
  return s;
}
const blankBody = (name) => ({ schema: NPC_SCHEMA, schemaVersion: NPC_SCHEMA_VERSION, name, notes: "", source: null, nextItem: 1, experience: [],
  actor: { name, type: "npc", img: "icons/svg/mystery-man.svg", system: filled({ threatRating: 0 }), items: [], prototypeToken: { name } } });
const withIds = (body, items) => {
  for (const i of items) {
    const copy = structuredClone(i);
    delete copy._key; delete copy.folder; delete copy.sort; delete copy.ownership;
    copy._id = itemKey(body.nextItem++);
    body.actor.items.push(copy);
  }
};

/**
 * A new NPC: blank (`rec` null), from a contact's source as printed, or from an archetype converted ONCE with its
 * prepared numbers baked in (r1 #4). `rec` = an npcs.json record { source, prRange }; `catalogId` its id.
 */
export function newNpc(rec, name, catalogId = null) {
  if (!rec) return blankBody(cleanName(name));
  const src = rec.source;
  if (!src || !["npc", "character"].includes(src.type)) throw new Refusal("That isn't a book NPC or archetype.");
  const n = cleanName(name || src.name);
  const body = blankBody(n);
  body.source = { catalogId, kind: src.type === "npc" ? "contact" : "archetype", prRange: rec.prRange ?? null };
  body.actor.img = src.img ?? body.actor.img;
  if (src.prototypeToken) body.actor.prototypeToken = { ...structuredClone(src.prototypeToken), name: n };
  if (src.type === "npc") {
    body.actor.system = filled({ ...structuredClone(src.system), threatRating: 0 });
    withIds(body, src.items ?? []);
    return body;
  }
  const { system, notes } = archetypeSystem(src);
  body.actor.system = system;
  body.notes = notes;
  withIds(body, src.items ?? []);
  return body;
}

/**
 * An archetype (a character actor) as an NPC stat block (PLAN 2): the app's derive (parity-tested with Foundry's
 * character preparation) gives the prepared numbers; each is baked into the NPC field that reproduces it under
 * npcDerived, less what the items' transfer effects will add again.
 */
function archetypeSystem(src) {
  const d = derive({ actor: src, options: { moreMetahumans: false } });
  const zero = filled(Object.fromEntries(NPC_ATTRS.map(a => [a, { base: 0, mod: 0 }])));
  zero.reaction.mod = 0; zero.initiative.dice = 0; zero.armor = { ballistic: 0, impact: 0 };
  const fx = npcWithEffects(zero, src.items ?? []).system;   // only what effects add (0 in today's packs: a test pins it)
  const s = filled({});
  for (const a of NPC_ATTRS) s[a] = { base: d.attributes[a] - fx[a].mod, mod: 0 };
  const v = d.attributes;
  s.reaction.mod = d.reaction - Math.floor((v.quickness + v.intelligence) / 2) - fx.reaction.mod;
  s.initiative.dice = d.initiativeDice - fx.initiative.mod;
  s.combatPoolBonus = Math.max(0, d.pools.combat - Math.floor((v.quickness + v.intelligence + v.willpower) / 2));
  const worn = wornArmorTotals((src.items ?? []).filter(i => i.type === "armor" && i.system?.equipped));
  s.armor = { ballistic: d.armor.ballistic - worn.ballistic - fx.armor.ballistic, impact: d.armor.impact - worn.impact - fx.armor.impact };
  s.essence = { value: d.essence, max: 6 };
  const m = src.system.magic ?? {};
  s.magic = { value: d.magic, max: d.magic, type: m.type ?? "none", tradition: m.tradition ?? "none", totem: m.totem ?? "" };
  s.dicePools = { combat: { value: 0, max: 0 }, magic: { value: d.pools.magic, max: d.pools.magic }, astral: { value: 0, max: 0 } };
  s.race = src.system.race ?? "human";
  s.professionalRating = 4;   // p.187: "any shadowrunner" is Professional
  s.nuyen = Number(src.system.nuyen) || 0;
  s.biography = src.system.biography ?? "";
  const extra = [["Hacking", d.pools.hacking], ["Control", d.pools.control]].filter(([, n]) => n > 0).map(([k, n]) => `${k} Pool ${n}`);
  const notes = `Made from the ${src.name} archetype (core book).${extra.length ? ` Foundry's NPC sheet has no ${extra.join(" or ")}: roll it by hand.` : ""}`;
  return { system: s, notes };
}

const ours = (b, id) => {
  const i = typeof id === "string" ? b.actor.items.find(x => x._id === id) : null;
  if (!i) throw new Refusal("No such item on this NPC.");
  return i;
};
const RATED = (i) => i.type === "skill" || typeof i.system?.rating === "number";

/** Apply one operation; refusals change nothing. `lookup(catalogId)` gives a catalog entry. */
export function applyNpcOp(body, op, lookup = () => null) {
  if (!op || typeof op !== "object" || !Object.hasOwn(NPC_OPS, op.op)) throw new Refusal("Unknown operation.");
  const b = structuredClone(body), sys = b.actor.system = filled(b.actor.system);
  switch (op.op) {
    case "setName": b.name = b.actor.name = cleanName(op.name); if (b.actor.prototypeToken) b.actor.prototypeToken.name = b.name; break;
    case "setNotes":
      if (typeof op.notes !== "string" || op.notes.length > 20000) throw new Refusal("Notes are at most 20,000 characters.");
      b.notes = op.notes; break;
    case "setRace":
      if (!RACE_KEYS.includes(op.race)) throw new Refusal("Choose one of the system's races.");
      sys.race = op.race; break;
    case "setAttribute":
      if (!NPC_ATTRS.includes(op.attr)) throw new Refusal("No such attribute.");
      sys[op.attr].base = whole(op.base, 1, MAX_ATTR, "An attribute"); break;
    case "setEssence":
      if (typeof op.value !== "number" || !Number.isFinite(op.value) || op.value < 0 || op.value > 99) throw new Refusal("Essence is a number from 0 to 99 (critters print more than 6).", 217);
      sys.essence.value = op.value; sys.essence.max = Math.max(6, op.value); break;
    case "setMagic": {
      if (!MAGIC_TYPES.includes(op.type) || !TRADITIONS.includes(op.tradition)) throw new Refusal("Choose a magic type and tradition the system knows.");
      if (op.totem && !Object.hasOwn(TABLES.totems, op.totem)) throw new Refusal("Choose one of the system's totems.", 119);
      if (op.totem && op.tradition !== "shamanic") throw new Refusal("Only a shaman follows a totem.", 119);
      const v = whole(op.value, 0, 99, "Magic");
      sys.magic = { ...sys.magic, value: v, max: v, type: op.type, tradition: op.tradition, totem: op.totem ?? "" };
      break;
    }
    case "setBodyIndex":   // Shadowtech p.6: above natural Body is overstress, so no cap but the input bound (r4, r5 #1)
      if (typeof op.value !== "number" || !Number.isFinite(op.value) || op.value < 0 || op.value > 99) throw new Refusal("Body Index is a number from 0 to 99.");
      sys.bodyIndex.value = op.value; break;
    case "setArmor":
      sys.armor = { ballistic: whole(op.ballistic, 0, 99, "Ballistic armor"), impact: whole(op.impact, 0, 99, "Impact armor") }; break;
    case "setReactionMod": sys.reaction.mod = whole(op.mod, -20, 20, "A Reaction modifier"); break;
    case "setCombatPoolBonus": sys.combatPoolBonus = whole(op.bonus, 0, 20, "A Combat Pool bonus"); break;
    case "setInitiativeDice": sys.initiative.dice = whole(op.dice, 1, 5, "Initiative dice"); break;
    case "setNuyen": sys.nuyen = whole(op.nuyen, 0, MAX_NUYEN, "Nuyen"); break;
    case "setProfessionalRating":   // picking a rating settles a printed range (code review r1 #2)
      sys.professionalRating = whole(op.rating, 1, 4, "A Professional Rating (p.187)");
      if (b.source?.prRange) b.source.prPicked = true;
      break;
    case "setThreatRating": sys.threatRating = whole(op.rating, 0, MAX_THREAT, "A Threat Rating"); break;
    case "addItem": {
      const e = lookup(op.catalogId);
      if (!e || e.kind === "actor" || !e.system) throw new Refusal("That isn't an item in the catalog.");
      if (b.actor.items.length >= MAX_NPC_ITEMS) throw new Refusal(`An NPC holds at most ${MAX_NPC_ITEMS} items here.`);
      // Its rule flags kept (a drug's flags.sr2e.drug is how Foundry knows it; code review r1 #1); book prose stays out,
      // as on every export (the catalog splits it off).
      const flags = structuredClone(e.flags ?? {});
      flags.sr2e = { ...(flags.sr2e ?? {}), catalogId: e.id };
      const item = { name: e.name, type: e.type, img: e.img ?? null, system: structuredClone(e.system), effects: structuredClone(e.effects ?? []),
        flags, ...(e.uuid ? { _stats: { compendiumSource: e.uuid } } : {}) };
      if (op.rating != null) {
        if (!RATED(item)) throw new Refusal(`${e.name} has no rating.`);
        item.system.rating = whole(op.rating, 0, MAX_SKILL, "A rating");
      }
      withIds(b, [item]);
      break;
    }
    case "addCustomSkill": {
      if (!SKILL_CATEGORIES.includes(op.category)) throw new Refusal("Choose one of the system's skill categories.", 66);
      if (!NPC_ATTRS.includes(op.attribute)) throw new Refusal("Choose the skill's linked attribute.", 66);
      if (b.actor.items.length >= MAX_NPC_ITEMS) throw new Refusal(`An NPC holds at most ${MAX_NPC_ITEMS} items here.`);
      const name = cleanName(op.name, "A skill's name");
      if (name.length > 80) throw new Refusal("A skill's name is 1 to 80 characters.");
      withIds(b, [{ name, type: "skill", img: null, effects: [], flags: {}, system: { category: op.category, linkedAttribute: op.attribute,
        rating: whole(op.rating, 0, MAX_SKILL, "A skill's rating"), concentration: { name: "", rating: 0 }, specialization: { name: "", rating: 0 } } }]);
      break;
    }
    case "setItemRating": {
      const i = ours(b, op.itemId);
      if (!RATED(i)) throw new Refusal(`${i.name} has no rating.`);
      i.system.rating = whole(op.rating, 0, MAX_SKILL, "A rating");
      break;
    }
    case "setEquipped": {   // the only item state NPC preparation reads: worn armor (p.242) and the weapon in hand (r1 #6)
      const i = ours(b, op.itemId);
      if (!["armor", "weapon"].includes(i.type)) throw new Refusal("Only armor and weapons are equipped.");
      if (typeof op.equipped !== "boolean") throw new Refusal("Equipped is yes or no.");
      i.system.equipped = op.equipped;
      break;
    }
    case "removeItem": { const i = ours(b, op.itemId); b.actor.items = b.actor.items.filter(x => x !== i); break; }
    case "applyExperience": applyExperience(b, op); break;
  }
  b.actor.system = sys;
  return b;
}

/** p.187's experience, applied ONCE to the stored values (R22: nearest, halves up; a modifier stays as it is). */
export function experiencePreview(body, { years, attributes, skills, resources }) {
  const pct = npcExperiencePct(years), sys = filled(body.actor.system), out = [];
  if (attributes) for (const a of NPC_ATTRS) out.push({ what: a[0].toUpperCase() + a.slice(1), from: sys[a].base, to: npcExperienced(sys[a].base, pct), max: MAX_ATTR, set: (s) => { s[a].base = npcExperienced(sys[a].base, pct); } });
  if (skills) for (const i of body.actor.items.filter(x => x.type === "skill")) for (const k of ["rating", "concentration", "specialization"]) {
    const from = k === "rating" ? i.system.rating : i.system[k]?.rating;
    if (!(from > 0) || (k !== "rating" && !i.system[k]?.name)) continue;
    out.push({ what: k === "rating" ? i.name : `${i.name} (${i.system[k].name})`, from, to: npcExperienced(from, pct), max: MAX_SKILL, itemId: i._id, field: k });
  }
  if (resources) out.push({ what: "Nuyen", money: true, from: sys.nuyen, to: npcExperienced(sys.nuyen, pct), max: MAX_NUYEN, set: (s) => { s.nuyen = npcExperienced(sys.nuyen, pct); } });
  return { pct, changes: out.filter(c => c.to !== c.from) };
}
function applyExperience(b, op) {
  whole(op.years, 1, 60, "Years of experience");
  if (!op.attributes && !op.skills && !op.resources) throw new Refusal("Choose what the experience raises: Attributes, Skills or Resources.", 187);
  const { pct, changes } = experiencePreview(b, op);
  const over = changes.find(c => c.to > c.max);
  if (over) throw new Refusal(`${over.what} would be ${over.to}, above this builder's limit of ${over.max}.`);
  for (const c of changes) {
    if (c.set) c.set(b.actor.system);
    else { const i = b.actor.items.find(x => x._id === c.itemId); if (c.field === "rating") i.system.rating = c.to; else i.system[c.field].rating = c.to; }
  }
  b.experience = [...(b.experience ?? []), { years: op.years, pct, targets: ["attributes", "skills", "resources"].filter(k => op[k]) }];
}

/** What the page shows: the derived block (the system's npcDerived, as Foundry prepares the export) and the p.187 notes. */
export function npcView(body) {
  const sys = filled(body.actor.system), items = body.actor.items ?? [];
  const { system, unsupported } = npcWithEffects(sys, items);
  const awakened = sys.magic.type !== "none" || (sys.magic.value ?? 0) > 0 || items.some(i => i.type === "spell");
  const d = npcDerived(system, { awakened, armorItems: items });
  const pr = PROFESSIONAL_RATINGS[sys.professionalRating] ?? null;
  return { ...d, awakened, unsupported, professional: pr, prRange: body.source?.prPicked ? null : body.source?.prRange ?? null, threat: sys.threatRating,
    monitors: { physical: 10, stun: 10 } };
}

/** The sourcebooks an NPC's items cite (shown, never required: a GM's NPC needs no book toggle). */
export function npcBooks(body) {
  const out = new Set();
  for (const i of body.actor.items ?? []) { const k = i.system?.citation?.book; if (typeof k === "string" && k) out.add(k); }
  out.delete("sr2");
  return [...out].sort();
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** The Foundry NPC actor this document describes: its name, its notes and the Threat note added to the biography. */
export function npcActor(body) {
  const a = structuredClone(body.actor);
  a.name = body.name;
  a.system = filled(a.system);
  if (a.prototypeToken) a.prototypeToken = { ...a.prototypeToken, name: body.name };
  const paras = String(body.notes ?? "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (a.system.threatRating > 0) paras.push(`Threat Rating ${a.system.threatRating}: roll these dice by hand; core p.187 says this NPC uses no Dice Pools.`);
  const extra = paras.map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  if (extra) a.system.biography = `${a.system.biography ?? ""}${extra}`;
  return a;
}
