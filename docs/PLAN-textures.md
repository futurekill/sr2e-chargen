# Plan: background textures, chosen per theme
_Built as 1.2.0 (2026-11-27). Round 1 — revised after Codex r1 (docs/PLAN-textures-REVIEW-LOG.md), 2026-11-27._ User (2026-11-27): approved all twelve textures from the samples
(https://claude.ai/artifact/SD85KP4TB5H4iYzmSiTjBT): "Can we allow users select them in addition to the theme?"; the
default is a texture per theme — Cyberpunk Rain on the glass, Terminal Scanlines, Cybernoir Venetian blinds, GeoCities
Starfield tile — and anyone can pick another or None.

## Goal
Each theme gets a quiet page-background texture, chosen on the Account page from that theme's three (or None) and
kept PER THEME (switching theme brings back that theme's choice). It follows the account to other devices, like the
theme. Text contrast stays WCAG AA at the texture's worst pixel; high-contrast mode and reduced motion are unaffected.

## Approach
1. **One list** in `shared/themes.mjs`: `TEXTURES = { <theme>: [{ key, name, note }], … }` (the sample names and
   notes) and `DEFAULT_TEXTURE = { cyberpunk: "rain", terminal: "scanlines", cybernoir: "blinds", geocities: "stars" }`;
   `textureFor(theme, prefs)` → the key, or "none". Server and client read only this.
2. **CSS** `client/src/textures.css` — NOT in themes/, whose files the contrast test treats as themes (r1 #1) —
   (imported by main.js after the themes): one rule per texture,
   `:root[data-theme="cyberpunk"][data-texture="rain"] { background-image: …; }` on `html`, the exact values the samples
   showed (with the fixed `url(#n)` filter reference). `background-color` stays the theme's `--bg` (app.css). NO fixed
   attachment (r1 #8): the neon wash and the blinds scroll with the page — a fixed background repaints on every scroll
   on some phones and no device test can be run here. `@media (forced-colors: active) { :root { background-image:
   none !important } }` — high contrast shows the system's plain background. No animation anywhere.
3. **Preference** `textures: { <theme>: <key> | "none" }` in the account prefs (`readPrefs` keeps only known themes and
   known keys of THAT theme, anything else → the default). The PUT schema (r1 #2) gains `textures`: an object whose
   properties are the THEME_KEYS, each `enum` = that theme's keys + "none", `additionalProperties: false`,
   `minProperties: 1`; inside the existing transaction the stored map is read and the request's entries are merged
   per theme (`{ ...stored.textures, ...body.textures }`), never replacing the whole map. Signed out: the default
   texture of the default theme.
4. **Applying it** `applyTheme(theme, textures)` in client/src/lib/api.js sets `data-texture` with the theme and
   remembers both in localStorage. **First paint** (r1 #3): a small self-hosted `client/public/boot.js` (CSP
   `script-src 'self'` allows it), loaded with a plain `<script src="/boot.js">` in index.html's head BEFORE the
   stylesheet, reads the remembered theme and texture, checks them against a list it carries (generated from
   shared/themes.mjs at build, a test pins they match) and sets both attributes, so the page never paints untextured or
   in the wrong theme; the account's prefs then reconcile them. **Sign-out and a 401** (r1 #4): apply the signed-out
   defaults (default theme + its default texture) and clear the remembered theme and texture, so a shared device
   doesn't keep the last person's look. The
   shared prefs store (`lib/prefs.svelte.js`) holds `textures` so the Account page and App agree.
5. **Account page**: under Theme, "Background" — a select of the current theme's textures with their short notes and
   None; it saves at once (keepFocus, a status message "Background saved: Rain on the glass"), and changing the theme
   shows that theme's saved choice.
6. **Proof**
   - Unit: `readPrefs` (unknown theme dropped, a key from another theme refused, defaults), the PUT merge per theme,
     every TEXTURES key has a CSS rule in textures.css and no rule names an unknown key (a test reads the CSS file).
   - The accessibility scan, texture part — with CSP ENFORCED (r1 #5: no `setBypassCSP` for these pages; any
     `securitypolicyviolation` event or a background image that fails to load fails the run): for every theme ×
     texture (12), the page with its content hidden is captured and its TRUE darkest and lightest pixels (only the
     scrollbar strip excluded) are measured (r1 #6) against every token drawn directly on the page background:
     `--ink`, `--muted`, `--accent`, `--danger`, `--ok` at ≥ 4.5:1 and `--line` (borders, 1.4.11) at ≥ 3:1; all written
     to the report. Forced colours (r1 #7): for every texture, the root's computed `background-image` is `none`.
     Every page runs with the DEFAULT texture (as users see it); the Account page's reflow, 200% text and text-spacing
     checks run in EVERY theme (the longest texture note shows there).
   - Help: the Account section names Background; a new screenshot only if the Account shot changes.

## Key decisions & tradeoffs
- **Per-theme memory** rather than one global texture key (each theme's textures are its own).
- **Pure CSS + inline SVG** (no image files): the CSP already allows `data:` images (`img-src 'self' data: blob:`).
- **Default ON** (the user's choice): existing users see a texture after the update; the CHANGELOG says how to turn
  it off.
- Contrast is MEASURED (pixels), not computed from tokens: a pattern's worst spot is what matters.

## Risks
- Phone performance can't be measured here; nothing is fixed to the window (above), and the grain tiles are small
  (180–220 px), rasterised once per tile. The QA plan asks the maintainer to scroll a long page on a phone once.
- The SVG grain is rasterised by the browser; very large screens tile it (180–220 px tiles) — no seams in the samples.

## Out of scope
Textures on the printed sheets (never: sheets stay plain); a user-made texture or upload; animated textures.
