/** Every theme meets WCAG AA (docs/PLAN-M3.md §6): the token pairs the layout actually uses, computed from the CSS. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const lum = (hex) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// [foreground, background, minimum]: text 4.5; borders and focus rings (non-text) 3.
const PAIRS = [["ink", "bg", 4.5], ["ink", "surface", 4.5], ["muted", "bg", 4.5], ["muted", "surface", 4.5], ["accent", "bg", 4.5], ["accent", "surface", 4.5],
  ["danger", "bg", 4.5], ["danger", "surface", 4.5], ["ok", "bg", 4.5], ["ok", "surface", 4.5], ["on-accent", "accent", 4.5], ["line", "bg", 3], ["line", "surface", 3]];

const dir = new URL("../client/src/themes/", import.meta.url);
for (const file of readdirSync(dir).filter(f => f.endsWith(".css"))) {
  test(`theme ${file}: contrast`, () => {
    const css = readFileSync(new URL(file, dir), "utf8");
    const token = Object.fromEntries([...css.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(m => [m[1], m[2]]));
    for (const [fg, bg, min] of PAIRS) {
      assert.ok(token[fg] && token[bg], `${file} defines --${fg} and --${bg}`);
      const r = ratio(token[fg], token[bg]);
      assert.ok(r >= min, `--${fg} on --${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
    }
  });
}
