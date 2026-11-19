/**
 * Buying things with Resources (docs/PLAN-M2c.md): which catalog entries a character can buy, the choices each type
 * takes, and the projection of (catalog snapshot, choices) into the Foundry item's `system` — rebuilt after every
 * operation, so no price or rule field is ever stored as typed. Prices and Essence come from the system's own pure
 * functions (shared/rules.mjs), called with the same inputs Foundry's creation panel gives them.
 */
import { chargenItemCost, weaponFocusCost, adeptPowerKey, ratedRow, wareCtx, containerEssence, eyeAccessoryKind, rowsListValue } from "./rules.mjs";

export const BUYABLE = ["weapon", "armor", "gear", "ammo", "cyberware", "spell", "focus", "adept_power"];
const STRING_MAX = 60;

const int = (lo, hi) => ({ kind: "int", lo, hi });
const oneOf = (values) => ({ kind: "oneOf", values });
const text = () => ({ kind: "text" });
const isEyeAccessory = (e) => !!eyeAccessoryKind(e.flags, e.source);
const isCybereye = (rec) => rec.type === "cyberware" && (rec.snapshot.capacity ?? 0) > 0;

/** The choices an entry takes: `{ key: spec }`. Only these keys are ever accepted (PLAN-M2c §2). */
export function choiceSpec(rec) {
  const s = rec.snapshot;
  const rows = (s.ratingStats ?? []).map(r => r.rating).filter(r => r <= 6);
  switch (rec.type) {
    case "weapon": return { quantity: int(1, 20), ...(s.costPerStrengthMin > 0 ? { strengthMinimum: int(1, 6) } : {}) };
    case "armor": return { quantity: int(1, 5) };
    case "gear":
      if (s.category === "skillsoft") return { quantity: int(1, 1000), rating: int(1, 6), skill: text() };
      return { quantity: int(1, 1000), ...(s.costPerRating > 0 ? { rating: int(1, 6) } : rows.length > 1 ? { rating: oneOf(rows) } : {}) };
    case "ammo": return { bundles: int(1, 100) };
    case "cyberware": return { ...(rows.length > 1 ? { rating: oneOf(rows) } : {}), ...(isEyeAccessory(rec) ? { in: text() } : {}) };
    case "spell": return { force: int(1, 6) };   // "no starting spell can have a Force greater than 6" (p.46)
    case "focus": return { ...(s.focusType === "spell_lock" ? {} : { force: int(1, 6) }), ...(s.focusType === "spell" ? { spell: text() } : {}),
      ...(s.focusType === "weapon" ? { weapon: text() } : {}) };
    case "adept_power": {   // p.124–126: a level where the power has one; Improved Ability names a skill, Senses list theirs
      const key = powerKeyOf(rec);
      if (key === "improved_senses") return { senses: text() };
      const top = Number(s.maxLevel) || 1;
      return { ...(top > 1 ? { level: int(1, top) } : {}), ...(key === "improved_ability" ? { skill: text() } : {}) };
    }
    default: return {};
  }
}
/** A new purchase's choices: the entry's own values where it has them. */
export function defaultChoices(rec) {
  const s = rec.snapshot, out = {};
  for (const [k, spec] of Object.entries(choiceSpec(rec))) {
    if (spec.kind === "text") out[k] = "";
    else if (k === "rating") out[k] = spec.kind === "oneOf" ? spec.values.find(v => v >= (s.rating || 1)) ?? spec.values[0] : Math.min(6, Math.max(1, s.rating || 1));
    else if (k === "force") out[k] = Math.max(1, s.force || 1);
    else if (k === "strengthMinimum") out[k] = Math.max(1, s.strengthMinimum || 1);
    else if (spec.kind === "oneOf") out[k] = spec.values[0];
    else out[k] = 1;
  }
  return out;
}
/** Check a full set of choices against the spec; returns the cleaned choices or a reason. */
export function checkChoices(rec, choices) {
  if (!choices || typeof choices !== "object" || Array.isArray(choices)) return { reason: "Choices are an object." };
  const spec = choiceSpec(rec), out = {};
  for (const k of Object.keys(choices)) if (!Object.hasOwn(spec, k)) return { reason: `${rec.name} has no choice "${k}".` };
  for (const [k, sp] of Object.entries(spec)) {
    const v = Object.hasOwn(choices, k) ? choices[k] : rec.choices?.[k];
    if (sp.kind === "int" && !(Number.isInteger(v) && v >= sp.lo && v <= sp.hi)) return { reason: `${rec.name}: ${k} is a whole number from ${sp.lo} to ${sp.hi}.` };
    if (sp.kind === "oneOf" && !sp.values.includes(v)) return { reason: `${rec.name}: ${k} is one of ${sp.values.join(", ")} (no starting gear above 6, p.44).` };
    if (sp.kind === "text") {
      if (typeof v !== "string") return { reason: `${rec.name}: ${k} is text.` };
      const t = v.replace(/\s+/g, " ").trim();
      if (t.length > STRING_MAX) return { reason: `${rec.name}: ${k} is at most ${STRING_MAX} characters.` };
      out[k] = t; continue;
    }
    out[k] = v;
  }
  return { choices: out };
}

