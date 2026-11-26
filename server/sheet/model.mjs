/**
 * The sheet model (docs/PLAN-sheet.md §2): one character as sections of plain strings, the single source every sheet
 * style draws. No markup: every user string is reduced to plain text here (controls and bidi overrides removed).
 */
import { derive } from "../../shared/derive.mjs";
import { validate, totemNames, CATEGORY_NAMES, ATTR_NAMES, MAGIC_NAMES } from "../../shared/creation.mjs";
import { essenceOf, bodyCostOf } from "../../shared/purchase.mjs";
import { TABLES, racialProfile, metavariantNotes, vehicleEffective } from "../../shared/rules.mjs";

/** Plain, printable text: no control characters, no bidi overrides/isolates, single spaces. */
export function plain(v, max = Infinity) {
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  return String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏]/g, "")
    .replace(/[ \t]+/g, " ").trim().slice(0, max);
}
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const cite = (s) => (s?.citation?.page ? `${s.citation.book === "sr2" ? "SR2" : String(s.citation.book).toUpperCase()} p.${s.citation.page}` : "");
const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));
const nuyen = (n) => `${Math.round(n).toLocaleString("en-US")}¥`;

/** The table card's model: the sheet model with only the chosen rows, and none of the long sections. */
export function cardModel(body, chosen) {
  const m = sheetModel(body), keep = new Set(chosen);
  const pick = (k) => m[k].filter((_, i) => keep.has(m.rowIds[k][i]));
  return { ...m, card: true, attacks: pick("attacks"), skills: pick("skills").filter(r => r[3] === "active"), cyberware: pick("cyberware"),
    spells: pick("spells"), powers: pick("powers"), gear: [], foci: [], vehicles: [], qualities: [], bioware: [], history: [], notes: "" };
}

