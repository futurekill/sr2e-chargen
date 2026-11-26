/** The site themes (docs/GRAPHICS.md §3): each is client/src/themes/<key>.css, a token set only. The first is the default (Cyberpunk, 2026-11-26). */
export const THEMES = Object.freeze([
  { key: "cyberpunk", name: "Cyberpunk (magenta and cyan)" },
  { key: "terminal", name: "Terminal (amber phosphor)" },
  { key: "cybernoir", name: "Cybernoir (brass and charcoal)" },
  { key: "geocities", name: "GeoCities retro (light)" }
]);
export const THEME_KEYS = Object.freeze(THEMES.map(t => t.key));