/** Why an entry can't be bought in milestone 2c, or null (PLAN-M2c §1). */
export function refusalFor(entry) {
  if (entry.type === "vehicle") return "Vehicles wait for the Foundry system to count them at creation.";
  if (["program", "lifestyle", "contact"].includes(entry.type)) return "Programs, lifestyles and contacts arrive with the next system release.";
  if (!BUYABLE.includes(entry.type)) return "That isn't something a character buys.";
  if (entry.system?.limbOption) return "A cyberlimb option needs a cyberlimb: it arrives with the Cybertechnology rules.";
  if (entry.system?.category === "skillsoft" && entry.system?.grantedSkillCategory === "data") return "A DataSoft's price varies with its data (core): not yet.";
  const rec = { type: entry.type, name: entry.name, snapshot: entry.system, flags: entry.flags ?? {}, source: entry._stats?.compendiumSource ?? null };
  if (entry.type !== "spell" && entry.type !== "adept_power" && price(rec, project(rec, defaultChoices(rec)), []) <= 0) return "This has no fixed price in the core book (it varies): not yet.";
  return null;
}

/** Which book power a record is (the system's adeptPowerKey, from its compendium source or name). */
export const powerKeyOf = (rec) => adeptPowerKey({ name: rec.name, flags: rec.flags, _stats: { compendiumSource: rec.source } }) ?? "";

/** Improved Physical Senses' named improvements: comma-separated, trimmed, no blanks. */
export const sensesOf = (t) => String(t ?? "").split(",").map(x => x.trim()).filter(Boolean);

/** Bonding cost in Force Points (core p.137, Focus Bonding Table). */
export function bondingCost(focusType, force) {
  const f = Math.max(1, force || 1);
  return { spell: f, spirit: 2 * f, power: 5 * f, spell_lock: 1 }[focusType] ?? f;
}

/** A small weapon for the focus bond (p.137 never defines it; RULINGS R5, the GM): Concealability above 5. 99 is the
 * data's "cannot be concealed". */
export const smallWeapon = (w) => { const c = Number(w?.concealability) || 0; return c > 5 && c < 99; };

/** The item's `system` (and flags) from its snapshot and choices; `recs` are the character's records (a weapon focus
 * reads its weapon's Reach). */
