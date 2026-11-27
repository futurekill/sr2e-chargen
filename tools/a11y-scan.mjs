/**
 * The accessibility scan (docs/PLAN-a11y.md 1): the real app on 127.0.0.1 with a temp SQLite database and the real
 * catalog, seeded through the library, driven by puppeteer-core on the system Chrome, checked with axe-core (WCAG 2.2
 * A/AA + target-size) and by checks axe can't make (keyboard, focus, reflow, clipping, text spacing, motion, forced
 * colours, titles). Run: `npm run build && npm run build:catalog && npm run a11y`. Exit code = the gate.
 *   CHROME_PATH   the browser (default: the usual Chrome location for this OS)
 *   A11Y_REPORT   where the JSON report goes (default: a11y-report.json)
 *   A11Y_SHOTS    a directory: save a screenshot of each page (cyberpunk theme) there
 *   A11Y_ONLY     a regular expression: scan only the pages whose key matches (debugging)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { createContext } from "../server/db/index.mjs";
import { buildApp } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import { loadCatalog, entryOf } from "../server/catalog.mjs";
import * as A from "../server/auth/accounts.mjs";
import * as L from "../server/library.mjs";
import { active } from "../server/auth/passwords.mjs";
import { blankDesign } from "../shared/rules.mjs";
import { THEME_KEYS } from "../shared/themes.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const AXE = readFileSync(join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
const REVIEWED = JSON.parse(readFileSync(join(ROOT, "tools/a11y-reviewed.json"), "utf8"));   // axe "needs review" verdicts
const CHROME = process.env.CHROME_PATH || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/usr/bin/google-chrome");
const REDUCED = { name: "prefers-reduced-motion", value: "reduce" };   // kept in EVERY emulateMediaFeatures call (it replaces the set)
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const problems = [], incomplete = [], seenControls = new Set(), log = (...a) => console.log(...a);
const fail = (page, check, detail) => { problems.push({ page, check, detail }); console.log(`  ✗ ${page} · ${check}: ${detail}`); };

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });

/* ── The app and its data ─────────────────────────────────────────────────────────────────────────────────────── */
async function startApp() {
  active.memory = 8192; active.passes = 1;   // quick hashing: these credentials live only for this run
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const ctx = await createContext("sqlite://:memory:", { now: () => Date.now() });
  const catalog = loadCatalog(join(ROOT, "catalog"));
  const app = await buildApp({ ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: origin }), logger: false, catalog });
  await app.listen({ port, host: "127.0.0.1" });
  const password = randomBytes(18).toString("base64url");
  const admin = await A.redeem(ctx, { secret: (await A.bootstrap(ctx)).secret, username: "Scanner", password });
  const uid = admin.user.id, key = () => randomUUID(), lookup = (id) => entryOf(catalog, id);
  const docs = {};
  docs.draft = (await L.createDraft(ctx, uid, { name: "Run notes", notes: "Meet at the Ork Underground." }, key())).document.id;
  // A character in creation, a shaman (the totem select shows).
  let c = await L.createCharacter(ctx, uid, { name: "Whisper Two" }, key());
  c = await L.applyOps(ctx, uid, c.document.id, { revision: c.document.revision, ops: [{ op: "setPriority", category: "magic", letter: "A" }, { op: "setMagic", type: "full_magician" }, { op: "setTradition", tradition: "shamanic" }] }, key(), lookup);
  docs.creating = c.document.id;
  // A finished character (an archetype imported from Foundry).
  const razor = [...catalog.npcs.values()].find(r => r.source.type === "character" && /Razor/.test(r.source.name)).source;
  docs.finished = (await L.importCharacter(ctx, uid, structuredClone(razor), key(), catalog.manifest.pins.find(p => p.id === "sr2e")?.version)).document.id;
  // Vehicles: a catalog one, and designs that bring up every conditional Workshop control (r2 #1, r3 #1, r4).
  const americar = catalog.index.find(({ e }) => e.type === "vehicle" && e.book === "sr2" && e.name === "Ford Americar").e.id;
  docs.vehicle = (await L.createVehicle(ctx, uid, { catalogId: americar, name: "Getaway" }, key(), lookup, catalog.design)).document.id;
  const design = async (name, d, ops = []) => {
    const v = await L.createVehicle(ctx, uid, { design: true, name }, key(), lookup, catalog.design);
    const r = await L.applyOps(ctx, uid, v.document.id, { revision: v.document.revision, ops: [{ op: "setDesign", design: { ...blankDesign(), ...d } }, ...ops] }, key(), lookup, "", [], catalog.design);
    return r.document.id;
  };
  docs.sedan = await design("Sedan", { chassisKey: "sedan", powerPlantKey: "gasoline-cars-sedan", amenities: { level: "basic", occupants: 2 } },
    [{ op: "addDesignMod", catalogId: "sr2e-rigger-2.r2-vehicle-mods.1536f4089f7e6eac", rating: 1 }]);   // drive-by-wire: its split shows
  docs.boat = await design("Water Scooter", { chassisKey: "waterScooter", powerPlantKey: "gasoline-motorboats-skiff-and-water-scooter" });
  docs.plane = await design("Ultralight", { chassisKey: "ultralight", powerPlantKey: "electric-fixed-wing-ultralight" });
  docs.blankDesign = (await L.createVehicle(ctx, uid, { design: true, name: "Blank design" }, key(), lookup, catalog.design)).document.id;
  // NPCs: a contact with a printed range, and a shaman archetype.
  const npcId = (name) => [...catalog.npcs].find(([, r]) => r.source.name.startsWith(name))[0];
  docs.npc = (await L.createNpc(ctx, uid, { catalogId: npcId("Bounty Hunter"), name: "Bounty Hunter" }, key(), (id) => catalog.npcs.get(id))).document.id;
  docs.shamanNpc = (await L.createNpc(ctx, uid, { catalogId: npcId("Whisper"), name: "Whisper NPC" }, key(), (id) => catalog.npcs.get(id))).document.id;
  // Something in the trash.
  const gone = await L.createDraft(ctx, uid, { name: "Old notes" }, key());
  await L.deleteDocument(ctx, uid, gone.document.id, { revision: 1 }, key());
  return { app, ctx, origin, cookie: { name: "sid", value: admin.sessionSecret }, docs, login: { username: "Scanner", password } };
}

