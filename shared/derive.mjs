/**
 * Derived values for a CREATION character (docs/PLAN-sheet.md §1, draft 2–3): what a printed sheet shows. The input is
 * the Foundry character source (`actor`), so the same function runs on the app's characters and on Foundry's pregens —
 * the parity test (test/derive.test.mjs) compares it with what Foundry's CharacterData prepares. Only what a core-book
 * character at creation can hold is composed here (no in-play state, no sourcebook ware); each step names the
 * CharacterData method it matches.
 */
import { TABLES, combatSenseDice, karmaPoolCapacity, karmaPoolAvailable, reactionBase, wornArmorTotals, heavyArmorPoolPenalty, astralCombatPool, strengthMinWeaponStats, naturalAttribute, racialProfile, shapeshifterOf, formModifiers, qualityEffects, wareRule, rigBonuses, unarmedDamageCode, secondhandDead, limbStats, lacingArmor, pumpEfficiency, cyberPositions, taskPoolDice, compensatedWoundPenalty } from "./rules.mjs";
import { essenceOf, limbModelOf, bodyIndexOfItems } from "./purchase.mjs";

/** Foundry's UNARMED_STRIKE_DATA (module/migrations.mjs): every character's fist, (Str)M Stun (p.255, p.100–101). */
export const UNARMED_STRIKE = Object.freeze({ _id: "unarmedStrike000", name: "Unarmed Strike", type: "weapon", img: "icons/skills/melee/unarmed-punch-fist.webp",
  system: Object.freeze({ weaponType: "melee", skill: "unarmed_combat", damageCode: "(Str)M", damageType: "stun", concealability: 0, reach: 0, cost: 0,
    notes: "SR2E Melee Weapons table (p.255), p.100–101: unarmed attacks do (Str)M Stun, resolved as opposed melee with the Unarmed Combat skill." }),
  flags: Object.freeze({}), effects: Object.freeze([]) });
export const ATTRS = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];
const num = (v) => Number(v) || 0;

/**
 * The Injury Modifier (p.112) as Foundry's `woundPenalty`: a working Damage Compensator hides a track up to its Rating
 * (Shadowtech p.24), an active Pain Editor ignores Stun (p.26) — PLAN-M5k code review r1 #3.
 */
