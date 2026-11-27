/** Background textures (docs/PLAN-textures.md): one list, generated CSS and first-paint script in step, per-theme keys. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { THEME_KEYS, TEXTURES, DEFAULT_TEXTURE, textureFor } from "../shared/themes.mjs";
import { texturesCss, bootJs } from "../tools/gen-textures.mjs";
import { readPrefs } from "../server/auth/sessions.mjs";

const file = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the generated CSS and first-paint script match their sources (npm run gen:textures)", () => {
  assert.equal(file("client/src/textures.css"), texturesCss());
  assert.equal(file("client/public/boot.js"), bootJs());
  assert.match(file("client/index.html"), /<script src="\/boot\.js"><\/script>[\s\S]*<\/head>/, "boot.js runs in the head");
  assert.match(file("client/src/main.js"), /import "\.\/textures\.css";/);
});

test("every theme has three textures with a CSS rule each, a default among them, and no fixed attachment", () => {
  const css = file("client/src/textures.css");
  for (const t of THEME_KEYS) {
    assert.equal(TEXTURES[t].length, 3, t);
    assert.ok(TEXTURES[t].some(x => x.key === DEFAULT_TEXTURE[t]), `${t}: default is one of its own`);
    for (const x of TEXTURES[t]) assert.ok(css.includes(`:root[data-theme="${t}"][data-texture="${x.key}"]`), `${t}/${x.key}`);
  }
  assert.equal((css.match(/\[data-texture=/g) ?? []).length, 12, "no rule for an unknown key");
  assert.doesNotMatch(css, /background-attachment|fixed/, "nothing fixed to the window (r1 #8)");
  assert.match(css, /@media \(forced-colors: active\) \{ :root \{ background-image: none !important; \} \}/);
  assert.doesNotMatch(css, /%2523/, "the SVG filter reference is encoded once (a double-encoded one paints black)");
});

test("textureFor: the saved choice when it is that theme's own, else the default; 'none' is kept", () => {
  assert.equal(textureFor("terminal", {}), "scanlines");
  assert.equal(textureFor("terminal", { terminal: "dots" }), "dots");
  assert.equal(textureFor("terminal", { terminal: "rain" }), "scanlines", "another theme's key");
  assert.equal(textureFor("cybernoir", { cybernoir: "none" }), "none");
  assert.equal(textureFor("nope", {}), DEFAULT_TEXTURE[THEME_KEYS[0]]);
  assert.deepEqual(readPrefs(JSON.stringify({ textures: { terminal: "dots", cyberpunk: "blinds", nope: "x", geocities: "none" } })).textures,
    { terminal: "dots", geocities: "none" }, "readPrefs keeps only a theme's own keys and none");
});

test("boot.js sets the remembered theme and texture before paint, and falls back on anything unknown", () => {
  const run = (store) => {
    const attrs = {};
    vm.runInNewContext(bootJs(), { localStorage: { getItem: (k) => store[k] ?? null }, document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } } });
    return [attrs["data-theme"], attrs["data-texture"]];
  };
  assert.deepEqual(run({ theme: "terminal", texture: "dots" }), ["terminal", "dots"]);
  assert.deepEqual(run({ theme: "terminal", texture: "rain" }), ["terminal", "scanlines"]);
  assert.deepEqual(run({ theme: "cybernoir", texture: "none" }), ["cybernoir", "none"]);
  assert.deepEqual(run({ theme: "evil<script>", texture: "x" }), [THEME_KEYS[0], DEFAULT_TEXTURE[THEME_KEYS[0]]]);
  assert.deepEqual(run({}), [THEME_KEYS[0], DEFAULT_TEXTURE[THEME_KEYS[0]]]);
  for (const bad of ["constructor", "toString", "__proto__", "hasOwnProperty"])
    assert.deepEqual(run({ theme: bad, texture: "constructor" }), [THEME_KEYS[0], DEFAULT_TEXTURE[THEME_KEYS[0]]], `${bad} (code review r1 #2)`);
});
