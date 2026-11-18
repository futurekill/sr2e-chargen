/**
 * The Markdown stat block (docs/PLAN-sheet.md slice 2): the SAME sheet model as the PDF, as Markdown tables. User text
 * is escaped so it can't become markup, a link or a table cell break; nothing is cut.
 */
const esc = (v) => String(v ?? "").replace(/\r?\n/g, " ").replace(/([\\`*_[\]<>|#~!])/g, "\\$1");
const tableOf = (head, rows) => rows.length
  ? [`| ${head.map(esc).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map(r => `| ${head.map((_, i) => esc(r[i] ?? "")).join(" | ")} |`)].join("\n")
  : "_None._";

export function statBlock(m) {
  const sec = (title, body) => `## ${title}\n\n${body}\n`;
  const out = [`# ${esc(m.title)}`, ""];
  if (m.draft) out.push("**Draft — character creation not finished.**", "");
  out.push(m.header.map(([k, v]) => `- **${esc(k)}:** ${esc(v)}`).join("\n"), "");
  out.push(sec("Attributes", tableOf(["Attribute", "Rating"], m.attributes)));
  out.push(sec("Dice pools", tableOf(["Pool", "Dice"], m.pools)));
  out.push(sec("Armor", `Ballistic / Impact: ${esc(m.armor)}`));
  out.push(sec("Condition monitors", `Physical ${m.monitors.physical} boxes · Stun ${m.monitors.stun} boxes · Physical overflow up to ${m.monitors.overflow} (Body)`));
  out.push(sec("Attacks", tableOf(["Weapon", "Damage", "Skill"], m.attacks)));
  out.push(sec("Skills", tableOf(["Skill", "Rating", "Concentration / specialization", "Kind"], m.skills)));
  for (const [title, rows, head] of [["Cyberware", m.cyberware, ["Item", "Rating", "Essence", "Page"]], ["Adept powers", m.powers, ["Power", "Level", "", "Page"]],
    ["Spells", m.spells, ["Spell", "Force", "Category · drain", "Page"]], ["Foci", m.foci, ["Focus", "Force", "Bonded to", "Page"]], ["Gear", m.gear, ["Item", "Qty / rating", "Armor", "Page"]]])
    if (rows.length) out.push(sec(title, tableOf(head, rows)));
  if (m.notes) out.push(sec("Notes", esc(m.notes)));
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
