/**
 * Derived values for a CREATION character (docs/PLAN-sheet.md §1, draft 2–3): what a printed sheet shows. The input is
 * the Foundry character source (`actor`), so the same function runs on the app's characters and on Foundry's pregens —
 * the parity test (test/derive.test.mjs) compares it with what Foundry's CharacterData prepares. Only what a core-book
 * character at creation can hold is composed here (no in-play state, no sourcebook ware); each step names the
 * CharacterData method it matches.
 */
import { TABLES, combatSenseDice, reactionBase, wornArmorTotals, heavyArmorPoolPenalty, astralCombatPool, startingKarmaPool, strengthMinWeaponStats, naturalAttribute } from "./rules.mjs";
import { essenceOf } from "./purchase.mjs";

export const ATTRS = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];
const num = (v) => Number(v) || 0;

/** @param {{ actor: object, options?: { moreMetahumans?: boolean } }} input */
export function derive({ actor, options = {} }) {
  const sys = actor.system, items = actor.items ?? [];
  const race = sys.race ?? "human", racial = TABLES.racialModifiers[race] ?? {};
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
  if (mtype === "physical_adept") for (const p of items.filter(i => i.type === "adept_power")) {
    const lvl = Math.max(1, num(p.system.level) || 1);
    for (const [k, v] of Object.entries(p.system.attributeMods ?? {})) if (k in mods) mods[k] += num(v) * lvl;
  }

  // _calculateAttributeValues: the natural rating (base + racial, held at the racial maximum while creation is in
  // progress, as Foundry does) + mods.
  const attributes = {}, natural = {};
  const maxes = sys.chargen?.inProgress === false ? {} : (TABLES.racialMaximums[race] ?? {});
  for (const a of ATTRS) {
    natural[a] = naturalAttribute(num(sys[a]?.base), num(racial[a]), 0, maxes[a] ?? null);
    attributes[a] = Math.max(0, natural[a] + mods[a]);
  }

  // Essence and Magic (p.45): 6 − installed cyberware (with the cybereye allowance); Magic = Essence rounded down.
  const essence = Math.round((6 - installed.reduce((t, i) => t + essenceOf(i, items), 0)) * 100) / 100;
  const magic = mtype === "none" ? 0 : Math.max(0, Math.min(6, Math.floor(essence + 1e-9)));

  // Reaction (p.45) and Initiative: Muscle Replacement's Quickness never feeds Reaction (p.249).
  const reaction = Math.max(0, reactionBase(attributes.quickness, attributes.intelligence, exemptQuickness) + mods.reaction);
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
    attributes, natural, reaction, initiativeDice, essence, magic, pools, armor, weapons, vcr, mpcp,
    monitors: { physical: 10, stun: 10, overflow: natural.body },   // p.112; overflow against NATURAL Body
    karmaPool: startingKarmaPool(race, !!options.moreMetahumans)
  };
}