/* ── In-page checks (run inside the browser) ──────────────────────────────────────────────────────────────────── */
const IN_PAGE = String.raw`
window.__a11y = {
  tabbable() {
    const all = [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')];
    const seenRadio = new Set();
    return all.filter(el => {
      if (el.disabled || el.closest('[inert]') || el.tabIndex < 0) return false;
      const cs = getComputedStyle(el);
      const hiddenInput = el.matches('input.sr-only');   // a visually hidden file input inside a styled label (r2 #2)
      if (hiddenInput) { const l = el.closest('label'); if (!l || !l.getClientRects().length) return false; }
      if (!hiddenInput && (cs.visibility === 'hidden' || cs.display === 'none' || (!el.offsetWidth && !el.offsetHeight && !el.getClientRects().length))) return false;
      if (el.closest('details:not([open])') && !el.matches('summary')) return false;
      if (el.type === 'radio') {   // one Tab stop per group (r5 #1)
        const g = el.form ? el.form.elements[el.name] : document.getElementsByName(el.name);
        if (seenRadio.has(el.name)) return false;
        seenRadio.add(el.name);
        const checked = [...g].find(r => r.checked);
        return checked ? el === checked || false : true;
      }
      return true;
    });
  },
  seq: 0,
  describe(el) { if (el && !el.dataset.a11yId) el.dataset.a11yId = String(++this.seq); return el ? '@' + el.dataset.a11yId + ' ' + (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.type ? '(' + el.type + ')' : '') + (el.getAttribute('aria-labelledby') ? '{' + el.getAttribute('aria-labelledby') + '}' : '') + (el.closest('label') ? '<' + el.closest('label').textContent.trim().slice(0, 20) + '>' : '') + (el.getAttribute('aria-label') ? '[' + el.getAttribute('aria-label') + ']' : '') + (el.name ? '[name=' + el.name + ']' : '') + ':' + (el.textContent || el.value || '').trim().slice(0, 30)) : 'none'; },
  lum(c) { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; },
  ratio(a, b) { const x = this.lum(a), y = this.lum(b); if (x == null || y == null) return 21; return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); },
  focusProblem(el) {
    const target = el.matches('input.sr-only') ? el.closest('label') : el;   // the label shows the focus (r2 #2)
    const r = target.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return 'off screen';
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    if (hit && hit !== target && !target.contains(hit) && !hit.contains(target)) return 'covered by ' + this.describe(hit);
    const cs = getComputedStyle(target);
    const bg = getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).backgroundColor : getComputedStyle(document.body).backgroundColor;
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) return this.ratio(cs.outlineColor, bg) >= 3 ? null : 'focus outline contrast ' + this.ratio(cs.outlineColor, bg).toFixed(2);
    if (cs.boxShadow && cs.boxShadow !== 'none') return null;
    return 'no visible focus indicator';
  },
  clipped() {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (!/(hidden|clip)/.test(cs.overflowX + cs.overflowY) || el.matches('.sr-only, img, picture, .plate, .plate *, [aria-hidden="true"]')) continue;
      if (el.offsetWidth <= 1 || el.offsetHeight <= 1) continue;   // visually hidden on purpose (screen-reader-only text)
      if (!el.textContent.trim()) continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(this.describe(el));
    }
    return out;
  }
};
// Reduced motion (r1 #6): every animation or transition that starts, from the first paint on.
window.__motion = [];
addEventListener('animationstart', (e) => { window.__motion.push(e.animationName + ' on ' + window.__a11y.describe(e.target)); }, true);
addEventListener('transitionstart', (e) => { window.__motion.push(e.propertyName + ' on ' + window.__a11y.describe(e.target)); }, true);
`;

