/**
 * Buying things with Resources (docs/PLAN-M2c.md): which catalog entries a character can buy, the choices each type
 * takes, and the projection of (catalog snapshot, choices) into the Foundry item's `system` — rebuilt after every
 * operation, so no price or rule field is ever stored as typed. Prices and Essence come from the system's own pure
 * functions (shared/rules.mjs), called with the same inputs Foundry's creation panel gives them.
 */
import { chargenItemCost, weaponFocusCost, adeptPowerKey, ratedRow, wareCtx, eyeAccessoryKind, rowsListValue, wareEssence, muscleFactor, QUALITY_VALUES, qualityRule, wareRule, limbRole, resolveLimbType, resolveOptionKind, SIDED, limbOptionPrice, limbModel, limbStats, limbEssence, forLimbRules } from "./rules.mjs";

export const BUYABLE = ["weapon", "armor", "gear", "ammo", "cyberware", "bioware", "spell", "focus", "adept_power", "program", "contact", "lifestyle"];
const STRING_MAX = 60;

const int = (lo, hi) => ({ kind: "int", lo, hi });
const oneOf = (values) => ({ kind: "oneOf", values });
const text = () => ({ kind: "text" });
const isEyeAccessory = (e) => !!eyeAccessoryKind(e.flags, e.source);
const isCybereye = (rec) => rec.type === "cyberware" && (rec.snapshot.capacity ?? 0) > 0;

/** The choices an entry takes: `{ key: spec }`. Only these keys are ever accepted (PLAN-M2c §2). In play
 * (`inPlay`, docs/PLAN-M4b.md Draft 2) the creation cap of Rating 6 is gone (any rating the entry lists, else up to
 * 12) and an eye accessory is bought on its own (fitting it is surgery, M4c). */