export function project(rec, c, recs = {}) {
  const s = structuredClone(rec.snapshot), flags = structuredClone(rec.flags ?? {});
  if ("quantity" in c) s.quantity = c.quantity;
  if (rec.type === "armor") s.equipped = true;   // armor bought at creation is worn (docs/PLAN-sheet.md, r1 #4)
  if ("rating" in c) s.rating = c.rating;
  if ("strengthMinimum" in c) s.strengthMinimum = c.strengthMinimum;
  if (rec.type === "gear" && s.category === "skillsoft") s.grantedSkill = c.skill;
  if (rec.type === "ammo") {
    s.quantity = c.bundles * (rec.snapshot.quantity || 1);
    flags.sr2e = { ...(flags.sr2e ?? {}), acquiredListValue: c.bundles * (rec.snapshot.cost || 0) };
  }
  if (rec.type === "cyberware") {
    const row = ratedRow(s.ratingStats, s.rating);
    if (row && typeof row.essenceCost === "number") s.essenceCost = row.essenceCost;
    s.grade = "standard";
  }
  if (rec.type === "spell" || rec.type === "focus") s.force = c.force ?? s.force;
  if (rec.type === "adept_power") {
    if ("level" in c) s.level = c.level;
    // Improved Ability: the system matches the skill by NAME, re-resolved on every rebuild ("" once the skill is gone).
    if ("skill" in c) s.improvedSkill = recs[c.skill]?.type === "skill" ? recs[c.skill].name : "";
    if ("senses" in c) {   // the named improvements are the level (p.126), kept in the notes as Foundry does
      const list = sensesOf(c.senses);
      s.level = Math.max(1, list.length);
      s.notes = list.length ? `Senses: ${list.join(", ")}` : "";
    }
  }
  if (rec.type === "focus") {
    s.bondingCost = bondingCost(s.focusType, s.force);
    s.bonded = s.focusType === "weapon" ? !!c.weapon : s.focusType !== "spell_lock";   // creation pays the bond (p.46); a lock bonds when it locks a spell (p.138)
    if (s.focusType === "spell") { s.spellSubtype = "specific"; s.boundSpellId = c.spell ?? ""; }
    if (s.focusType === "weapon") {   // p.137 bond, p.263 price; unbonded it is priced at Reach 0, its lowest
      s.bondedWeaponId = c.weapon ?? "";
      const w = recs[c.weapon]?.snapshot;
      s.bondingCost = (w && !smallWeapon(w) ? 5 : 4) * s.force;
      s.cost = weaponFocusCost(Number(w?.reach) || 0, s.force);
    }
  }
  return { system: s, flags };
}

/** The items as the documents `wareCtx` reads (an id and the SOURCE system), so it sees what Foundry sees (r1 #1). */
const asDocs = (items) => items.map(i => ({ ...i, id: i._id, _source: { system: i.system } }));
const ctxOf = (items, item) => wareCtx(asDocs(items), { ...item, id: item._id, _source: { system: item.system } });
/** What `chargenItemCost` is given for one item, as Foundry's `chargenBudgetOf` builds it. */
export function priceInput(item, items) {
  return { ...item.system, type: item.type, name: item.name, acquiredListValue: item.flags?.sr2e?.acquiredListValue,
    moduleListValue: rowsListValue(item.system.modules ?? []),
    ...(item.type === "cyberware" ? ctxOf(items, item) : {}) };
}
/** One item's list price. */
export function price(rec, projected, items) {
  const item = { type: rec.type, name: rec.name, system: projected.system, flags: projected.flags, _stats: { compendiumSource: rec.source } };
  const i = priceInput(item, [...items, item]);
  return chargenItemCost(i);   // the system's own: ammo by its bundle value, the rest list × quantity + eye rows
}

/** An eye accessory's row inside its cybereye, in the system's own shape (core p.247). */
export function eyeRow(id, rec, projected) {
  const s = projected.system;
  return { id, name: rec.name, essenceCost: s.essenceCost ?? 0, kind: eyeAccessoryKind(rec.flags, rec.source), eye: "both",
    cost: s.cost ?? 0, rating: s.rating ?? 0, combatTnMod: s.combatTnMod ?? 0, active: true, notes: "", paid: 0, listValue: s.cost ?? 0 };
}

/** One cyberware item's Essence: its own, plus the part of its accessories beyond the eye's free allowance. */
export function essenceOf(item, items) {
  const s = item.system, base = Number(s.essenceCost) || 0;
  const rows = (s.modules ?? []).reduce((t, r) => t + (Number(r.essenceCost) || 0), 0);
  if (!(s.capacity > 0)) return base;
  const ctx = ctxOf(items, item);
  return containerEssence({ base, rows, capacity: s.capacity, eyes: s.eyes ?? "pair", isEye: ctx.wareRule === "cybereye-pair", graded: false }, (e) => e);
}
export { isCybereye, isEyeAccessory };
