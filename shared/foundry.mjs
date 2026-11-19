/**
 * The Foundry connector, simple form (docs/PLAN-M7.md, Draft 2 wins): a character as Foundry's own actor document
 * JSON — what the sidebar's "Import Data" reads and "Export Data" writes. No Foundry code is needed on either side.
 */
import { newCharacter, Refusal, MAX_ITEMS } from "./creation.mjs";
import { UNARMED_STRIKE } from "./derive.mjs";

const FOUNDRY_ID = /^[A-Za-z0-9]{16}$/;
/** "0.161.0" → [0, 161, 0]; anything else → null. */
const semver = (v) => (typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null);
const newer = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };

/** The `_stats` an exported document carries: the version its data is in (imported data keeps its own, Draft 2 r1 #1). */
const statsFor = (systemVersion) => ({ systemId: "sr2e", systemVersion,
  exportSource: { worldId: null, uuid: null, coreVersion: null, systemId: "sr2e", systemVersion } });

/** The character as a Foundry actor JSON. `pinnedVersion`: the system version the app's rules are. */
export function toFoundryActor(body, pinnedVersion) {
  const a = body.actor, version = body.creation?.finished?.imported?.systemVersion ?? pinnedVersion;
  // Foundry's Import Data REPLACES the new actor's items, its innate Unarmed Strike with them: carry one (M5i r1 #1).
  const fist = (a.items ?? []).some(i => i.type === "weapon" && i.name === "Unarmed Strike") || (a.items ?? []).some(i => i._id === UNARMED_STRIKE._id) ? [] : [UNARMED_STRIKE];
  return {
    name: a.name, type: "character", system: structuredClone(a.system),
    items: [...(a.items ?? []), ...fist].map(i => ({ _id: i._id, name: i.name, type: i.type, img: i.img ?? null, system: structuredClone(i.system),
      flags: structuredClone(i.flags ?? {}), effects: structuredClone(i.effects ?? []), _stats: { compendiumSource: i._stats?.compendiumSource ?? null } })),
    effects: [], flags: structuredClone(a.flags ?? {}),
    prototypeToken: { name: a.name, actorLink: true, lockRotation: true },
    _stats: statsFor(version)
  };
}
/** A vehicle bought in the app (its kept catalog source) as a Foundry actor JSON. */
export function vehicleToFoundry(source, pinnedVersion) {
  const { _id, folder, sort, ownership, ...rest } = structuredClone(source);
  void _id; void folder; void sort; void ownership;
  return { ...rest, prototypeToken: { ...(rest.prototypeToken ?? {}), lockRotation: true }, _stats: statsFor(pinnedVersion) };
}

const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function noBadKeys(v, depth = 0) {
  if (depth > 40) throw new Refusal("That file nests too deeply.");
  if (Array.isArray(v)) { for (const x of v) noBadKeys(x, depth + 1); return; }
  if (v && typeof v === "object") for (const k of Object.keys(v)) {
    if (BAD_KEYS.has(k)) throw new Refusal("That file has a field the app won't read.");
    noBadKeys(v[k], depth + 1);
  }
}
const wholeIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/**
 * A finished character from a Foundry actor JSON (Foundry's "Export Data"), or a refusal saying what's wrong. Every
 * item is kept as it is — the app's creation never rebuilds them — and play (Karma, nuyen, condition) works on the actor.
 */