/* ── The pages and states ─────────────────────────────────────────────────────────────────────────────────────── */
function pages(docs, login) {
  const doc = (id) => `/doc/${id}`;
  const tabs = (id, list) => list.map(t => ({ key: `character ${t}`, url: doc(id), tab: t }));
  return [
    { key: "library", url: "/", title: /^Library · /, open: true },
    { key: "library npc form", url: "/", title: /^Library · /, act: (p) => pickKind(p, "npc"), expect: ["Start from"] },
    { key: "library vehicle form", url: "/", title: /^Library · /, act: (p) => pickKind(p, "vehicle"), expect: ["Model"] },
    { key: "catalog", url: "/catalog", title: /^Catalog · /, act: openFirstEntry, expect: [] },
    { key: "account", url: "/account", title: /^Account · /, saveFocus: [["Theme", "ArrowDown"], ["Use an easy-to-read font", "Space"]] },
    { key: "admin", url: "/admin", title: /^Admin · / },
    { key: "draft", url: doc(docs.draft), title: /^Run notes · /, open: true },
    ...tabs(docs.creating, ["concept", "priorities", "metatype", "magic", "attributes", "skills", "resources", "finish", "card"]).map(p => ({ ...p, title: /^Whisper Two · /, ...(p.tab === "magic" ? { expect: ["Totem"] } : {}), ...(p.tab === "resources" ? { act: startPurchase, expect: ["Qty", "Rating"] } : {}) })),
    ...tabs(docs.finished, ["karma", "nuyen", "condition"]).map(p => ({ ...p, title: /^Razor/ })),
    { key: "vehicle", url: doc(docs.vehicle), title: /^Getaway · / },
    { key: "design sedan", url: doc(docs.sedan), title: /^Sedan · /, open: true, expect: ["Occupants, driver included", "Tires (p.146)", "Handling track", "Drive-by-wire's +10% split"],
      act: async (p) => { const n = await p.evaluate(() => [...document.querySelectorAll("fieldset")].find(f => f.querySelector("legend")?.textContent.startsWith("Drive-by-wire"))?.querySelectorAll("input").length ?? 0); if (n !== 3) fail("design sedan", "coverage", `the drive-by-wire split shows ${n} inputs, not 3`); } },
    { key: "design boat", url: doc(docs.boat), title: /^Water Scooter · /, open: true, expect: ["Hydrofoil (p.116)"] },
    { key: "design plane", url: doc(docs.plane), title: /^Ultralight · /, open: true, expect: ["Takeoff (p.116)"] },
    { key: "design blank", url: doc(docs.blankDesign), title: /^Blank design · / },
    { key: "npc", url: doc(docs.npc), title: /^Bounty Hunter · /, open: true, act: npcPreview, expect: ["Years of experience"], saveFocus: [["Professional Rating", "ArrowDown"]] },
    { key: "npc shaman", url: doc(docs.shamanNpc), title: /^Whisper NPC · /, expect: ["Totem"] },
    { key: "sign in", url: "/", signedOut: true, title: /Hoi, chummer!/, act: refusedSignIn },
    { key: "redeem", url: "/redeem#k=not-a-real-secret", signedOut: true, title: /^Redeem/ },
    { key: "reset", url: "/reset#k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", signedOut: true, title: /^Reset your password/, expect: ["Password again"] },
    // A real sign-in (r1 #6): the same address turns into the Library; its title, the heading focused and announced.
    { key: "sign in, then the library", url: "/", signedOut: true, title: /^Library · /, act: (p) => signIn(p, login) }
  ];
}
async function pickKind(p, kind) {
  await p.evaluate((k) => { const s = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith("Kind"))?.querySelector("select"); s.value = k; s.dispatchEvent(new Event("change", { bubbles: true })); }, kind);
  await settle(p);
}
async function openFirstEntry(p) {
  await p.waitForSelector("li.entry button.plain, li.entry [aria-expanded]", { timeout: 5000 }).catch(() => {});
  await p.evaluate(() => document.querySelector('li.entry [aria-expanded="false"]')?.click());
  await settle(p);
}
/** A purchase with choices (ActiveSoft: quantity, rating, skill), started from the shop's search (r1 #7). */
async function startPurchase(p) {
  const field = await p.$('input[placeholder^="Ares Predator"]');
  await field.type("ActiveSoft");
  await settle(p);
  await p.evaluate(() => { const li = [...document.querySelectorAll("ul.shop li")].find(l => l.querySelector(".name")?.textContent.trim() === "ActiveSoft"); li?.querySelector("button")?.click(); });
  await settle(p);
  // Its row carries the item's own choices: quantity, rating and the skill on the chip (r2 #4).
  const row = await p.evaluate(() => {
    const tr = [...document.querySelectorAll("tr")].find(r => r.textContent.trim().startsWith("ActiveSoft"));
    // A label counts only with an enabled control inside it (r3 #2).
    return tr ? [...tr.querySelectorAll("label")].filter(l => l.querySelector("input:enabled, select:enabled")).map(l => l.textContent.trim().split(/\s/)[0]) : null;
  });
  if (!row) fail("character resources", "coverage", "the ActiveSoft purchase panel did not open");
  else for (const want of ["Qty", "Rating", "Skill"]) if (!row.includes(want)) fail("character resources", "coverage", `the ActiveSoft row has no ${want} control`);
}
async function npcPreview(p) {
  await p.evaluate(() => { const i = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith("Years of experience"))?.querySelector("input"); i.value = "25"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  await settle(p);
  if (!(await p.$("table caption, table th[scope=row]"))) fail("npc", "coverage", "the experience preview table did not render");
}
async function signIn(p, { username, password }) {
  await p.type('input[name="username"]', username);
  await p.type('input[name="password"]', password);
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => /^Library · /.test(document.title), { timeout: 10000 }).catch(() => {});
  await settle(p);
  const r = await p.evaluate(() => ({ focus: document.activeElement?.tagName, live: document.querySelector('[aria-live="polite"]')?.textContent ?? "" }));
  if (r.focus !== "H1") fail("sign in", "route focus", `focus is on ${r.focus}, not the page heading`);
  if (!/^Library · /.test(r.live)) fail("sign in", "route announcement", `announced "${r.live}"`);
}
async function refusedSignIn(p) {
  await p.evaluate(() => {
    const f = document.querySelector("form"); const [u, pw] = f.querySelectorAll("input");
    u.value = "nobody"; u.dispatchEvent(new Event("input", { bubbles: true })); pw.value = "wrong password here"; pw.dispatchEvent(new Event("input", { bubbles: true }));
    f.requestSubmit();
  });
  await new Promise(r => setTimeout(r, 1200));
}
const settle = (p) => new Promise(r => setTimeout(r, 250)).then(() => p.waitForNetworkIdle({ idleTime: 150, timeout: 5000 }).catch(() => {}));

