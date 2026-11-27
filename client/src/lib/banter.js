/** The shipped banter (banter/*.json), merged once for the board. */
import steps from "../../../banter/steps.json";
import pages from "../../../banter/pages.json";
import metatypes from "../../../banter/metatypes.json";
import choices from "../../../banter/choices.json";
import items from "../../../banter/items.json";
import { mergeBanter } from "../../../shared/banter.mjs";
export const BANTER = mergeBanter([steps, pages, metatypes, choices, items]);