export function fromFoundryActor(json, { pinnedVersion, now = 0 }) {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Refusal("That isn't a Foundry actor file.");
  noBadKeys(json);
  if (json.type !== "character") throw new Refusal("Only a character (a Player Character actor) can be imported.");
  if (json._stats?.systemId && json._stats.systemId !== "sr2e") throw new Refusal("That actor isn't from the Shadowrun 2nd Edition system.");
  const v = semver(json._stats?.systemVersion), pinned = semver(pinnedVersion);
  if (!v) throw new Refusal("The file doesn't say which system version it is from: export it again from Foundry.");
  if (pinned && newer(v, pinned)) throw new Refusal(`The file is from system ${json._stats.systemVersion}, newer than this app knows (${pinnedVersion}).`);
  const sys = json.system;
  if (!sys || typeof sys !== "object") throw new Refusal("The file has no character data.");
  if (sys.chargen?.inProgress !== false) throw new Refusal("That character is still in creation in Foundry: finish it there first, or build it here.");
  // Numbers the app's play operations use (Draft 2 r1 #4).
  if (!wholeIn(sys.nuyen ?? 0, 0, 10_000_000)) throw new Refusal("Its nuyen isn't a whole number from 0 to 10,000,000.");
  if (sys.karma != null && (typeof sys.karma !== "object" || Array.isArray(sys.karma))) throw new Refusal("Its Karma isn't readable.");
  for (const k of ["total", "current", "burned", "spent", "drawn", "poolAdjust"])
    if (sys.karma?.[k] != null && !wholeIn(sys.karma[k], k === "poolAdjust" ? -100 : 0, 100_000)) throw new Refusal(`Its Karma (${k}) isn't a whole number in range.`);
  const cm = sys.conditionMonitor;   // the app's damage and healing do arithmetic on these (code review r1 #2)
  if (cm != null) {
    if (typeof cm !== "object" || Array.isArray(cm) || (cm.overflow != null && !wholeIn(cm.overflow, 0, 100))) throw new Refusal("Its condition monitor isn't readable.");
    for (const t of ["physical", "stun"]) {
      const m = cm[t];
      if (m == null) continue;
      if (typeof m !== "object" || ["value", "max", "overflow"].some(k => m[k] != null && !wholeIn(m[k], 0, 100))) throw new Refusal(`Its ${t} condition monitor isn't whole numbers from 0 to 100.`);
    }
  }
  const word = (v) => typeof v === "string" && /^[a-z][a-z0-9_-]{0,59}$/i.test(v);   // a choice key, as Foundry stores them
  if (!word(sys.race ?? "human")) throw new Refusal("Its metatype isn't readable.");
  if (sys.magic != null && (typeof sys.magic !== "object" || !word(sys.magic.type ?? "none"))) throw new Refusal("Its magic type isn't readable.");
  for (const a of ["body", "quickness", "strength", "charisma", "intelligence", "willpower"])
    if (sys[a]?.base != null && !wholeIn(sys[a].base, 0, 50)) throw new Refusal(`Its ${a} isn't a whole number from 0 to 50.`);
  const items = json.items ?? [];
  if (!Array.isArray(items) || items.length > MAX_ITEMS) throw new Refusal(`A character holds at most ${MAX_ITEMS} items.`);
  const ids = new Set();
  for (const i of items) {
    if (!i || typeof i !== "object" || typeof i.type !== "string" || typeof i.name !== "string" || !i.system || typeof i.system !== "object")
      throw new Refusal("An item in the file is misshapen.");
    if (typeof i._id !== "string" || !FOUNDRY_ID.test(i._id) || ids.has(i._id)) throw new Refusal(`${i.name}: its id isn't a unique Foundry id.`);
    // Ratings the Karma screen raises (code review r1 #5); Essence and cost are checked by validate.
    for (const r of [i.system.rating, i.system.concentration?.rating, i.system.specialization?.rating])
      if (r != null && !wholeIn(r, 0, 50)) throw new Refusal(`${i.name}: its rating isn't a whole number from 0 to 50.`);
    // Essence is summed (a string would concatenate); over 6 in all is the rules check's.
    for (const e of [i.system.essenceCost, ...(Array.isArray(i.system.modules) ? i.system.modules.map(m => m?.essenceCost) : [])])
      if (e != null && !(typeof e === "number" && e >= 0 && e <= 20)) throw new Refusal(`${i.name}: its Essence isn't a number from 0 to 20.`);
    ids.add(i._id);
  }
  const body = newCharacter(json.name);
  body.actor = {
    name: body.name, type: "character", system: structuredClone(sys),
    items: items.map(i => {
      const s = structuredClone(i.system);
      if (i.type === "skill") {   // Foundry's schema defaults, so the app's pages can read them (Draft 2 r1 #3)
        s.concentration = { name: "", rating: 0, ...(s.concentration ?? {}) };
        s.specialization = { name: "", rating: 0, ...(s.specialization ?? {}) };
      }
      return { _id: i._id, name: String(i.name).slice(0, 200), type: i.type, img: typeof i.img === "string" ? i.img : null, system: s,
        flags: structuredClone(i.flags ?? {}), effects: [], _stats: { compendiumSource: i._stats?.compendiumSource ?? null } };
    }),
    flags: structuredClone(json.flags ?? {})
  };
  body.creation.finished = { at: now, imported: { from: "foundry", systemVersion: json._stats.systemVersion } };
  return body;
}
