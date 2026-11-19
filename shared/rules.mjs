/**
 * The ONE place the app imports the Foundry system's code from (docs/PLAN-M2.md §1): this project's own copy of the
 * pinned system (content/sr2e-foundryvtt/, kept by the content sync; only the modules the app uses are copied).
 * The server imports it directly; Vite bundles it for the browser.
 */
import { SR2E } from "../content/sr2e-foundryvtt/module/config.mjs";
import LABELS from "../content/sr2e-foundryvtt/lang/en.json" with { type: "json" };

export { chargenSpend, chargenBudget, saleQuoteOf, itemListValue, fenceValue, FENCE_STEPS, streetPrice, ratedStreetIndex, karmaTransition, advancementOptions, karmaPoolCapacity, karmaPoolAvailable, startingMoney, weaponFocusCost, adeptPowerBudget, adeptPowerKey, combatSenseDice, skillTiersFromAllocation, validateSkillAllocation, chargenItemCost, ratedRow, reactionBase, wornArmorTotals, heavyArmorPoolPenalty, astralCombatPool, startingKarmaPool, strengthMinWeaponStats, naturalAttribute, wareEssence, damageUpdateFor, totalWoundPenalty, woundLevel, surgeryCategory, surgeryEssencePct, surgeonTN, racialProfile, metavariantFrom, isMetavariantItem, metavariantNotes, ONI_SOURCE } from "../content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs";
export { SHAPESHIFTER_PRIORITIES, SHAPESHIFTER_SPECIES, formModifiers, shapeshifterOf, humanFormMod } from "../content/sr2e-foundryvtt/module/rules/shapeshift-rules.mjs";
export { wareCtx, containerEssence, eyeAccessoryKind, rowsListValue, muscleFactor } from "../content/sr2e-foundryvtt/module/rules/ware-rules.mjs";

/** The system's tables the app reads. */
export const TABLES = {
  priorities: SR2E.priorities,            // core p.47, Master Character Creation Table
  racialModifiers: SR2E.racialModifiers,  // core p.45
  racialMaximums: SR2E.racialMaximums,    // core p.43
  racialAbilities: SR2E.racialAbilities,  // core p.45
  totems: SR2E.totems                     // core p.119–121
};
/** A label the system names by key ("SR2E.Totems.Bear" → "Bear"); the key itself when unknown. */
export const label = (key) => (typeof key === "string" && LABELS[key]) || key;
