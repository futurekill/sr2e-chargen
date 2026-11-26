/**
 * The printable sheet styles (docs/PLAN-sheet-styles.md): the renderer, the routes and the Print tab all read this list.
 * `layout` picks the page layout ("fohawk" or "classic"); `head` the heading face ("mono", "serif"), or null for the
 * user's own font set; `ink` marks an ink-saver (outlined bars). The first is the default.
 */
export const SHEET_STYLES = Object.freeze([
  { key: "fohawk", name: "Fohawk", layout: "fohawk", head: null, ink: false },
  { key: "fohawk-ink", name: "Fohawk (ink-saver)", layout: "fohawk", head: null, ink: true },
  { key: "classic", name: "Classic", layout: "classic", head: null, ink: false },
  { key: "printout", name: "Printout", layout: "classic", head: "mono", ink: false },
  { key: "dossier", name: "Dossier", layout: "classic", head: "serif", ink: false }
]);
export const SHEET_STYLE_KEYS = Object.freeze(SHEET_STYLES.map(s => s.key));
