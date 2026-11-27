/**
 * The ONE place the app imports the Foundry system's code from (docs/PLAN-M2.md §1): this project's own copy of the
 * pinned system (content/sr2e-foundryvtt/, kept by the content sync; only the modules the app uses are copied).
 * The server imports it directly; Vite bundles it for the browser.
 */
import { SR2E } from "../content/sr2e-foundryvtt/module/config.mjs";
import LABELS from "../content/sr2e-foundryvtt/lang/en.json" with { type: "json" };

export { chargenSpend, chargenBudget, saleQuoteOf, itemListValue, fenceValue, FENCE_STEPS, streetPrice, ratedStreetIndex, karmaTransition, advancementOptions, karmaPoolCapacity, karmaPoolAvailable, startingMoney, weaponFocusCost, adeptPowerBudget, adeptPowerKey, combatSenseDice, skillTiersFromAllocation, validateSkillAllocation, chargenItemCost, ratedRow, reactionBase, wornArmorTotals, heavyArmorPoolPenalty, astralCombatPool, startingKarmaPool, strengthMinWeaponStats, naturalAttribute, wareEssence, damageUpdateFor, totalWoundPenalty, woundLevel, surgeryCategory, surgeryEssencePct, surgeonTN, racialProfile, metavariantFrom, isMetavariantItem, metavariantNotes, ONI_SOURCE, attributeEdgeViolations, bodyIndexTotal, overstressPenalty, budgetItemInput, effectiveBodyCost, BP_NUYEN_TIERS, unarmedDamageCode, secondhandDead, taskPoolDice, compensatedWoundPenalty, vehicleStreetIndex } from "../content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs";
export { QUALITY_VALUES, PER_SUBJECT, qualityValuesFor, bonusAttributeCost, qualityEffects, qualityAudit, qualityRule } from "../content/sr2e-foundryvtt/module/rules/quality-rules.mjs";
export { MOUNT_POINTS, HARDPOINT_WEAPONS, LAUNCHER_MUNITIONS, mountKindFor, mountPointsOf, mountedWeaponCost } from "../content/sr2e-foundryvtt/module/rules/vehicle-mounts.mjs";
export { SHAPESHIFTER_PRIORITIES, SHAPESHIFTER_SPECIES, formModifiers, shapeshifterOf, humanFormMod } from "../content/sr2e-foundryvtt/module/rules/shapeshift-rules.mjs";
export { limbRole, resolveLimbType, resolveOptionKind, limbModel, forLimbRules, SIDED } from "../content/sr2e-foundryvtt/module/rules/limb-rules.mjs";
export { limbStats, limbEssence, lacingArmor, placementFacts, limbOptionPrice, OUTSIDE_LIMB_ESSENCE } from "../content/sr2e-foundryvtt/module/rules/limb-stats.mjs";
export { rigBonuses } from "../content/sr2e-foundryvtt/module/rules/vehicle-r2-rules.mjs";
export { wareCtx, wareRule, containerEssence, eyeAccessoryKind, rowsListValue, muscleFactor, ceil2, pumpEfficiency, cyberPositions } from "../content/sr2e-foundryvtt/module/rules/ware-rules.mjs";

/** The system's tables the app reads. */
export const TABLES = {
  priorities: SR2E.priorities,            // core p.47, Master Character Creation Table
  racialModifiers: SR2E.racialModifiers,  // core p.45
  racialMaximums: SR2E.racialMaximums,    // core p.43
  racialAbilities: SR2E.racialAbilities,  // core p.45
  totems: SR2E.totems                     // core p.119–121
};
/** The races the system knows (core p.43–45 and shapeshifters), for pickers; the tables themselves stay behind racialProfile. */
export const RACE_KEYS = Object.freeze(Object.keys(SR2E.racialModifiers));
/** A label the system names by key ("SR2E.Totems.Bear" → "Bear"); the key itself when unknown. */
export const label = (key) => (typeof key === "string" && LABELS[key]) || key;
export { designVehicle, applyModEffects, vehicleCapacity } from "../content/sr2e-foundryvtt/module/rules/vehicle-design.mjs";
export { blankDesign, chassisArt, workshopUpdate, engineMods, choiceFor, modBuildContext, designModProblems, checkChoices, vehicleEffective } from "../content/sr2e-foundryvtt/module/rules/vehicle-workshop-rules.mjs";
export { R2_MOUNTS, CONVERSION_KITS, mountProblems, mountedWeaponLoad, removalProblem, mountOf, weaponClassOf, fitProblem, kitFor, sourceKey } from "../content/sr2e-foundryvtt/module/rules/vehicle-mounts-r2.mjs";
export { NPC_ATTRS, npcExperiencePct, npcExperienced, SKILL_SUCCESS_TABLE, threatFromDifficulty, threatFromTeamKarma, PROFESSIONAL_RATINGS, npcWithEffects, npcDerived, npcThreat } from "../content/sr2e-foundryvtt/module/rules/npc-rules.mjs";
