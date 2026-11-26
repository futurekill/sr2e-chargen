/** The site themes (docs/GRAPHICS.md §3): each is client/src/themes/<key>.css, a token set only. The first is the default. */
export const THEMES = Object.freeze([
  { key: "terminal", name: "Terminal (amber phosphor)" },
  { key: "cyberpunk", name: "Cyberpunk (magenta and cyan)" },
  { key: "cybernoir", name: "Cybernoir (brass and charcoal)" },
  { key: "geocities", name: "GeoCities retro (light)" }
]);
export const THEME_KEYS = Object.freeze(THEMES.map(t => t.key));
