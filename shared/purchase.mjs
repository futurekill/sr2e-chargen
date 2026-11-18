/**
 * Buying things with Resources (docs/PLAN-M2c.md): which catalog entries a character can buy, the choices each type
 * takes, and the projection of (catalog snapshot, choices) into the Foundry item's `system` — rebuilt after every
 * operation, so no price or rule field is ever stored as typed. Prices and Essence come from the system's own pure
 * functions (shared/rules.mjs), called with the same inputs Foundry's creation panel gives them.
 */
import { chargenItemCost, ratedRow, wareCtx, containerEssence, eyeAccessoryKind, rowsListValue } from "./rules.mjs";

export const BUYABLE = ["weapon", "armor", "gear", "ammo", "cyberware", "spell", "focus"];
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
    case "weapon": return { quantity: int(1, 20), ...(s.costPerStrengthMin > 0 ? { strengthMinimum: int(1, 10) } : {}) };
    case "armor": return { quantity: int(1, 5) };
    case "gear":
      if (s.category === "skillsoft") return { quantity: int(1, 1000), rating: int(1, 6), skill: text() };
      return { quantity: int(1, 1000), ...(s.costPerRating > 0 ? { rating: int(1, 6) } : rows.length > 1 ? { rating: oneOf(rows) } : {}) };
    case "ammo": return { bundles: int(1, 100) };
    case "cyberware": return { ...(rows.length > 1 ? { rating: oneOf(rows) } : {}), ...(isEyeAccessory(rec) ? { in: text() } : {}) };
    case "spell": return { force: int(1, 6) };   // "no starting spell can have a Force greater than 6" (p.46)
    case "focus": return { ...(s.focusType === "spell_lock" ? {} : { force: int(1, 6) }), ...(s.focusType === "spell" ? { spell: text() } : {}) };
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
  if (entry.type === "adept_power") return "Adept powers arrive in the next step of character creation (their costs need the book's tables).";
  if (entry.type === "vehicle") return "Vehicles wait for the Foundry system to count them at creation.";
  if (["program", "lifestyle", "contact"].includes(entry.type)) return "Programs, lifestyles and contacts arrive with the next system release.";
  if (!BUYABLE.includes(entry.type)) return "That isn't something a character buys.";
  if (entry.system?.limbOption) return "A cyberlimb option needs a cyberlimb: it arrives with the Cybertechnology rules.";
  if (entry.system?.category === "skillsoft" && entry.system?.grantedSkillCategory === "data") return "A DataSoft's price varies with its data (core): not yet.";
  if (entry.type === "focus" && entry.system?.focusType === "weapon") return "A weapon focus is priced by the weapon it's bonded to: not yet.";
  const rec = { type: entry.type, name: entry.name, snapshot: entry.system, flags: entry.flags ?? {}, source: entry._stats?.compendiumSource ?? null };
  if (entry.type !== "spell" && price(rec, project(rec, defaultChoices(rec)), []) <= 0) return "This has no fixed price in the core book (it varies): not yet.";
  return null;
}

/** Bonding cost in Force Points (core p.137, Focus Bonding Table). */
export function bondingCost(focusType, force) {
  const f = Math.max(1, force || 1);
  return { spell: f, spirit: 2 * f, power: 5 * f, spell_lock: 1 }[focusType] ?? f;
}

/** The item's `system` (and flags) from its snapshot and choices. */
export function project(rec, c) {
  const s = structuredClone(rec.snapshot), flags = structuredClone(rec.flags ?? {});
  if ("quantity" in c) s.quantity = c.quantity;
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
  if (rec.type === "focus") {
    s.bondingCost = bondingCost(s.focusType, s.force);
    s.bonded = s.focusType !== "spell_lock";   // creation pays the bond (p.46); a lock bonds when it locks a spell (p.138)
    if (s.focusType === "spell") { s.spellSubtype = "specific"; s.boundSpellId = c.spell ?? ""; }
  }
  return { system: s, flags };
}

/** What `chargenItemCost` is given for one item, as Foundry's `chargenBudgetOf` builds it. */
export function priceInput(item, items) {
  return { ...item.system, type: item.type, name: item.name, acquiredListValue: item.flags?.sr2e?.acquiredListValue,
    moduleListValue: rowsListValue(item.system.modules ?? []),
    ...(item.type === "cyberware" ? wareCtx(items, item) : {}) };
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
  const ctx = wareCtx(items, item);
  return containerEssence({ base, rows, capacity: s.capacity, eyes: s.eyes ?? "pair", isEye: ctx.wareRule === "cybereye-pair", graded: false }, (e) => e);
}
export { isCybereye, isEyeAccessory };