/* ── The checks ───────────────────────────────────────────────────────────────────────────────────────────────── */
async function axe(p, where) {
  await p.evaluate(AXE);
  const r = await p.evaluate(async (tags) => {
    const res = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, rules: { "target-size": { enabled: true } }, resultTypes: ["violations", "incomplete"] });
    const ran = [...res.violations, ...res.passes ?? [], ...res.incomplete, ...res.inapplicable ?? []].some(x => x.id === "target-size");
    const pick = (list) => list.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target.join(" "), why: (n.failureSummary || "").split("\n").slice(0, 3).join(" ") })) }));
    return { violations: pick(res.violations), incomplete: pick(res.incomplete), ran };
  }, TAGS);
  if (!r.ran) fail(where, "axe", "target-size did not run");
  for (const v of r.violations) for (const n of v.nodes) fail(where, `axe ${v.id}`, `${n.target} — ${n.why}`);
  for (const v of r.incomplete) for (const n of v.nodes) {
    const ok = REVIEWED.find(x => x.rule === v.id && new RegExp(x.target).test(n.target));
    incomplete.push({ page: where, rule: v.id, target: n.target, reviewed: ok?.verdict ?? null });
    if (!ok) fail(where, `axe needs review: ${v.id}`, `${n.target} — review it and record the verdict in tools/a11y-reviewed.json`);
  }
}
/** A focus stop's identity: the scan's own element id (its text can change while focused). */
const key = (d) => d.split(" ")[0];
async function keyboard(p, where) {
  const want = await p.evaluate(() => window.__a11y.tabbable().map(el => window.__a11y.describe(el)));
  // Start the Tab walk at the top of the page (a blur alone leaves the browser's start point where focus was).
  await p.evaluate(() => { document.activeElement?.blur(); const t = document.createElement("span"); t.tabIndex = -1; document.body.prepend(t); t.focus(); t.remove(); window.scrollTo(0, 0); });
  const got = [];
  for (let i = 0; i < want.length + 3; i++) {
    await p.keyboard.press("Tab");
    const d = await p.evaluate(() => (document.activeElement && document.activeElement !== document.body ? window.__a11y.describe(document.activeElement) : null));
    if (!d) break;
    if (got.length && d.split(" ")[0] === got[0].split(" ")[0]) break;
    got.push(d);
    const why = await p.evaluate(() => window.__a11y.focusProblem(document.activeElement));
    if (why) fail(where, "focus visible", `${d}: ${why}`);
  }
  // Shift+Tab from the END of the page walks the same stops backwards (r1 #8).
  await p.evaluate(() => { document.activeElement?.blur(); const t = document.createElement("span"); t.tabIndex = -1; document.body.append(t); t.focus(); t.remove(); });
  const back = [];
  for (let i = 0; i < got.length + 2; i++) {
    await p.keyboard.down("Shift"); await p.keyboard.press("Tab"); await p.keyboard.up("Shift");
    const d = await p.evaluate(() => (document.activeElement && document.activeElement !== document.body ? window.__a11y.describe(document.activeElement) : null));
    if (process.env.A11Y_DEBUG && !d) console.log("    back: focus left the page after", back.at(-1), await p.evaluate(() => [document.activeElement?.tagName, document.hasFocus()]));
    if (!d || (back.length && d.split(" ")[0] === back[0].split(" ")[0])) break;
    back.push(d);
  }
  const expectBack = [...got].reverse();
  if (back.slice(0, expectBack.length).map(key).join("|") !== expectBack.map(key).join("|")) {
    const k = expectBack.findIndex((e, i) => key(back[i] ?? "") !== key(e));
    if (process.env.A11Y_DEBUG) console.log("    forward:", got.slice(-6).join(" | "), "\n    back:", back.slice(0, 6).join(" | "));
    fail(where, "keyboard", `Shift+Tab doesn't walk the same stops backwards: at step ${k} expected ${expectBack[k]}, got ${back[k] ?? "nothing"}`);
  }
  // Compare by the scan's own element id only: a control's text can change while it has focus (a list that loads).
  const gotKeys = got.map(key);
  const missed = want.filter(w => !gotKeys.includes(key(w)));
  if (missed.length) fail(where, "keyboard", `not reached by Tab: ${missed.slice(0, 5).join(", ")}${missed.length > 5 ? ` (+${missed.length - 5})` : ""}`);
  const wantKeys = want.map(key), order = gotKeys.filter(g => wantKeys.includes(g));
  if (order.join("|") !== wantKeys.filter(w => gotKeys.includes(w)).join("|")) fail(where, "keyboard", "Tab order differs from the page order");
}
/** 1.4.10 at 320 CSS px; 1.4.4 (200% text) and 1.4.12 (text spacing) at the desktop width. */
async function reflow(p, where) {
  for (const [label, setup, width] of [["320px", null, 320], ["200% text", "html { font-size: 200% !important; }", 1280],
    ["text spacing", "* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }", 1280]]) {
    await p.setViewport({ width, height: 800 });
    const style = setup ? await p.addStyleTag({ content: setup }) : null;
    await new Promise(r => setTimeout(r, 100));
    const r = await p.evaluate(() => ({ wide: document.documentElement.scrollWidth > innerWidth + 1, clipped: window.__a11y.clipped(),
      culprits: [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('[role="region"][tabindex="0"], .scroll, .tabs, .sr-only, .skip'))
        .filter((el, _, all) => !all.some(o => o !== el && el.contains(o))).slice(0, 4).map(el => window.__a11y.describe(el) + ' ' + Math.round(el.getBoundingClientRect().right) + 'px') }));
    if (r.wide) fail(where, `reflow ${label}`, `the page scrolls sideways: ${r.culprits.join("; ")}`);
    for (const c of r.clipped) fail(where, `clipped ${label}`, c);
    if (style) await style.evaluate(s => s.remove());
  }
}
async function forcedColors(p, where) {
  await p.emulateMediaFeatures([{ name: "forced-colors", value: "active" }, REDUCED]);
  const bad = await p.evaluate(() => [...document.querySelectorAll("button, input:not([type=checkbox]):not([type=radio]):not(.sr-only), select, textarea, .button")]
    .filter(el => el.offsetWidth && getComputedStyle(el).borderStyle === "none" && !el.matches(".plain")).map(el => window.__a11y.describe(el)).slice(0, 5));
  for (const b of bad) fail(where, "forced colors", `${b} has no border`);
  await p.emulateMediaFeatures([{ name: "forced-colors", value: "none" }, REDUCED]);
}
async function coverage(p, labels) {
  const found = await p.evaluate((ls) => ls.filter(l => [...document.querySelectorAll("label, legend, caption, th, summary")].some(x => x.textContent.trim().startsWith(l))), labels);
  for (const l of found) seenControls.add(l);
}

