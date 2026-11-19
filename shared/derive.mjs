/**
 * Derived values for a CREATION character (docs/PLAN-sheet.md §1, draft 2–3): what a printed sheet shows. The input is
 * the Foundry character source (`actor`), so the same function runs on the app's characters and on Foundry's pregens —
 * the parity test (test/derive.test.mjs) compares it with what Foundry's CharacterData prepares. Only what a core-book
 * character at creation can hold is composed here (no in-play state, no sourcebook ware); each step names the
 * CharacterData method it matches.
 */
import { TABLES, combatSenseDice, karmaPoolCapacity, karmaPoolAvailable, reactionBase, wornArmorTotals, heavyArmorPoolPenalty, astralCombatPool, strengthMinWeaponStats, naturalAttribute, racialProfile, shapeshifterOf, formModifiers, qualityEffects, bodyIndexTotal } from "./rules.mjs";
import { essenceOf } from "./purchase.mjs";

export const ATTRS = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];
const num = (v) => Number(v) || 0;

/** @param {{ actor: object, options?: { moreMetahumans?: boolean } }} input */
export function derive({ actor, options = {} }) {
  const sys = actor.system, items = actor.items ?? [];
  const race = sys.race ?? "human", profile = racialProfile(sys, TABLES), racial = profile.mods;   // a metavariant's own (Companion p.39–44)
  const mtype = sys.magic?.type ?? "none";
  const installed = items.filter(i => i.type === "cyberware" && i.system.installed !== false);

  // _collectItemModifiers: installed cyberware mods (absolute), physical adept powers' mods × level.
  const mods = Object.fromEntries([...ATTRS, "reaction", "initiativeDice"].map(k => [k, 0]));
  let exemptQuickness = 0, vcr = 0;
  for (const i of installed) {
    for (const [k, v] of Object.entries(i.system.attributeMods ?? {})) if (k in mods) mods[k] += num(v);
    if (i.system.noReactionBonus || /muscle (replacement|augmentation)/i.test(i.name)) exemptQuickness += num(i.system.attributeMods?.quickness);
    if (i.system.isVcr) vcr = Math.max(vcr, num(i.system.rating) || 1);
  }
  // Adept powers are kept apart too: they work only in human form (Companion p.36), so a shapeshifter's animal form
  // leaves them out (code review M5c r1 #1).
  const adept = Object.fromEntries(Object.keys(mods).map(k => [k, 0]));
  // Bioware (Shadowtech; PLAN-M5e): installed, untriggered implants' attribute bonuses × rating, as _collectItemModifiers.
  for (const i of items.filter(i => i.type === "bioware" && i.system.installed !== false && !i.system.triggered)) {
    const r = Math.max(1, num(i.system.rating) || 1);
    for (const [k, v] of Object.entries(i.system.attributeMods ?? {})) if (k in mods) mods[k] += num(v) * r;
  }
  if (mtype === "physical_adept") for (const p of items.filter(i => i.type === "adept_power")) {
    const lvl = Math.max(1, num(p.system.level) || 1);
    for (const [k, v] of Object.entries(p.system.attributeMods ?? {})) if (k in mods) { mods[k] += num(v) * lvl; adept[k] += num(v) * lvl; }
  }

  // _calculateAttributeValues: the natural rating (base + racial, held at the racial maximum while creation is in
  // progress, as Foundry does) + mods.
  const attributes = {}, natural = {};
  const maxes = sys.chargen?.inProgress === false ? {} : profile.maxes;
  // A shapeshifter (Companion p.36): the form's modifiers come after the base cap, uncapped, floor 1 — as
  // `_naturalAttribute`. The character's own values are its human form; `forms` gives both (PLAN-M5c Draft 2).
  const shifter = shapeshifterOf("character", sys), formOf = (form) => formModifiers(sys.shapeshifter?.species, form);
  const naturalIn = (a, form) => {
    // The attribute Edges (Companion p.24): Bonus Attribute Point in the natural rating, Exceptional Attribute on the max.
    const q = items.filter(i => i.type === "quality" && i.system?.attribute === a);
    const eb = q.reduce((t, i) => t + num(i.system.attributeBonus), 0), em = q.reduce((t, i) => t + num(i.system.maximumBonus), 0);
    const n = naturalAttribute(num(sys[a]?.base), num(racial[a]), eb, maxes[a] ?? null, em), fm = shifter ? num(formOf(form).attrs[a]) : 0;
    return fm ? Math.max(1, n + fm) : n;
  };
  for (const a of ATTRS) {
    natural[a] = naturalIn(a, "human");
    attributes[a] = Math.max(0, natural[a] + mods[a]);
  }
  const forms = shifter ? Object.fromEntries(["human", "animal"].map(form => {
    const f = formOf(form), m = (k) => mods[k] - (form === "animal" ? adept[k] : 0);
    const at = Object.fromEntries(ATTRS.map(a => [a, Math.max(0, naturalIn(a, form) + m(a))]));
    return [form, { attributes: at, reaction: Math.max(0, reactionBase(at.quickness, at.intelligence, exemptQuickness) + m("reaction") + qualityEffects(items).reaction),
      initiativeDice: Math.max(1, 1 + m("initiativeDice") + num(f.initDice)), reach: num(f.reach), dermalDice: num(f.dermalDice) }];
  })) : null;

  // Essence and Magic (p.45): 6 − installed cyberware (with the cybereye allowance); Magic = Essence rounded down.
  // Body Index (Shadowtech p.6): the Awakened pay it in Essence too.
  const bodyIndex = bodyIndexTotal(items.filter(i => i.type === "bioware").map(i => ({ installed: i.system.installed !== false, bodyCost: i.system.bodyCost, grade: i.system.grade, bodySystem: i.system.bodySystem })));
  // Rounded to the thousandth only (float noise): cultured bioware (×0.75) gives three decimals, as Foundry keeps them.
  const essence = Math.round((6 - installed.reduce((t, i) => t + essenceOf(i, items), 0) - (mtype !== "none" ? bodyIndex : 0)) * 1000) / 1000;
  const magic = mtype === "none" ? 0 : Math.max(0, Math.min(6, Math.floor(essence + 1e-9)));

  // Reaction (p.45) and Initiative: Muscle Replacement's Quickness never feeds Reaction (p.249).
  // Lightning Reflexes +1 per 2 points; Will to Live +1 overflow box per point (Companion p.26–27; PLAN-M5d).
  const edges = qualityEffects(items);
  const reaction = Math.max(0, reactionBase(attributes.quickness, attributes.intelligence, exemptQuickness) + mods.reaction + edges.reaction);
  const initiativeDice = Math.max(1, 1 + mods.initiativeDice);

  // _calculateDicePools (p.84).
  const worn = items.filter(i => i.type === "armor" && i.system.equipped);
  const skill = (name) => num(items.find(i => i.type === "skill" && i.name.toLowerCase() === name)?.system.rating);
  const deck = items.find(i => i.type === "gear" && i.system.category === "cyberdeck" && i.system.deck?.active);
  const mpcp = num(deck?.system.deck?.mpcp ?? sys.cyberdeck?.mpcp);
  const pools = {
    combat: Math.max(0, Math.floor((attributes.quickness + attributes.intelligence + attributes.willpower) / 2) - heavyArmorPoolPenalty(attributes.quickness, worn))
      + combatSenseDice(items, { physicalAdept: mtype === "physical_adept" }),   // Combat Sense (p.125)
    magic: mtype !== "none" && mtype !== "physical_adept"
      ? skill("sorcery") + items.filter(i => i.type === "focus" && i.system.focusType === "power" && i.system.bonded && i.system.active).reduce((t, i) => t + num(i.system.force), 0)
      : 0,
    astral: mtype !== "none" ? astralCombatPool({ intelligence: attributes.intelligence, willpower: attributes.willpower, charisma: attributes.charisma }) : 0,
    control: vcr > 0 ? Math.floor((attributes.quickness + attributes.intelligence) / 2) + 2 * vcr : 0,   // core rules (not Rigger 2)
    hacking: mpcp > 0 ? skill("computer") + reaction : 0
  };

  // _calculateArmor: worn (highest + layered) plus implant armor.
  const wornT = wornArmorTotals(worn);
  const armor = { ballistic: wornT.ballistic + installed.reduce((t, i) => t + num(i.system.armorBallistic), 0),
    impact: wornT.impact + installed.reduce((t, i) => t + num(i.system.armorImpact), 0) };

  // Attacks: the weapon's damage as Foundry prepares it (bows by Strength Minimum, p.96).
  const weapons = items.filter(i => i.type === "weapon").map(i => ({ name: i.name,
    damageCode: strengthMinWeaponStats(i.system)?.damageCode ?? i.system.damageCode ?? "", skill: i.system.skill ?? "",
    concealability: i.system.concealability ?? null, reach: i.system.reach ?? 0 }));

  return {
    attributes, natural, reaction, initiativeDice, essence, magic, pools, armor, weapons, vcr, mpcp, forms,
    bodyIndex: { value: Math.round(bodyIndex * 1000) / 1000, max: natural.body, raw: bodyIndex },
    monitors: { physical: 10, stun: 10, overflow: natural.body + edges.willToLive },   // p.112; overflow against NATURAL Body
    // The Karma Pool (p.191): the starting pool + one-tenth of Total Karma, less what is burned (PLAN-M4a Draft 2).
    karmaPool: karmaPoolCapacity(sys.karma?.total, sys.karma?.burned, sys.karma?.poolAdjust, race, !!options.moreMetahumans),
    karmaPoolAvailable: karmaPoolAvailable(karmaPoolCapacity(sys.karma?.total, sys.karma?.burned, sys.karma?.poolAdjust, race, !!options.moreMetahumans), sys.karma?.spent, sys.karma?.drawn),
    goodKarma: Number(sys.karma?.current) || 0, totalKarma: Number(sys.karma?.total) || 0
  };
}