export function sheetModel(body) {
  const actor = body.actor, sys = actor.system, items = actor.items ?? [];
  const d = derive({ actor, options: body.creation?.options ?? {} });
  // Rigger 2 is Foundry's world setting: both Control Pools when they differ (PLAN-M5i Draft 3, r3 #1).
  const control = d.pools.controlRigger2 !== d.pools.control && d.pools.control > 0 ? `${d.pools.control} (Rigger 2 rules: ${d.pools.controlRigger2})` : String(d.pools.control);
  const cm = actor.system.conditionMonitor;
  // A metavariant (Companion p.39–44): "Troll (Cyclops)", its rules as a header line.
  const variant = racialProfile(sys, TABLES).variant, raceName = cap(sys.race ?? "human") + (variant ? ` (${plain(variant)})` : "");
  const variantNotes = metavariantNotes(sys, TABLES).join(" ");
  // A shapeshifter (Companion p.36–38): the attributes below are the human form; the animal form on its own line.
  const af = d.forms?.animal, short = { body: "B", quickness: "Q", strength: "S", charisma: "C", intelligence: "I", willpower: "W" };
  const animalLine = af ? [Object.entries(af.attributes).map(([a, v]) => `${short[a]} ${v}`).join(" "), `R ${af.reaction}`, `Init ${af.reaction} + ${af.initiativeDice}D6`,
    af.reach ? `Reach +${af.reach}` : "", af.dermalDice ? `dermal armor +${af.dermalDice} Body vs damage` : ""].filter(Boolean).join(" · ") : "";
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
      ["Metatype", sys.race === "shapeshifter" ? `Shapeshifter (${cap(sys.shapeshifter?.species ?? "")}), human form` : raceName],
      ...(variantNotes ? [["Metatype notes", plain(variantNotes, 400)]] : []),
      ...(animalLine ? [["Animal form", animalLine], ["Shapeshifter", "Severe allergy and vulnerability to silver; regenerates; rejects cyberware (Companion p.38)."]] : []),
      ["Magic", magicLine],
      sys.chargen?.priorityMethod === "points"   // point-based design (Companion p.20–21)
        ? ["Creation", `Point-based, ${check.budgets?.buildingPoints?.spent ?? body.creation?.finished?.buildingPoints ?? "?"} of ${sys.chargen.buildingPoints ?? 100} Building Points`]
        : ["Priorities", Object.keys(CATEGORY_NAMES).map(c => `${CATEGORY_NAMES[c]} ${pr[c] || "–"}`).join(" · ") + (sys.chargen?.priorityMethod === "sumto10" ? " (sum-to-10)" : "")],
      ...(d.bodyIndex?.raw ? [["Body Index", `${d.bodyIndex.value} / ${d.bodyIndex.max}`]] : []),
      ["Karma Pool", String(d.karmaPool)], ...(d.totalKarma > 0 ? [["Good Karma", String(d.goodKarma)], ["Total Karma", String(d.totalKarma)]] : []),
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
      ...[["Magic pool", d.pools.magic], ["Astral pool", d.pools.astral], ["Hacking pool", d.pools.hacking], ["Control pool", d.pools.control]].filter(([, v]) => v > 0).map(([k, v]) => [k, k === "Control pool" ? control : String(v)]),
      // Rigger 2's Task Pool (a world setting) and Enhanced Articulation's skill die (PLAN-M5k).
      ...(d.pools.taskRigger2 > 0 ? [["Task pool (Rigger 2 rules)", String(d.pools.taskRigger2)]] : []),
      ...(d.activeSkillDice > 0 ? [["Active skill dice", `+${d.activeSkillDice}`]] : []),
      ["Karma pool", String(d.karmaPool)], ...(d.totalKarma > 0 ? [["Good Karma", String(d.goodKarma)], ["Total Karma", String(d.totalKarma)]] : []), ["Essence", num(d.essence)], ...(magic.type !== "none" ? [["Magic", String(d.magic)]] : []), ["Armor", `${d.armor.ballistic} / ${d.armor.impact}`]],
    priorities: sys.chargen?.priorityMethod === "points" ? [] : Object.keys(CATEGORY_NAMES).map(c => [{ race: "RACE", magic: "MAGIC", attributes: "ATTR", skills: "SKILLS", resources: "RES" }[c], pr[c] || "–"]),
    subtitle: [raceName, magicLine].join(" · "),
    pools: [["Combat", d.pools.combat], ["Magic", d.pools.magic], ["Astral", d.pools.astral], ["Hacking", d.pools.hacking], ["Control", d.pools.control]]
      .filter(([k, v]) => v > 0 || k === "Combat").map(([k, v]) => [k, k === "Control" ? control : String(v)])
      .concat(d.pools.taskRigger2 > 0 ? [["Task (Rigger 2 rules)", String(d.pools.taskRigger2)]] : [], d.activeSkillDice > 0 ? [["Active skill dice", `+${d.activeSkillDice}`]] : []),   // M5k r1 #2
    armor: `${d.armor.ballistic} / ${d.armor.impact}`,
    monitors: { physical: d.monitors.physical, stun: d.monitors.stun, overflow: d.monitors.overflow,
      // The wounds carried (PLAN-M4c): boxes filled, from Foundry's stored monitor (none before finishing).
      filled: { physical: cm?.physical?.value ?? 0, stun: cm?.stun?.value ?? 0, overflow: cm?.overflow ?? 0 } },
    attacks: d.weapons.map(w => [plain(w.name), plain(w.damageCode, 20), cap(String(w.skill).replace(/_/g, " "))]),
    skills: of("skill").map(i => {
      const s = i.system, sub = [s.concentration?.name && `${s.concentration.name} ${s.concentration.rating}`, s.specialization?.name && `${s.specialization.name} ${s.specialization.rating}`].filter(Boolean);
      return [plain(i.name), String(s.rating), plain(sub.join(" · ")), s.category === "active" ? "active" : s.category];
    }),
    cyberware: of("cyberware").map(i => [plain(i.name) + (i.system.modules?.length ? ` (${i.system.modules.map(m => plain(m.name)).join(", ")})` : "") + (i.system.installed === false ? " (spare, not installed)" : ""),
      i.system.rating ? `R${i.system.rating}` : "", `Ess ${num(essenceOf(i, items, sys.race))}`, cite(i.system)]),
    gear: [...of("weapon"), ...of("armor"), ...of("gear"), ...of("ammo")].map(i => [plain(i.name),
      i.type === "ammo" ? `${i.system.quantity} rds` : i.system.quantity > 1 ? `×${i.system.quantity}` : i.system.rating ? `R${i.system.rating}` : "",
      i.type === "armor" ? `${i.system.ballistic}/${i.system.impact}` : "", cite(i.system)]),
    spells: of("spell").map(i => [plain(i.name), `F${i.system.force}`, plain(`${cap(i.system.category ?? "")} · ${i.system.drainCode ?? ""}`, 80), cite(i.system)]),
    // Edges and Flaws (Companion p.22–35): name (and its attribute), value, the detail (unescaped from Foundry's notes).
    // Bioware (Shadowtech; PLAN-M5e): rating, grade, Body Cost.
    bioware: of("bioware").map(i => [plain(i.name), i.system.rating ? `R${i.system.rating}` : "", `${i.system.grade || "standard"} · BC ${num(bodyCostOf(i, items))}`, cite(i.system)]),
    qualities: of("quality").map(i => [plain(i.name) + (i.system.attribute ? ` (${ATTR_NAMES[i.system.attribute] ?? i.system.attribute}${i.system.attributeBonus ? ` +${i.system.attributeBonus}` : ""})` : ""),
      (i.system.pointValue > 0 ? "+" : "") + String(i.system.pointValue ?? 0),
      plain(String(i.system.notes ?? "").replace(/<[^>]*>/g, " ").replace(/[<>]/g, ""), 80), cite(i.system)]),
    foci: of("focus").map(i => [plain(i.name), `F${i.system.force}`, i.system.boundSpellId ? plain(items.find(x => x._id === i.system.boundSpellId)?.name ?? "", 80) : "", cite(i.system)]),
    // The third column carries the power's choice: Improved Ability's skill, the senses named (p.125).
    // Vehicles bought at creation (S9): the core stats from the kept source (Handling, Speed, Body, Armor, Signature, Pilot).
    // Garage vehicles (docs/PLAN-garage.md 8): a bought one is its snapshot above; a live linked one comes in `_linked`
    // (read by the route, never stored). Mounted weapons follow the name.
    // The EFFECTIVE stats (base + installed mods, as Foundry's VehicleData shows them; PLAN-workshop 4.2).
    vehicles: [...Object.keys(body.creation?.vehicles ?? {}).sort().map(k => body.creation.vehicles[k].source),
      ...Object.keys(body.vehicles ?? {}).sort().map(k => ({ ...body.vehicles[k].source, name: `${body.vehicles[k].source.name} (bought in play)` })),
      ...(body._linked ?? []).map(l => l.source)].map(v => [
      plain([v.name, (v.items ?? []).filter(i => i.flags?.sr2e?.mount).map(i => `${i.name} (${i.flags.sr2e.mount})`).join(", ")].filter(Boolean).join(" — "), 200),
      ...vehicleStatCells(v), cite(v.system)]),
    powers: of("adept_power").map(i => [plain(i.name), `L${i.system.level}`, plain(i.system.improvedSkill || (/^Senses: /.test(i.system.notes ?? "") ? i.system.notes.slice(8) : ""), 80), cite(i.system)]),
    // The history after creation (Karma and money, docs/PLAN-M4b Draft 3): the GM reads it from the sheet.
    history: (body.ledger ?? []).map(e => [e.at ? new Date(e.at).toISOString().slice(0, 10) : "", plain(e.summary, 160), plain([e.by, e.note].filter(Boolean).join(" · "), 120), e.undoneBy ? "undone" : ""]),
    notes: plain(body.notes),
    // Item ids parallel to the rows above (the table card filters by them).
    // attacks: the same list and order as the attack rows (cyber weapons too).
    rowIds: { attacks: d.weapons.map(w => w.id), skills: of("skill").map(i => i._id), cyberware: of("cyberware").map(i => i._id),
      spells: of("spell").map(i => i._id), powers: of("adept_power").map(i => i._id) }
  };
}

/** A vehicle's stat cells: the effective ratings, the one function Foundry's data model also uses (vehicleEffective). */
function vehicleStatCells(v) {
  const sys = v.system ?? {};
  // A Workshop design stores BASE stats; any other vehicle's stored values are what it has.
  const e = sys.design?.version === 2 ? { ...sys, ...vehicleEffective(sys, v.items ?? []).effective } : sys;
  const f = (x) => (x ?? "–");
  return [`Hand ${f(e.handling)} · Speed ${f(e.speed)}`, `Body ${f(e.body)} · Armor ${f(e.armor)} · Sig ${f(e.signature)} · Pilot ${f(e.pilot)}`];
}
