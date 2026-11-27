/**
 * The background textures' CSS (docs/PLAN-textures.md), the source tools/gen-textures.mjs writes
 * client/src/textures.css from. Approved by the user from the samples (2026-11-27). Each is CSS for the page
 * background only: cards, fields and the board keep their solid --surface. SVG noise is inline (a data: URI, which the
 * CSP's img-src allows), so nothing is fetched. No fixed attachment (r1 #8). Names and notes live in shared/themes.mjs.
 */
const svg = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
/** Fine grain: fractal noise, tinted, at a given opacity. */
const grain = (rgb, opacity, freq = 0.9, size = 180) => svg(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${rgb[0]} 0 0 0 0 ${rgb[1]} 0 0 0 0 ${rgb[2]} 0 0 0 ${opacity} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`);
/** Rain: short slanted streaks scattered over a tile (deterministic). */
function rain(color, opacity, slant = 12, tile = 220, count = 26, seed = 7) {
  let s = seed, lines = "";
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < count; i++) {
    const x = r() * tile, y = r() * tile, len = 10 + r() * 34, dx = Math.tan(slant * Math.PI / 180) * len;
    lines += `<line x1='${x.toFixed(1)}' y1='${y.toFixed(1)}' x2='${(x - dx).toFixed(1)}' y2='${(y + len).toFixed(1)}'/>`;
  }
  return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='${tile}' height='${tile}'><g stroke='${color}' stroke-opacity='${opacity}' stroke-width='1' stroke-linecap='round'>${lines}</g></svg>`);
}
/** Tiny scattered stars (GeoCities). */
function stars(color, opacity, tile = 140, count = 14, seed = 3) {
  let s = seed, dots = "";
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < count; i++) {
    const x = (r() * tile).toFixed(1), y = (r() * tile).toFixed(1), big = r() > 0.8;
    dots += big ? `<path d='M${x} ${+y - 3}l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z'/>` : `<circle cx='${x}' cy='${y}' r='.9'/>`;
  }
  return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='${tile}' height='${tile}'><g fill='${color}' fill-opacity='${opacity}'>${dots}</g></svg>`);
}

export const THEMES = {
  cyberpunk: { bg: "#11131a", muted: "#a9adc2", ink: "#f4f4f7", options: [
    { key: "rain", name: "Rain on the glass", note: "Thin cyan streaks, slanted like rain on a bus window, over fine grain. Reads as weather, not pattern.",
      css: `background-image: ${rain("#64dfea", 0.065)}, ${grain([0.6, 0.65, 0.8], 0.04)};` },
    { key: "neon", name: "Neon wash", note: "Wet-asphalt grain with two faint glows — magenta from the top right, cyan from the bottom left — like signs off-frame. Fixed while the page scrolls.",
      css: `background-image: radial-gradient(60rem 40rem at 100% 0%, rgb(255 103 181 / .11), transparent 70%), radial-gradient(50rem 36rem at 0% 100%, rgb(100 223 234 / .085), transparent 70%), ${grain([0.6, 0.65, 0.8], 0.05)};` },
    { key: "grid", name: "Matrix grid", note: "A faint 48 px grid with brighter nodes, like the Matrix's iconography seen from very far off.",
      css: `background-image: radial-gradient(circle, rgb(255 103 181 / .13) 1px, transparent 1.6px), linear-gradient(rgb(106 111 134 / .06) 1px, transparent 1px), linear-gradient(90deg, rgb(106 111 134 / .06) 1px, transparent 1px); background-size: 48px 48px; background-position: -0.5px -0.5px;` }
  ] },
  terminal: { bg: "#14110d", muted: "#bd9c5e", ink: "#f2c14e", options: [
    { key: "scanlines", name: "Scanlines", note: "Every third line a shade darker, as on an old phosphor tube, with a soft vignette at the edges. Static: no flicker.",
      css: `background-image: repeating-linear-gradient(0deg, rgb(242 193 78 / .035) 0 1px, transparent 1px 3px), radial-gradient(120% 90% at 50% 40%, transparent 55%, rgb(0 0 0 / .45));` },
    { key: "glow", name: "Phosphor glow", note: "Warm amber grain with a gentle glow in the middle of the screen, as if the tube were warming up.",
      css: `background-image: radial-gradient(70rem 45rem at 50% 30%, rgb(242 193 78 / .045), transparent 70%), ${grain([0.95, 0.75, 0.3], 0.06)};` },
    { key: "dots", name: "Dot matrix", note: "A fine grid of amber points, like the character cells of a text screen.",
      css: `background-image: radial-gradient(circle, rgb(242 193 78 / .09) .8px, transparent 1.2px); background-size: 9px 14px;` }
  ] },
  cybernoir: { bg: "#151719", muted: "#b3ada0", ink: "#eeeae2", options: [
    { key: "grain", name: "Film grain", note: "Soft monochrome grain and a darker vignette: a photograph in a case file.",
      css: `background-image: radial-gradient(120% 90% at 50% 35%, transparent 55%, rgb(0 0 0 / .4)), ${grain([0.9, 0.88, 0.82], 0.085, 0.75)};` },
    { key: "blinds", name: "Venetian blinds", note: "Wide, faint bars of street light falling through blinds — the oldest noir shot there is — fixed in place behind the page.",
      css: `background-image: repeating-linear-gradient(-28deg, rgb(221 183 119 / .035) 0 34px, transparent 34px 70px), ${grain([0.9, 0.88, 0.82], 0.04, 0.75)};` },
    { key: "rain", name: "Rain-dark glass", note: "Near-vertical rain in pale brass over grain, as through an office window at night.",
      css: `background-image: ${rain("#ddb777", 0.065, 5, 240, 30, 11)}, ${grain([0.9, 0.88, 0.82], 0.035, 0.75)};` }
  ] },
  geocities: { bg: "#fff9e8", muted: "#5b5470", ink: "#202030", options: [
    { key: "stars", name: "Starfield tile", note: "The classic homepage star tile — tiny dots and a few four-point sparkles in link-purple — kept pale.",
      css: `background-image: ${stars("#7a6f9e", 0.24)};` },
    { key: "graph", name: "Graph paper", note: "A pale blue grid with a stronger line every fifth square, like a hand-drawn page scanned in 1997.",
      css: `background-image: linear-gradient(rgb(37 55 168 / .05) 1px, transparent 1px), linear-gradient(90deg, rgb(37 55 168 / .05) 1px, transparent 1px), linear-gradient(rgb(37 55 168 / .028) 1px, transparent 1px), linear-gradient(90deg, rgb(37 55 168 / .028) 1px, transparent 1px); background-size: 100px 100px, 100px 100px, 20px 20px, 20px 20px; background-position: -1px -1px;` },
    { key: "paper", name: "Paper fibre", note: "Warm, uneven paper grain — the cream page given some tooth.",
      css: `background-image: ${grain([0.55, 0.45, 0.25], 0.13, 0.55, 220)};` }
  ] }
};