/* ── Run ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function main() {
  if (!existsSync(join(ROOT, "dist/client/index.html"))) throw new Error("build the client first: npm run build");
  if (!existsSync(CHROME)) throw new Error(`no Chrome at ${CHROME} (set CHROME_PATH)`);
  const { app, origin, cookie, docs, login } = await startApp();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  const shots = process.env.A11Y_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });
  const expectAll = new Set();
  try {
    const only = process.env.A11Y_ONLY ? new RegExp(process.env.A11Y_ONLY) : null;
    const list = pages(docs, login).filter(pg => !only || only.test(pg.key));
    for (const theme of THEME_KEYS) {
      log(`theme ${theme}`);
      for (const pg of list) {
        const where = `${pg.key} [${theme}]`;
        const ctxB = await browser.createBrowserContext();
        const p = await ctxB.newPage();
        await p.setBypassCSP(true);
        p.on("pageerror", (err) => fail(where, "script error", String(err.message).slice(0, 200)));   // the test's own style overrides (zoom, text spacing) are inline styles
        await p.setViewport({ width: 1280, height: 900 });
        await p.emulateMediaFeatures([REDUCED]);
        await p.evaluateOnNewDocument(IN_PAGE);
        await p.evaluateOnNewDocument((t) => { try { localStorage.setItem("theme", t); } catch { /* fine */ } }, theme);
        if (!pg.signedOut) await ctxB.setCookie({ ...cookie, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" });
        if (!pg.signedOut) {   // the theme is an account preference: set it the way the Account page does
          await p.goto(`${origin}/account`, { waitUntil: "networkidle0" });
          await p.evaluate(async (t) => { const s = await (await fetch("/api/session")).json(); await fetch("/api/account/prefs", { method: "PUT", headers: { "content-type": "application/json", "x-csrf-token": s.csrf }, body: JSON.stringify({ theme: t }) }); }, theme);
        }
        await p.goto(origin + pg.url, { waitUntil: "networkidle0" });
        await settle(p);
        if (pg.tab) { await p.evaluate((t) => document.getElementById(`tab-${t}`)?.click(), pg.tab); await settle(p); }
        if (pg.open) { await p.evaluate(() => document.querySelectorAll("details:not([open])").forEach(d => { d.open = true; })); await settle(p); }
        if (pg.act) await pg.act(p);
        const title = await p.title();
        if (pg.title && !pg.title.test(title)) fail(where, "title", `"${title}"`);
        await axe(p, where);
        if (pg.expect) { pg.expect.forEach(e => expectAll.add(e)); await coverage(p, pg.expect); }
        if (theme === THEME_KEYS[0]) {   // the theme-independent checks once; focus contrast in every theme below
          await keyboard(p, where);
          if (pg.tab === "concept" || pg.tab === "karma") await tablist(p, where);
          for (const [label, press] of pg.saveFocus ?? []) await saveKeepsFocus(p, where, label, press);
          const motion = await p.evaluate(() => [...new Set(window.__motion)]);
          if (motion.length) fail(where, "reduced motion", motion.slice(0, 4).join("; "));
          await forcedColors(p, where);
          await reflow(p, where);
          if (shots) { await p.setViewport({ width: 1280, height: 900 }); await p.screenshot({ path: join(shots, `${pg.key.replace(/\W+/g, "-")}.png`), fullPage: true }); }
        }
        for (const width of [1280, 320]) { await p.setViewport({ width, height: 800 }); await keyboardFocusOnly(p, `${where} @${width}`); }
        await ctxB.close();
      }
    }
    for (const e of expectAll) if (!seenControls.has(e)) fail("coverage", "control never rendered", e);
  } finally {
    await browser.close();
    await app.close();
  }
  const report = { at: new Date().toISOString(), problems, incomplete: incomplete.filter(i => !i.reviewed) };
  writeFileSync(process.env.A11Y_REPORT || "a11y-report.json", `${JSON.stringify(report, null, 2)}\n`);
  log(problems.length ? `\n${problems.length} accessibility problem(s)` : "\nno accessibility problems");
  process.exitCode = problems.length ? 1 : 0;
}
/** Focus indicators in this theme and width, without the full traversal (contrast differs by theme). */
async function keyboardFocusOnly(p, where) {
  const n = await p.evaluate(() => window.__a11y.tabbable().length);
  await p.evaluate(() => { document.activeElement?.blur(); const t = document.createElement("span"); t.tabIndex = -1; document.body.prepend(t); t.focus(); t.remove(); });
  for (let i = 0; i < n + 2; i++) {
    await p.keyboard.press("Tab");
    const r = await p.evaluate(() => { const el = document.activeElement; return el && el !== document.body ? [window.__a11y.describe(el), window.__a11y.focusProblem(el)] : null; });
    if (!r) break;
    if (r[1]) fail(where, "focus visible", `${r[0]}: ${r[1]}`);
  }
}
/** The Character steps: an ARIA tablist (←/→/Home/End move selection and focus; r1 #3). */
async function tablist(p, where) {
  const ok = await p.evaluate(async () => {
    const tabs = [...document.querySelectorAll('[role="tablist"] [role="tab"]')];
    if (tabs.length < 2) return "no tabs";
    tabs[0].focus();
    const press = (key) => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    const wait = () => new Promise(r => setTimeout(r, 60));
    press("ArrowRight"); await wait();
    if (document.activeElement !== tabs[1] || tabs[1].getAttribute("aria-selected") !== "true") return "ArrowRight";
    press("End"); await wait();
    if (document.activeElement !== tabs.at(-1)) return "End";
    press("Home"); await wait();
    if (document.activeElement !== tabs[0]) return "Home";
    press("ArrowLeft"); await wait();
    if (document.activeElement !== tabs.at(-1)) return "ArrowLeft wraps";
    return null;
  });
  if (ok) fail(where, "tablist keys", ok);
}
/** A control that saves on change keeps focus through the save, and the save is announced (r2 #3, code r1 #1 #5). */
async function saveKeepsFocus(p, where, label, press) {
  const el = await p.evaluateHandle((l) => [...document.querySelectorAll("label")].find(x => x.textContent.trim().startsWith(l))?.querySelector("select, input"), label);
  if (!el.asElement()) return fail(where, "save focus", `no "${label}" control`);
  const statuses = () => p.evaluate(() => [...document.querySelectorAll('[role="status"]')].map(n => n.textContent.trim()).filter(Boolean));
  const before = await statuses();
  await el.asElement().focus();
  // A select: the next option, as a change event (ArrowDown opens the list on macOS instead of choosing).
  if (press === "ArrowDown") await p.evaluate((x) => { x.selectedIndex = (x.selectedIndex + 1) % x.options.length; x.dispatchEvent(new Event("change", { bubbles: true })); x.dispatchEvent(new Event("input", { bubbles: true })); }, el);
  else await p.keyboard.press(press);
  await settle(p);
  const r = await p.evaluate((x) => ({ still: document.activeElement === x, said: [...document.querySelectorAll('[role="status"]')].map(n => n.textContent.trim()).filter(Boolean) }), el);
  if (!r.still) fail(where, "save focus", `focus left "${label}" after its save`);
  // A status message that wasn't there before the change (r3 #1, r4 #1): the same filtering both times.
  if (!r.said.some(t => !before.includes(t))) fail(where, "save announced", `no NEW status message after "${label}" saved (r3 #1)`);
  if (press === "Space") { await p.keyboard.press("Space"); await settle(p); }   // put a checkbox back
}

main().catch(err => {
  console.error(err);
  // The run itself failed: still leave a report for CI to keep (r1 #10).
  try { writeFileSync(process.env.A11Y_REPORT || "a11y-report.json", `${JSON.stringify({ at: new Date().toISOString(), crashed: String(err?.stack ?? err).slice(0, 2000), problems }, null, 2)}\n`); } catch { /* nothing more to do */ }
  process.exitCode = 2;
});
