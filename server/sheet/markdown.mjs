/**
 * The Markdown stat block (docs/PLAN-sheet.md slice 2): the SAME sheet model as the PDF, as Markdown tables. User text
 * is escaped so it can't become markup, a link or a table cell break; nothing is cut.
 */
// URLs, www. names and e-mail addresses go in code spans: renderers don't link inside code (no autolinks, r1 #3).
// A pipe ends the match: it stays outside the code span, escaped for the table like any other text.
const LINKY = /(?:\b(?:https?|ftp|mailto|file|data|javascript):[^\s|]+|\bwww\.[^\s|]+|[^\s@|]+@[^\s@|]+\.[^\s@|]+)/gi;
const escText = (t) => t.replace(/([\\`*_[\]<>|#~!])/g, "\\$1");
const code = (t) => { const fence = "`".repeat(Math.max(...[0, ...(t.match(/`+/g) ?? []).map(r => r.length)]) + 1); return `${fence} ${t} ${fence}`; };
const esc = (v) => {
  const s = String(v ?? "").replace(/\r?\n/g, " ");
  let out = "", last = 0;
  for (const m of s.matchAll(LINKY)) { out += escText(s.slice(last, m.index)) + code(m[0]); last = m.index + m[0].length; }
  return out + escText(s.slice(last));
};
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
  out.push(sec("Armor", tableOf(["Worn", "Ballistic / Impact"], [["Worn", m.armor]])));
  out.push(sec("Condition monitors", tableOf(["Monitor", "Boxes"], [["Physical", m.monitors.physical], ["Stun", m.monitors.stun], ["Physical overflow (Body)", m.monitors.overflow]])));
  out.push(sec("Attacks", tableOf(["Weapon", "Damage", "Skill"], m.attacks)));
  out.push(sec("Skills", tableOf(["Skill", "Rating", "Concentration / specialization", "Kind"], m.skills)));
  for (const [title, rows, head] of [["Cyberware", m.cyberware, ["Item", "Rating", "Essence", "Page"]], ["Adept powers", m.powers, ["Power", "Level", "For", "Page"]],
    ["Spells", m.spells, ["Spell", "Force", "Category · drain", "Page"]], ["Foci", m.foci, ["Focus", "Force", "Bonded to", "Page"]], ["Gear", m.gear, ["Item", "Qty / rating", "Armor", "Page"]],
    ["Vehicles", m.vehicles ?? [], ["Vehicle", "Handling · Speed", "Body · Armor · Signature · Pilot", "Page"]],
    ["History", m.history ?? [], ["Date", "What", "Note", ""]]])
    if (rows.length) out.push(sec(title, tableOf(head, rows)));
  if (m.notes) out.push(sec("Notes", tableOf(["Notes"], [[m.notes]])));
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
