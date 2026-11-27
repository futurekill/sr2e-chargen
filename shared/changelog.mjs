/**
 * The CHANGELOG as releases, for the in-app What's new page (docs/PLAN-help-footer.md 2; user 2026-11-27: the
 * repository is private, so the page is the app's own). Reads "## <version> — <date>" sections: plain lines are
 * paragraphs, "- " starts an item and indented lines continue it. "Unreleased" is skipped. Pure.
 */
export function releases(md, limit = Infinity) {
  const out = [];
  let cur = null, item = null;
  for (const raw of String(md).split("\n")) {
    const h = /^## (\S+)\s+[—-]\s+(\d{4}-\d{2}-\d{2})(.*)$/.exec(raw);
    if (h) { cur = { version: h[1], date: h[2], note: h[3].trim().replace(/^\(|\)$/g, ""), paragraphs: [], items: [] }; out.push(cur); item = null; continue; }
    if (/^## /.test(raw)) { cur = null; continue; }   // Unreleased, or anything else that isn't a release
    if (!cur) continue;
    if (/^- /.test(raw)) { item = raw.slice(2).trim(); cur.items.push(item); continue; }
    if (/^\s+\S/.test(raw) && item !== null) { cur.items[cur.items.length - 1] += ` ${raw.trim()}`; continue; }
    if (raw.trim()) { cur.paragraphs.push(raw.trim()); item = null; } else item = null;
  }
  return out.slice(0, limit).map(r => ({ ...r, items: r.items.map(clean), paragraphs: r.paragraphs.map(clean) }));
}
/** Code spans read as plain words on the page (the help's markup has no code). */
const clean = (s) => s.replace(/`([^`]*)`/g, "$1");
