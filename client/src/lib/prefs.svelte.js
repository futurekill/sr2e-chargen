/**
 * The preferences the whole page reads (docs/PLAN-help-footer.md 3, r1 #5): one shared state, filled from the session
 * and updated after EITHER control saves (the footer's Hide and the Account page), so the two never disagree.
 * Signed out there is no account: the board's on/off is this device's choice only.
 */
import { put } from "./api.js";
export const prefs = $state({ signedIn: false, banter: true, textures: {} });
const LOCAL = "banter";
export function loadPrefs(user) {
  prefs.signedIn = !!user;
  prefs.textures = user?.prefs?.textures ?? {};
  if (user?.prefs) prefs.banter = user.prefs.banter !== false;
  else { try { prefs.banter = localStorage.getItem(LOCAL) !== "off"; } catch { prefs.banter = true; } }
}
/** Turn the board on or off: saved to the account when signed in, to this device otherwise. Returns the state kept. */
export async function setBanter(on) {
  if (prefs.signedIn) prefs.banter = (await put("/api/account/prefs", { banter: on })).banter !== false;
  else { prefs.banter = on; try { localStorage.setItem(LOCAL, on ? "on" : "off"); } catch { /* not remembered in private mode */ } }
  return prefs.banter;
}