export function choiceSpec(rec, { inPlay = false } = {}) {
  const s = rec.snapshot, top = inPlay ? 12 : 6;
  const rows = (s.ratingStats ?? []).map(r => r.rating).filter(r => inPlay || r <= 6);
  switch (rec.type) {
    case "weapon": return { quantity: int(1, 20), ...(s.costPerStrengthMin > 0 ? { strengthMinimum: int(1, 6) } : {}) };
    case "armor": return { quantity: int(1, 5) };
    case "gear":
      if (s.category === "skillsoft") return { quantity: int(1, 1000), rating: int(1, top), skill: text() };
      return { quantity: int(1, 1000), ...(s.costPerRating > 0 ? { rating: int(1, top) } : rows.length > 1 ? { rating: oneOf(rows) } : {}) };
    case "ammo": return { bundles: int(1, 100) };
    // Grades (SSC p.98; PLAN-M5f): at creation only, never for Shadowtech's cyberware (p.40); the SSC must be on (validate).
    // A sided cyberlimb's side, an option's limb (PLAN-M5j): "" until chosen (creation reports it).
    case "cyberware": return { ...(rows.length > 1 ? { rating: oneOf(rows) } : s.costPerRating > 0 ? { rating: int(1, top) } : {}), ...(!inPlay && isEyeAccessory(rec) ? { in: text() } : {}),
      ...(SIDED.has(limbTypeOf(rec)) && !isLimbOption(rec) ? { side: oneOf(["", "left", "right"]) } : {}),   // in play too: surgery installs it (r1 #2)
      ...(!inPlay && isLimbOption(rec) ? { limb: text() } : {}),
      ...(!inPlay && !String(rec.source ?? "").includes("sr2e-shadowtech") ? { grade: oneOf(CYBER_GRADES) } : {}) };
    case "spell": return { force: int(1, 6) };   // "no starting spell can have a Force greater than 6" (p.46)
    case "focus": return { ...(s.focusType === "spell_lock" ? {} : { force: int(1, 6) }), ...(s.focusType === "spell" ? { spell: text() } : {}),
      ...(s.focusType === "weapon" ? { weapon: text() } : {}) };
    case "program": return { rating: int(1, top) };   // no starting gear above Rating 6 (p.46)
    case "contact": return rec.catalogId ? { kind: oneOf(["contact", "buddy"]) } : {};   // gangs and followers: addExtra / setExtra
    case "lifestyle": return { months: int(1, 60) };   // prepaid months (p.46); 60 is a sanity bound, the book sets none
    case "adept_power": {   // p.124–126: a level where the power has one; Improved Ability names a skill, Senses list theirs
      const key = powerKeyOf(rec);
      if (key === "improved_senses") return { senses: text() };
      const top = Number(s.maxLevel) || 1;
      return { ...(top > 1 ? { level: int(1, top) } : {}), ...(key === "improved_ability" ? { skill: text() } : {}) };
    }
    case "bioware": {   // PLAN-M5e: a rating row (≤ 6 at creation) and the grade; neural is always cultured (no choice)
      const grade = s.bodySystem === "neural" ? {} : { grade: oneOf(["standard", "cultured"]) };
      return { ...(rows.length > 1 ? { rating: oneOf(rows) } : {}), ...grade };
    }
    case "quality": {   // Edges and Flaws (Companion p.22–35, PLAN-M5d): the table's values, an attribute, a detail
      const v = QUALITY_VALUES[rec.source] ?? {}, rule = qualityRule(rec.snapshot?.rule, rec.source);
      if (v.attribute) return { attribute: oneOf(QUALITY_ATTRS), gain: int(1, 5), detail: text() };
      const values = v.variable ? (v.variable === "edge" ? [1, 2, 3, 4, 5, 6] : [-1, -2, -3, -4, -5, -6])
        : [...new Set([...(v.values ?? []), ...(v.magicallyActive ?? [])])];
      return { ...(rule === "exceptional-attribute" ? { attribute: oneOf(QUALITY_ATTRS) } : {}),
        ...(values.length > 1 ? { points: oneOf(values) } : {}), detail: text() };
    }
    default: return {};
  }
}
/** Cyberware grades the app offers at creation (SSC p.98): delta waits for its own page. */
export const CYBER_GRADES = ["standard", "alpha", "beta"];
/** The attributes an attribute Edge may name (p.24: not Essence, Reaction or Magic). */
export const QUALITY_ATTRS = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];
/** A new purchase's choices: the entry's own values where it has them. */
export function defaultChoices(rec, opts) {
  const s = rec.snapshot, out = {};
  for (const [k, spec] of Object.entries(choiceSpec(rec, opts))) {
    if (spec.kind === "text") out[k] = "";
    else if (k === "rating") out[k] = spec.kind === "oneOf" ? spec.values.find(v => v >= (s.rating || 1)) ?? spec.values[0] : Math.min(spec.hi, Math.max(spec.lo, s.rating || 1));
    else if (k === "force") out[k] = Math.max(1, s.force || 1);
    else if (k === "points") out[k] = spec.values.includes(s.pointValue) ? s.pointValue : spec.values[0];
    else if (k === "attribute" && rec.type === "quality") out[k] = spec.values.includes(s.attribute) ? s.attribute : spec.values[0];
    else if (k === "strengthMinimum") out[k] = Math.max(1, s.strengthMinimum || 1);
    else if (spec.kind === "oneOf") out[k] = spec.values[0];
    else out[k] = 1;
  }
  return out;
}
/** Check a full set of choices against the spec; returns the cleaned choices or a reason. */
export function checkChoices(rec, choices, opts) {
  if (!choices || typeof choices !== "object" || Array.isArray(choices)) return { reason: "Choices are an object." };
  const spec = choiceSpec(rec, opts), out = {};
  for (const k of Object.keys(choices)) if (!Object.hasOwn(spec, k)) return { reason: `${rec.name} has no choice "${k}".` };
  for (const [k, sp] of Object.entries(spec)) {
    // A record made before a choice existed takes its default (cyberware bought before grades: standard).
    const v = Object.hasOwn(choices, k) ? choices[k] : rec.choices?.[k] ?? (k === "grade" ? "standard" : undefined);
    if (sp.kind === "int" && !(Number.isInteger(v) && v >= sp.lo && v <= sp.hi)) return { reason: `${rec.name}: ${k} is a whole number from ${sp.lo} to ${sp.hi}.` };
    if (sp.kind === "oneOf" && !sp.values.includes(v)) return { reason: `${rec.name}: ${k} is one of ${sp.values.join(", ")}${opts?.inPlay ? "" : " (no starting gear above 6, p.44)"}.` };
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

/* ── Cyberlimbs (docs/PLAN-M5j.md Draft 2) ─────────────────────────────────────────────────────────────────── */
const CTL = (id) => `Compendium.sr2e-cybertechnology.ct-cyberlimbs.Item.${id}`;
/** The "other" options checked against the book (Draft 2, r1 #8): coverings, External Mount, Magnetic System, DNI. */
const LIMB_OTHER_OFFERED = new Set(["c95c853f0df4d549", "0c136ee98018d026", "5a2e9c5a1a71b5d8", "3f3a5f25f8f76a06", "3f225dc670d0102a", "a14f54f55d66846f"].map(CTL));
const LIMB_KINDS_OFFERED = new Set(["strength", "quickness", "body", "smartlink"]);
const srcOf = (e) => e._stats?.compendiumSource ?? e.source ?? null;
/** A limb's resolved type (field, rule or known source; never `location`), or null. */
export const limbTypeOf = (e) => resolveLimbType(e.system ?? e.snapshot ?? {}, e.flags ?? {}, srcOf(e)).type;
/** An option's resolved kind, or null. */
export const optionKindOf = (e) => resolveOptionKind(e.system ?? e.snapshot ?? {}, e.flags ?? {}, srcOf(e)).kind;
const isLimbOption = (e) => !!(e.system ?? e.snapshot)?.limbOption;
/** Why a limb or option can't be bought, or null; undefined when the entry isn't limb ware. */
function limbReason(entry, inPlay) {
  const role = limbRole(entry.system ?? {}, entry.flags ?? {}, srcOf(entry));
  if (!role) return undefined;
  if (role === "limb") return limbTypeOf(entry) ? null : "This part of a cyberlimb has its own rules the app doesn't compute yet.";
  // In play a limb is a spare until surgery (M4c); building an option into one is the GM's, in Foundry.
  if (inPlay) return "A cyberlimb option is bought at creation here; after that, fit it in Foundry.";
  const kind = optionKindOf(entry);
  if (LIMB_KINDS_OFFERED.has(kind) || (kind === "other" && LIMB_OTHER_OFFERED.has(srcOf(entry)))) return null;
  return kind === "device" ? "A built-in device costs four times the device's own price: not yet."
    : kind === "weapon" ? "A cybergun or taser needs its weapon added with it: not yet."
    : "This cyberlimb option has its own rules the app doesn't compute yet.";
}
/**
 * Foundry's prepared price of a limb option (item-data.mjs: `limbOptionPrice` for its RECORDED placement, the linked
 * limb's type resolved from its source). `items`: the character's items, to find the linked limb.
 */
export function limbOptionCostOf(item, items) {
  const s = item.system, limb = s.linkedLimbId ? items.find(i => i._id === s.linkedLimbId && i.type === "cyberware") : null;
  return limbOptionPrice({ rating: s.rating, cost: s.cost ?? 0, costPerRating: s.costPerRating, costMultiplierOfBase: s.costMultiplierOfBase,
    limbSurcharge: s.limbSurcharge, limbAdjacent: s.limbAdjacent }, optionKindOf(item), limb ? limbTypeOf(limb) : null);
}
/** The limb model over a character's cyberware, as `_limbEssenceAndModel` builds it (installed parts only). */
export const limbModelOf = (items) => limbModel(items.filter(i => i.type === "cyberware").map(i => ({ id: i._id, name: i.name,
  installed: i.system.installed !== false, system: i.system, flags: i.flags ?? {}, source: i._stats?.compendiumSource ?? null })));
/**
 * Each installed part's limb-adjusted Essence (Cybertechnology p.31, p.37, p.49–52), as `_limbEssenceAndModel`
 * assigns `limbEssence`: options counted in a limb, the troll and cybertorso rules. A Map of item id → Essence.
 */
export function limbEssences(items, race) {
  const model = limbModelOf(items), stats = limbStats(model), place = new Map(), out = new Map();
  for (const l of model.limbs) for (const o of l.options) place.set(o.id, { inLimb: forLimbRules(l), limbType: l.type, counted: stats.selection.counted.has(o.id) });
  for (const i of items) {
    if (i.type !== "cyberware" || i.system.installed === false) continue;
    const e = limbEssence({ sys: i.system, source: i._stats?.compendiumSource ?? null, kind: i.system.limbOption ? optionKindOf(i) : null },
      { ...(place.get(i._id) ?? { inLimb: false }), troll: race === "troll", torso: stats.torso });
    if (e !== null) out.set(i._id, e);
  }
  return out;
}
/** The pricing context a limb option's `itemBaseCost` reads: its kind and its linked limb's type (PLAN-M5j). */
export function limbPriceCtx(item, items) {
  if (item.type !== "cyberware" || !item.system?.limbOption) return {};
  const limb = item.system.linkedLimbId ? items.find(i => i._id === item.system.linkedLimbId && i.type === "cyberware") : null;
  return { limbOptionKind: optionKindOf(item), limbType: limb ? limbTypeOf(limb) : null };
}
/** The items as Foundry's preparation prices them: limb options at their placement price (Draft 2, r1 #4, r2 #1). */
export const pricedItems = (items) => items.map(i => i.type === "cyberware" && i.system?.limbOption
  ? { ...i, system: { ...i.system, cost: limbOptionCostOf(i, items) } } : i);

/** The types that must have a list price (contacts are priced as extras, the Streets lifestyle is free; M2d r1 #3). */
const FIXED_PRICE = ["weapon", "armor", "gear", "ammo", "cyberware", "program", "focus"];
/** Why an entry can't be bought in milestone 2c, or null (PLAN-M2c §1). */
export function refusalFor(entry) {
  if (entry.type === "vehicle") return "Vehicles wait for the Foundry system to count them at creation.";
  if (!BUYABLE.includes(entry.type)) return "That isn't something a character buys.";
  // Limb options are gated by limbReason (offerReason) and priced for their placement: no fixed-price check here.
  if (entry.system?.limbOption) return null;
  if (entry.system?.category === "skillsoft" && entry.system?.grantedSkillCategory === "data") return "A DataSoft's price varies with its data (core): not yet.";
  const rec = { type: entry.type, name: entry.name, snapshot: entry.system, flags: entry.flags ?? {}, source: entry._stats?.compendiumSource ?? null };
  if (FIXED_PRICE.includes(entry.type) && price(rec, project(rec, defaultChoices(rec)), []) <= 0) return "This has no fixed price in the core book (it varies): not yet.";
  return null;
}

/**
 * May this catalog entry be bought for a character with these sourcebooks (docs/PLAN-M5a.md Draft 2)? null, or why
 * not. Core entries keep their own rules (`refusalFor`); a sourcebook's are offered only when the app holds them as
 * plain data: weapons, armor, ammunition, gear and spells, with no Active Effect, special rule, drug or skillsoft.
 */
export const BOOK_TYPES = ["weapon", "armor", "ammo", "gear", "spell"];
const ST = (id) => `Compendium.sr2e-shadowtech.st-bioware.Item.${id}`;
/** Bioware that needs a choice the app doesn't record yet (PLAN-M5e Draft 2): Reflex Recorder's skill, Toxin Exhaler's toxin. */
const BIOWARE_WAITS = new Set([ST("6fac01c3ca92526c"), ST("9f7e371475559ce1")]);
/** Rated at most the unaugmented Body (their entries; PLAN-M5e Draft 2): Toxin Extractor, Pathogenic Defense, Mnemonic Enhancer. */
/** Cyberware Foundry derives skills from (Skillwires, Cybertechnology): waits (PLAN-M5f Draft 2). */
const CYBER_WAITS = new Set(["Compendium.sr2e-cybertechnology.ct-bodyware.Item.92554f491ab51021", "Compendium.sr2e-cybertechnology.ct-bodyware.Item.b888f9b91a131c29"]);
/**
 * Ware rules whose creation values `derive` computes as Foundry does (docs/PLAN-M5i.md): an ALLOW list, so a new rule
 * key waits until it is checked. Play-time effects run in Foundry on the exported character (Draft 2).
 */
export const WARE_RULES_OFFERED = new Set(["wired-reflexes", "boosted-reflexes", "reaction-enhancer", "move-by-wire", "reflex-trigger",
  "muscle-replacement", "dermal-plating", "dermal-sheath", "body-plating", "body-plating-hardened",
  "datajack", "improved-datajack", "comm-headware", "cyberear", "cranial-bomb", "designator-laser"]);
export const RATING_UP_TO_BODY = new Set([ST("40958403d94eeef2"), ST("64b5f0dc8dc701c3"), ST("f3dc18a732f084d2")]);
export const bookOf = (entry) => entry.book ?? entry.listBook ?? null;
export function offerReason(entry, books = [], { inPlay = false } = {}) {
  const book = bookOf(entry);
  if (entry.type === "quality") {   // Edges and Flaws (PLAN-M5d Draft 2): their own path, creation only
    if (!books.includes(book)) return "That sourcebook isn't turned on for this character.";
    if (inPlay) return "Edges and Flaws are chosen at creation (after that, they're the GM's, p.22).";
    if (!QUALITY_VALUES[entry._stats?.compendiumSource ?? ""]) return "This Edge or Flaw isn't in the app's value table yet.";
    return null;
  }
  if (entry.type === "bioware") {   // Shadowtech (PLAN-M5e): only the bioware whose numbers the app computes as Foundry does
    if (!books.includes(book)) return "That sourcebook isn't turned on for this character.";
    if (inPlay) return "Bioware goes in by surgery: buy it at creation for now.";
    const s = entry.system ?? {};
    if (wareRule(entry.flags, entry._stats?.compendiumSource ?? null) || s.triggered || s.damageCompensator || s.ignoresStunPenalty || s.activeSkillDice
      || s.armorBallistic || s.armorImpact || (s.ratingStats ?? []).some(r => r.armorBallistic || r.armorImpact) || BIOWARE_WAITS.has(entry._stats?.compendiumSource))
      return "This bioware has its own rules the app doesn't compute yet.";
    return refusalFor(entry);
  }
  if (entry.type === "cyberware") {   // cyberlimbs and options, core and book (PLAN-M5j): their own gate
    if (book !== "sr2" && !books.includes(book)) return "That sourcebook isn't turned on for this character.";
    const why = limbReason(entry, inPlay);
    if (why !== undefined) return why ?? refusalFor(entry);
  }
  if (entry.type === "cyberware" && book !== "sr2") {   // book cyberware (PLAN-M5f, M5i): plain implants and the allowed rules
    if (!books.includes(book)) return "That sourcebook isn't turned on for this character.";
    const s = entry.system ?? {}, src = entry._stats?.compendiumSource ?? null, rule = wareRule(entry.flags, src);
    if (rule === "ims" || rule === "auto-medication") return "It comes with a cybermantic operation (Cybertechnology p.80), not bought.";
    if ((rule && !WARE_RULES_OFFERED.has(rule.split(":")[0])) || limbRole(s, entry.flags ?? {}, src) || s.cranialDeck || entry.effects?.length || s.capacity > 0
      // Skillwires of any kind: Foundry knows them by name and grants slotted skills from them (code review M5f r1 #1).
      || s.isTacticalComputer || s.skillwirePlus || s.accessPorts || CYBER_WAITS.has(src) || /skillwire/i.test(entry.name ?? ""))
      return "This cyberware has its own rules the app doesn't compute yet.";
    return refusalFor(entry);
  }
  if (book !== "sr2") {
    if (!books.includes(book)) return "That sourcebook isn't turned on for this character.";
    if (!BOOK_TYPES.includes(entry.type)) return "From a sourcebook, only weapons, armor, ammunition, gear and spells for now.";
    if (entry.effects?.length || entry.flags?.sr2e?.rule) return "It has special rules the app doesn't compute yet.";
    if (entry.flags?.sr2e?.drug || entry.system?.drug || entry.system?.category === "skillsoft") return "Drugs and skillsofts need rules the app doesn't have yet.";
  }
  // Draft 3: where the rating is a CHOICE (capped at 6 at creation), an authored rating above 6 would be cut down to a
  // different item (a Type IV maglock is Rating 10): it waits for after creation. A FIXED rating above 6 (the core
  // Deluxe Improved Gyro Mount, a Tacticom) is bought and the rules check reports it (p.44), as every breakable rule is.
  const s = entry.system ?? {}, rated = s.costPerRating > 0 || (s.ratingStats?.length ?? 0) > 1;
  if (!inPlay && rated && Number(s.rating) > 6) return "Rated above 6: buy it after creation (p.44).";
  return refusalFor(entry);
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
    s.grade = c.grade ?? "standard";
    if ("side" in c) s.side = c.side || "unknown";
    if ("limb" in c) {   // the limb it is built into, and the placement facts recorded when it was attached (Draft 2, r1 #3)
      s.linkedLimbId = c.limb;
      s.limbSurcharge = !!rec.placement?.limbSurcharge;
      s.limbAdjacent = !!rec.placement?.limbAdjacent;
    }
  }
  if (rec.type === "bioware") {   // BiowareData's preparation: the rating row's stats; installed (PLAN-M5e)
    const row = ratedRow(s.ratingStats, s.rating);
    if (row) for (const k of ["bodyCost", "cost", "availability", "streetIndex", "armorBallistic", "armorImpact"]) if (k in row) s[k] = row[k];
    s.grade = "grade" in c ? c.grade : (s.grade || "standard");
    s.installed = true;
  }
  if (rec.type === "spell" || rec.type === "focus") s.force = c.force ?? s.force;
  if (rec.type === "contact") {
    if ("kind" in c) s.contactType = c.kind;
    if (Array.isArray(c.archetypes)) s.archetypes = c.archetypes;
  }
  if (rec.type === "lifestyle" && "months" in c) s.monthsPaid = c.months;
  if (rec.type === "quality") {   // PLAN-M5d: Foundry's own fields; a Bonus Attribute Point's price is set in rebuildItems
    if ("points" in c) s.pointValue = c.points;
    if ("attribute" in c) s.attribute = c.attribute;
    if ("gain" in c) { s.attributeBonus = c.gain; s.pointValue = c.gain; }
    if (qualityRule(s.rule, rec.source) === "exceptional-attribute") s.maximumBonus = 1;
    // Plain text (code review r1): Foundry escapes the notes where it shows them; markup characters are dropped.
    if ("detail" in c) s.notes = c.detail.replace(/[<>]/g, "");
  }
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
  const item = { _id: rec.id ?? "", type: rec.type, name: rec.name, system: projected.system, flags: projected.flags, _stats: { compendiumSource: rec.source } };
  const all = [...items.filter(x => x._id !== item._id || !item._id), item];
  // A limb option: itemBaseCost's own limbOptionPrice branch, given its kind and the linked limb's type (r2 #1, code r1 #1).
  return chargenItemCost(priceInput(item, all), limbPriceCtx(item, all));   // the system's own: ammo by its bundle value, the rest list × quantity + eye rows
}

/** An eye accessory's row inside its cybereye, in the system's own shape (core p.247). */
export function eyeRow(id, rec, projected) {
  const s = projected.system;
  return { id, name: rec.name, essenceCost: s.essenceCost ?? 0, kind: eyeAccessoryKind(rec.flags, rec.source), eye: "both",
    cost: s.cost ?? 0, rating: s.rating ?? 0, combatTnMod: s.combatTnMod ?? 0, active: true, notes: "", paid: 0, listValue: s.cost ?? 0 };
}

/**
 * One cyberware item's Essence: the system's own `wareEssence` (Foundry's `actualEssenceCost`, S5), given the markers
 * Foundry's preparation sets — the eye's module total, the ware rule, and muscle's discount beside full cyberlimbs
 * (Cybertechnology p.57). The surgeon's `surgeryEssencePct` applies (PLAN-M4c Draft 2); a limb part's `limbEssence` (PLAN-M5j).
 */
export function essenceOf(item, items, race = null) {
  const s = item.system, ctx = ctxOf(items, item);
  const capacityUsed = Math.round((s.modules ?? []).reduce((t, r) => t + (Number(r.essenceCost) || 0), 0) * 100) / 100;
  // A cyberlimb part's own Essence (PLAN-M5j); `race` for the troll rule (p.51). shortcut: the model is rebuilt per call,
  // fine for a character's few dozen implants; cache by items if a profile ever shows it.
  const limb = item.type === "cyberware" && item.system.installed !== false && items.some(i => i.type === "cyberware" && (i.system.limbOption || i.system.location === "cyberlimb"))
    ? limbEssences(items, race).get(item._id) : undefined;
  return wareEssence({ ...s, capacityUsed, wareRule: ctx.wareRule, limbEssence: limb,
    limbDiscount: ctx.fullCyberlimbs > 0 ? muscleFactor(ctx.fullCyberlimbs) : undefined });
}
export { isCybereye, isEyeAccessory };
