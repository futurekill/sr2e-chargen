/**
 * The sheet model (docs/PLAN-sheet.md §2): one character as sections of plain strings, the single source every sheet
 * style draws. No markup: every user string is reduced to plain text here (controls and bidi overrides removed).
 */
import { derive } from "../../shared/derive.mjs";
import { validate, totemNames, CATEGORY_NAMES, ATTR_NAMES, MAGIC_NAMES } from "../../shared/creation.mjs";
import { essenceOf } from "../../shared/purchase.mjs";

/** Plain, printable text: no control characters, no bidi overrides/isolates, single spaces. */
export function plain(v, max = 4000) {
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  return String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏]/g, "")
    .replace(/[ \t]+/g, " ").trim().slice(0, max);
}
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const cite = (s) => (s?.citation?.page ? `${s.citation.book === "sr2" ? "SR2" : String(s.citation.book).toUpperCase()} p.${s.citation.page}` : "");
const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const nuyen = (n) => `${Math.round(n).toLocaleString("en-US")}¥`;

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
    title: plain(body.name, 120),
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
    pools: [["Combat", d.pools.combat], ["Magic", d.pools.magic], ["Astral", d.pools.astral], ["Hacking", d.pools.hacking], ["Control", d.pools.control]]
      .filter(([k, v]) => v > 0 || k === "Combat").map(([k, v]) => [k, String(v)]),
    armor: `${d.armor.ballistic} / ${d.armor.impact}`,
    monitors: { physical: d.monitors.physical, stun: d.monitors.stun, overflow: d.monitors.overflow },
    attacks: d.weapons.map(w => [plain(w.name, 120), plain(w.damageCode, 20), cap(String(w.skill).replace(/_/g, " "))]),
    skills: of("skill").map(i => {
      const s = i.system, sub = [s.concentration?.name && `${s.concentration.name} ${s.concentration.rating}`, s.specialization?.name && `${s.specialization.name} ${s.specialization.rating}`].filter(Boolean);
      return [plain(i.name, 120), String(s.rating), plain(sub.join(" · "), 200), s.category === "active" ? "active" : s.category];
    }),
    cyberware: of("cyberware").map(i => [plain(i.name, 120) + (i.system.modules?.length ? ` (${i.system.modules.map(m => plain(m.name, 80)).join(", ")})` : ""),
      i.system.rating ? `R${i.system.rating}` : "", `Ess ${num(essenceOf(i, items))}`, cite(i.system)]),
    gear: [...of("weapon"), ...of("armor"), ...of("gear"), ...of("ammo")].map(i => [plain(i.name, 120),
      i.type === "ammo" ? `${i.system.quantity} rds` : i.system.quantity > 1 ? `×${i.system.quantity}` : i.system.rating ? `R${i.system.rating}` : "",
      i.type === "armor" ? `${i.system.ballistic}/${i.system.impact}` : "", cite(i.system)]),
    spells: of("spell").map(i => [plain(i.name, 120), `F${i.system.force}`, plain(`${cap(i.system.category ?? "")} · ${i.system.drainCode ?? ""}`, 80), cite(i.system)]),
    foci: of("focus").map(i => [plain(i.name, 120), `F${i.system.force}`, i.system.boundSpellId ? plain(items.find(x => x._id === i.system.boundSpellId)?.name ?? "", 80) : "", cite(i.system)]),
    powers: of("adept_power").map(i => [plain(i.name, 120), `L${i.system.level}`, "", cite(i.system)]),
    notes: plain(body.notes, 20000)
  };
}
