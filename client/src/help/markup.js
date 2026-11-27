/**
 * The help's inline markup (docs/PLAN-help-footer.md 1, r1 #7): `**bold**` and `[text](/path)` → TOKENS
 * `{ text }`, `{ bold }`, `{ link, href }`, rendered by Svelte with its normal escaping (never {@html}). A link is kept
 * only to an internal path (or this repository's address); anything else, and any unbalanced markup, stays text.
 */
const INTERNAL = /^\/[a-z0-9/-]*(#[a-z0-9-]+)?$/;
export function safeHref(href, repository = null) {
  if (INTERNAL.test(href) && !href.startsWith("//")) return href;
  if (repository && (href === repository || href.startsWith(`${repository}/`)) && /^https:\/\/github\.com\/[^\s"'<>]+$/.test(href)) return href;
  return null;
}
export function tokens(s, repository = null) {
  const out = [], push = (t) => { if (!t.text && t.text !== undefined) return; const last = out.at(-1); if (t.text !== undefined && last?.text !== undefined) last.text += t.text; else out.push(t); };
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let i = 0, m;
  for (const str = String(s ?? ""); (m = re.exec(str));) {
    if (m.index > i) push({ text: str.slice(i, m.index) });
    if (m[1] !== undefined) push({ bold: m[1] });
    else { const href = safeHref(m[3], repository); push(href ? { link: m[2], href } : { text: m[0] }); }
    i = re.lastIndex;
  }
  const str = String(s ?? "");
  if (i < str.length) push({ text: str.slice(i) });
  return out;
}