export function injuryPenalty(actor) {
  let compensator = 0, ignoreStun = false;
  for (const i of actor.items ?? []) {
    const s = i.system;
    if (i.type !== "bioware" || s.installed === false || s.destroyed || (Number(s.damage) || 0) >= 6) continue;
    if (s.damageCompensator) compensator = Math.max(compensator, Number(s.rating) || 0);
    if (s.ignoresStunPenalty && (!s.triggered || s.active)) ignoreStun = true;
  }
  const cm = actor.system.conditionMonitor ?? {};
  return compensatedWoundPenalty(cm.physical?.value ?? 0, cm.stun?.value ?? 0, { compensator, ignoreStun });
}
/** @param {{ actor: object, options?: { moreMetahumans?: boolean } }} input */
export function derive({ actor, options = {} }) {
  const sys = actor.system, items = actor.items ?? [];
  const race = sys.race ?? "human", profile = racialProfile(sys, TABLES), racial = profile.mods;   // a metavariant's own (Companion p.39–44)
  const mtype = sys.magic?.type ?? "none";
  const installed = items.filter(i => i.type === "cyberware" && i.system.installed !== false);
  // A failed second-hand part (SSC p.100) still costs Essence; nothing else of it works (Foundry's secondhandDead).
  const working = installed.filter(i => !secondhandDead(i));

  // _collectItemModifiers: installed cyberware mods (absolute), physical adept powers' mods × level.
  const mods = Object.fromEntries([...ATTRS, "reaction", "initiativeDice"].map(k => [k, 0]));
  let exemptQuickness = 0, vcr = 0, enhancer = 0, mbwLevel = 0, lacing = 0;
  for (const i of working) {
    for (const [k, v] of Object.entries(i.system.attributeMods ?? {})) if (k in mods) mods[k] += num(v);
    if (i.system.noReactionBonus || /muscle (replacement|augmentation)/i.test(i.name)) exemptQuickness += num(i.system.attributeMods?.quickness);
    if (i.system.isVcr) vcr = Math.max(vcr, num(i.system.rating) || 1);
    const rule = wareRule(i.flags, i._stats?.compendiumSource ?? null) ?? "";
    if (rule === "reaction-enhancer") enhancer += num(i.system.attributeMods?.reaction);
    if (/^move-by-wire:/.test(rule) && !mbwLevel) mbwLevel = Number(rule.split(":")[1]) || 0;   // Foundry counts the first
    lacing = Math.max(lacing, num(i.system.unarmedPowerBonus));
  }
  // Reaction Enhancers: +6 at most for player characters (Cybertechnology p.38), as _collectItemModifiers.
  const enhancerExcess = Math.max(0, enhancer - 6);
  mods.reaction -= enhancerExcess;
  // Adept powers are kept apart too: they work only in human form (Companion p.36), so a shapeshifter's animal form
  // leaves them out (code review M5c r1 #1).
  const adept = Object.fromEntries(Object.keys(mods).map(k => [k, 0]));
  // Cyberlimbs (PLAN-M5j; _limbEssenceAndModel): the model over the cyberware; a complete pair's Body joins the mods.
  const limbModel = limbModelOf(items), limbs0 = limbStats(limbModel);
  mods.body += limbs0.pairBody;
  // Bioware (Shadowtech; PLAN-M5e, M5k), as _collectItemModifiers: installed, working implants (a triggered one only
  // while active) — each bonus × rating, a pump's or suprathyroid's × its efficiency beside cyberware, rounded down
  // (Cybertechnology p.56–57: only major replacements stop the suprathyroid, the book's own words).
  const ruleOf = (i) => wareRule(i.flags, i._stats?.compendiumSource ?? null) ?? "";
  const effPump = pumpEfficiency(limbModel, { enhancer: enhancer > 0, mbw: mbwLevel > 0 }), effSupra = pumpEfficiency(limbModel, { major: true, mbw: mbwLevel > 0 });
  let bioQuickness = 0, articulation = 0, activeSkillDice = 0;
  const bioWorking = items.filter(i => i.type === "bioware" && i.system.installed !== false && !i.system.destroyed && (Number(i.system.damage) || 0) < 6);
  for (const i of bioWorking.filter(i => !i.system.triggered || i.system.active)) {
    const r = Math.max(1, num(i.system.rating) || 1), rule = ruleOf(i);
    const eff = rule === "adrenal-pump" ? effPump : rule === "suprathyroid" ? effSupra : 1;
    const amt = (v) => eff === 1 ? num(v) * r : Math.floor(num(v) * r * eff + 1e-9);
    for (const [k, v] of Object.entries(i.system.attributeMods ?? {})) {
      if (k === "reaction" && rule === "enhanced-articulation") { articulation += amt(v); continue; }   // decided after the limb averages (p.56)
      if (k in mods) mods[k] += amt(v);
      if (k === "quickness") bioQuickness += amt(v);
    }
    if (i.system.noReactionBonus) exemptQuickness += amt(i.system.attributeMods?.quickness);
    activeSkillDice += num(i.system.activeSkillDice) * r;
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
    attributes[a] = Math.max(1, natural[a] + mods[a]);   // floor 1, as _calculateAttributeValues
  }
  // _applyLimbAverages (Cybertechnology p.50–51): with a full cyber limb in a position, Strength and Quickness become the
  // four positions' averages, capped by unaugmented Body and natural Quickness (+ bioware).
  const limbs = limbStats(limbModel, { naturalStrength: attributes.strength, naturalQuickness: attributes.quickness,
    reactionExemptQuickness: exemptQuickness, naturalBody: natural.body, quicknessCapBase: natural.quickness + bioQuickness, troll: race === "troll" });
  const preQuickness = attributes.quickness;
  if (limbs.anyCyber) { attributes.strength = limbs.avgStrength; attributes.quickness = limbs.avgQuickness; }
  // _applyArticulation (p.56): lost when the cyberlimbs raise Reaction, or more than two known limb positions are cyber.
  const articulationLost = !!articulation && ((limbs.anyCyber && reactionBase(limbs.avgQuicknessReaction, attributes.intelligence, 0)
    > reactionBase(preQuickness, attributes.intelligence, exemptQuickness)) || cyberPositions(limbModel).count > 2);
  if (articulation && !articulationLost) mods.reaction += articulation;
  const forms = shifter ? Object.fromEntries(["human", "animal"].map(form => {
    const f = formOf(form), m = (k) => mods[k] - (form === "animal" ? adept[k] : 0);
    const at = Object.fromEntries(ATTRS.map(a => [a, Math.max(1, naturalIn(a, form) + m(a))]));
    return [form, { attributes: at, reaction: Math.max(0, reactionBase(at.quickness, at.intelligence, exemptQuickness) + m("reaction") + qualityEffects(items).reaction),
      initiativeDice: Math.max(1, 1 + m("initiativeDice") + num(f.initDice)), reach: num(f.reach), dermalDice: num(f.dermalDice) }];
  })) : null;

  // Essence and Magic (p.45): 6 − installed cyberware (with the cybereye allowance); Magic = Essence rounded down.
  // Body Index (Shadowtech p.6): the Awakened pay it in Essence too.
  const bodyIndex = bodyIndexOfItems(items);   // the muscle discount and culturing per item (PLAN-M5k)
  // Rounded to the thousandth only (float noise): cultured bioware (×0.75) gives three decimals, as Foundry keeps them.
  const essence = Math.round((6 - installed.reduce((t, i) => t + essenceOf(i, items, race), 0) - (mtype !== "none" ? bodyIndex : 0)) * 1000) / 1000;
  const magic = mtype === "none" ? 0 : Math.max(0, Math.min(6, Math.floor(essence + 1e-9)));

  // Reaction (p.45) and Initiative: Muscle Replacement's Quickness never feeds Reaction (p.249).
  // Lightning Reflexes +1 per 2 points; Will to Live +1 overflow box per point (Companion p.26–27; PLAN-M5d).
  const edges = qualityEffects(items);
  // A full cyberlimb: Reaction reads the limbs' exemption-free average (p.51; Muscle Replacement still doesn't count).
  const reactionQ = limbs.anyCyber ? reactionBase(limbs.avgQuicknessReaction, attributes.intelligence, 0) : reactionBase(attributes.quickness, attributes.intelligence, exemptQuickness);
  const reaction = Math.max(0, reactionQ + mods.reaction + edges.reaction);
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
    // Rigger 2 (p.16–18) is Foundry's WORLD setting, which the app can't know: both are given (PLAN-M5i Draft 3).
    controlRigger2: rigBonuses({ vcr, mbw: mbwLevel, reaction: reactionBase(limbs.anyCyber ? limbs.avgQuicknessReaction : natural.quickness, attributes.intelligence, 0) }).controlPool,
    hacking: mpcp > 0 ? skill("computer") + reaction : 0,
    // Rigger 2's Task Pool (a world setting): the working encephalon's and cerebral booster's levels (PLAN-M5k).
    taskRigger2: taskPoolDice({ encephalon: Math.max(0, ...working.filter(i => ruleOf(i) === "encephalon").map(i => num(i.system.rating))),
      cerebralBooster: Math.max(0, ...bioWorking.filter(i => ruleOf(i) === "cerebral-booster").map(i => num(i.system.rating))) })
  };

  // _calculateArmor: worn (highest + layered) plus implant armor.
  const wornT = wornArmorTotals(worn);
  // Bone lacing loses armor to complete cyber replacements (Cybertechnology p.50).
  const implant = (i, k) => num(i.system.unarmedPowerBonus) > 0 ? lacingArmor(num(i.system[k]), limbs0.laceReplacements) : num(i.system[k]);
  // Bioware armor (Orthoskin, Shadowtech p.17) adds on top too, while it works.
  const armor = { ballistic: wornT.ballistic + working.reduce((t, i) => t + implant(i, "armorBallistic"), 0) + bioWorking.reduce((t, i) => t + num(i.system.armorBallistic), 0),
    impact: wornT.impact + working.reduce((t, i) => t + implant(i, "armorImpact"), 0) + bioWorking.reduce((t, i) => t + num(i.system.armorImpact), 0) };

  // Attacks: the weapon's damage as Foundry prepares it (bows by Strength Minimum, p.96).
  // Cyber weapons (installed isWeapon cyberware) are weapons too, as Foundry treats them (PLAN-M5f Draft 2).
  // Every Foundry character has an innate Unarmed Strike (sr2e.mjs preCreate, UNARMED_STRIKE_DATA); the app's export
  // carries one when the character has none (shared/foundry.mjs), so the sheet shows it too (code review M5i r1 #1).
  const withFist = items.some(i => i.type === "weapon" && i.name === "Unarmed Strike") ? items : [...items, UNARMED_STRIKE];
  const weapons = withFist.filter(i => i.type === "weapon" || (i.type === "cyberware" && i.system.isWeapon && i.system.installed !== false && !secondhandDead(i))).map(i => ({ id: i._id, name: i.name,
    // Bone lacing (Shadowtech p.42) or cyberhands/feet (Cybertechnology p.49), the higher, raise the Unarmed Strike from its
    // authored code, as _applyUnarmedPower.
    damageCode: i.type === "weapon" && i.name === "Unarmed Strike" ? unarmedDamageCode(i.system.damageCode, Math.max(lacing, limbs0.handPower))
      : strengthMinWeaponStats(i.system)?.damageCode ?? i.system.damageCode ?? "", skill: i.system.skill ?? "",
    concealability: i.system.concealability ?? null, reach: i.system.reach ?? 0 }));

  return {
    attributes, natural, reaction, initiativeDice, essence, magic, pools, armor, weapons, vcr, mpcp, forms, enhancerExcess, mbwLevel, limbs, activeSkillDice, articulation: articulation ? { value: articulation, lost: articulationLost } : null,
    bodyIndex: { value: Math.round(bodyIndex * 1000) / 1000, max: natural.body, raw: bodyIndex },
    monitors: { physical: 10, stun: 10, overflow: natural.body + edges.willToLive },   // p.112; overflow against NATURAL Body
    // The Karma Pool (p.191): the starting pool + one-tenth of Total Karma, less what is burned (PLAN-M4a Draft 2).
    karmaPool: karmaPoolCapacity(sys.karma?.total, sys.karma?.burned, sys.karma?.poolAdjust, race, !!options.moreMetahumans),
    karmaPoolAvailable: karmaPoolAvailable(karmaPoolCapacity(sys.karma?.total, sys.karma?.burned, sys.karma?.poolAdjust, race, !!options.moreMetahumans), sys.karma?.spent, sys.karma?.drawn),
    goodKarma: Number(sys.karma?.current) || 0, totalKarma: Number(sys.karma?.total) || 0
  };
}
