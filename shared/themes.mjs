/** The site themes (docs/GRAPHICS.md §3): each is client/src/themes/<key>.css, a token set only. The first is the default (Cyberpunk, 2026-11-26). */
export const THEMES = Object.freeze([
  { key: "cyberpunk", name: "Cyberpunk (magenta and cyan)" },
  { key: "terminal", name: "Terminal (amber phosphor)" },
  { key: "cybernoir", name: "Cybernoir (brass and charcoal)" },
  { key: "geocities", name: "GeoCities retro (light)" }
]);
export const THEME_KEYS = Object.freeze(THEMES.map(t => t.key));

/**
 * Background textures (docs/PLAN-textures.md): each theme's own three, chosen per theme on the Account page; the CSS is
 * client/src/textures.css (generated from tools/textures.mjs). Defaults chosen by the user, 2026-11-27.
 */
export const TEXTURES = Object.freeze({
  cyberpunk: [
    { key: "rain", name: "Rain on the glass", note: "Thin cyan streaks, slanted like rain on a bus window." },
    { key: "neon", name: "Neon wash", note: "Faint magenta and cyan glows, like signs just out of frame." },
    { key: "grid", name: "Matrix grid", note: "A faint grid with brighter nodes." }],
  terminal: [
    { key: "scanlines", name: "Scanlines", note: "A still phosphor tube, darker at the edges." },
    { key: "glow", name: "Phosphor glow", note: "Warm grain with a gentle glow in the middle." },
    { key: "dots", name: "Dot matrix", note: "A fine grid of points, like a text screen's cells." }],
  cybernoir: [
    { key: "grain", name: "Film grain", note: "Soft grain and a dark vignette, like a case-file photo." },
    { key: "blinds", name: "Venetian blinds", note: "Wide, faint bars of street light through blinds." },
    { key: "rain", name: "Rain-dark glass", note: "Near-vertical rain in pale brass." }],
  geocities: [
    { key: "stars", name: "Starfield tile", note: "Tiny dots and a few sparkles, kept pale." },
    { key: "graph", name: "Graph paper", note: "A pale blue grid, a stronger line every fifth square." },
    { key: "paper", name: "Paper fibre", note: "Warm, uneven paper grain." }]
});
export const DEFAULT_TEXTURE = Object.freeze({ cyberpunk: "rain", terminal: "scanlines", cybernoir: "blinds", geocities: "stars" });
/** A theme's texture key ("none" for none): the saved choice when it is one of THAT theme's, else the default. */
export function textureFor(theme, textures = {}) {
  const t = THEME_KEYS.includes(theme) ? theme : THEME_KEYS[0];
  const k = textures?.[t];
  return k === "none" || TEXTURES[t].some(x => x.key === k) ? k : DEFAULT_TEXTURE[t];
}
