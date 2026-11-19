/**
 * The sheet model (docs/PLAN-sheet.md §2): one character as sections of plain strings, the single source every sheet
 * style draws. No markup: every user string is reduced to plain text here (controls and bidi overrides removed).
 */
import { derive } from "../../shared/derive.mjs";
import { validate, totemNames, CATEGORY_NAMES, ATTR_NAMES, MAGIC_NAMES } from "../../shared/creation.mjs";
import { essenceOf } from "../../shared/purchase.mjs";

/** Plain, printable text: no control characters, no bidi overrides/isolates, single spaces. */
export function plain(v, max = Infinity) {
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  return String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏]/g, "")
    .replace(/[ \t]+/g, " ").trim().slice(0, max);
}
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const cite = (s) => (s?.citation?.page ? `${s.citation.book === "sr2" ? "SR2" : String(s.citation.book).toUpperCase()} p.${s.citation.page}` : "");
const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const nuyen = (n) => `${Math.round(n).toLocaleString("en-US")}¥`;

/** The table card's model: the sheet model with only the chosen rows, and none of the long sections. */
export function cardModel(body, chosen) {
  const m = sheetModel(body), keep = new Set(chosen);
  const pick = (k) => m[k].filter((_, i) => keep.has(m.rowIds[k][i]));
  return { ...m, card: true, attacks: pick("attacks"), skills: pick("skills").filter(r => r[3] === "active"), cyberware: pick("cyberware"),
    spells: pick("spells"), powers: pick("powers"), gear: [], foci: [], notes: "" };
}

export function sheetModel(body) {
  const actor = body.actor, sys = actor.system, items = actor.items ?? [];
  const d = derive({ actor, options: body.creation?.options ?? {} });
  const check = validate(body);
  const pr = sys.chargen?.priorities ?? {};
  const magic = sys.magic ?? {};
  const totem = magic.totem ? totemNames()[magic.totem] ?? magic.totem : "";
  const magicLine = magic.type === "none" ? "Mundane"
    : `${cap(MAGIC_NAMES[magic.type] ?? magic.type)}${magic.tradition && magic.tradition !== "none" ? `, ${magic.tradition}` : ""}${totem ? ` (${totem})` : ""}`;
  const of = (t) => items.filter(i => i.type === t);

  return {
    title: plain(body.name),
    draft: !body.creation?.finished,
    header: [
      ["Metatype", cap(sys.race ?? "human")],
      ["Magic", magicLine],
      ["Priorities", Object.keys(CATEGORY_NAMES).map(c => `${CATEGORY_NAMES[c]} ${pr[c] || "–"}`).join(" · ")],
      ["Karma Pool", String(d.karmaPool)],
      ["Resources left", body.creation?.finished ? "" : nuyen(Math.max(0, check.budgets.resources.remaining))]
    ].filter(([, v]) => v !== ""),
    attributes: [
      ...Object.keys(ATTR_NAMES).map(a => [ATTR_NAMES[a], d.attributes[a] !== d.natural[a] ? `${d.natural[a]} (${d.attributes[a]})` : String(d.attributes[a])]),
      ["Essence", num(d.essence)],
      ...(magic.type !== "none" ? [["Magic", String(d.magic)]] : []),
      ["Reaction", String(d.reaction)],
      ["Initiative", `${d.reaction} + ${d.initiativeDice}D6`]
    ],
    // The big attribute row and the stat strip of the Fohawk style (the same values as `attributes`/`pools`).
    attrRow: Object.keys(ATTR_NAMES).map(a => ({ abbr: ATTR_NAMES[a].slice(0, 3).toUpperCase(), value: String(d.attributes[a]), natural: d.attributes[a] !== d.natural[a] ? String(d.natural[a]) : "" })),
    stats: [["Reaction", String(d.reaction)], ["Initiative", `${d.reaction} + ${d.initiativeDice}D6`], ["Combat pool", String(d.pools.combat)],
      ...[["Magic pool", d.pools.magic], ["Astral pool", d.pools.astral], ["Hacking pool", d.pools.hacking], ["Control pool", d.pools.control]].filter(([, v]) => v > 0).map(([k, v]) => [k, String(v)]),
      ["Karma pool", String(d.karmaPool)], ["Essence", num(d.essence)], ...(magic.type !== "none" ? [["Magic", String(d.magic)]] : []), ["Armor", `${d.armor.ballistic} / ${d.armor.impact}`]],
    priorities: Object.keys(CATEGORY_NAMES).map(c => [{ race: "RACE", magic: "MAGIC", attributes: "ATTR", skills: "SKILLS", resources: "RES" }[c], pr[c] || "–"]),
    subtitle: [cap(sys.race ?? "human"), magicLine].join(" · "),
    pools: [["Combat", d.pools.combat], ["Magic", d.pools.magic], ["Astral", d.pools.astral], ["Hacking", d.pools.hacking], ["Control", d.pools.control]]
      .filter(([k, v]) => v > 0 || k === "Combat").map(([k, v]) => [k, String(v)]),
    armor: `${d.armor.ballistic} / ${d.armor.impact}`,
    monitors: { physical: d.monitors.physical, stun: d.monitors.stun, overflow: d.monitors.overflow },
    attacks: d.weapons.map(w => [plain(w.name), plain(w.damageCode, 20), cap(String(w.skill).replace(/_/g, " "))]),
    skills: of("skill").map(i => {
      const s = i.system, sub = [s.concentration?.name && `${s.concentration.name} ${s.concentration.rating}`, s.specialization?.name && `${s.specialization.name} ${s.specialization.rating}`].filter(Boolean);
      return [plain(i.name), String(s.rating), plain(sub.join(" · ")), s.category === "active" ? "active" : s.category];
    }),
    cyberware: of("cyberware").map(i => [plain(i.name) + (i.system.modules?.length ? ` (${i.system.modules.map(m => plain(m.name)).join(", ")})` : ""),
      i.system.rating ? `R${i.system.rating}` : "", `Ess ${num(essenceOf(i, items))}`, cite(i.system)]),
    gear: [...of("weapon"), ...of("armor"), ...of("gear"), ...of("ammo")].map(i => [plain(i.name),
      i.type === "ammo" ? `${i.system.quantity} rds` : i.system.quantity > 1 ? `×${i.system.quantity}` : i.system.rating ? `R${i.system.rating}` : "",
      i.type === "armor" ? `${i.system.ballistic}/${i.system.impact}` : "", cite(i.system)]),
    spells: of("spell").map(i => [plain(i.name), `F${i.system.force}`, plain(`${cap(i.system.category ?? "")} · ${i.system.drainCode ?? ""}`, 80), cite(i.system)]),
    foci: of("focus").map(i => [plain(i.name), `F${i.system.force}`, i.system.boundSpellId ? plain(items.find(x => x._id === i.system.boundSpellId)?.name ?? "", 80) : "", cite(i.system)]),
    // The third column carries the power's choice: Improved Ability's skill, the senses named (p.125).
    powers: of("adept_power").map(i => [plain(i.name), `L${i.system.level}`, plain(i.system.improvedSkill || (/^Senses: /.test(i.system.notes ?? "") ? i.system.notes.slice(8) : ""), 80), cite(i.system)]),
    notes: plain(body.notes),
    // Item ids parallel to the rows above (the table card filters by them).
    rowIds: { attacks: of("weapon").map(i => i._id), skills: of("skill").map(i => i._id), cyberware: of("cyberware").map(i => i._id),
      spells: of("spell").map(i => i._id), powers: of("adept_power").map(i => i._id) }
  };
}
