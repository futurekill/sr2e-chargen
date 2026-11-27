/**
 * The help's screenshots (docs/PLAN-help-footer.md 1): the seeded app (tools/app-fixture.mjs) with the banter board
 * OFF, so captures are stable; each shot a region of one page at 1280 px in the Cyberpunk theme, written as WebP to
 * client/public/help/. Run after a page with a shot changes: `npm run build && npm run help:shots`, then LOOK at them.
 *   CHROME_PATH   the browser (default: the usual Chrome location for this OS)
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { startApp } from "./app-fixture.mjs";

const ROOT = new URL("../", import.meta.url).pathname, OUT = join(ROOT, "client/public/help");
const CHROME = process.env.CHROME_PATH || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/usr/bin/google-chrome");
const settle = (p) => new Promise(r => setTimeout(r, 300)).then(() => p.waitForNetworkIdle({ idleTime: 200, timeout: 8000 }).catch(() => {}));

/** Each shot: the page, what to do there, and the element whose top the 1280×720 picture starts at. */
const SHOTS = (docs) => [
  { file: "steps.webp", url: `/doc/${docs.creating}`, top: "h1" },
  { file: "print.webp", url: `/doc/${docs.finished}`, tab: "card", top: '[role="tabpanel"]:not([hidden]) h2, [role="tabpanel"]:not([hidden])' },
  { file: "mounts.webp", url: `/doc/${docs.mounts}`, top: "h1" },
  { file: "workshop.webp", url: `/doc/${docs.cleanDesign}`, top: "h1" },
  { file: "npc.webp", url: `/doc/${docs.npc}`, top: "h2#experience, h2", find: "Experience (p.187)", act: async (p) => {
    await p.evaluate(() => { const i = [...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith("Years of experience"))?.querySelector("input"); i.value = "25"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  } },
  { file: "account.webp", url: "/account", top: "h1" }
];

async function main() {
  if (!existsSync(join(ROOT, "dist/client/index.html"))) throw new Error("build the client first: npm run build");
  mkdirSync(OUT, { recursive: true });
  const { app, origin, cookie, docs } = await startApp({ prefs: { theme: "cyberpunk", readableFont: false, banter: false } });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  try {
    const ctx = await browser.createBrowserContext();
    await ctx.setCookie({ ...cookie, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" });
    const p = await ctx.newPage();
    await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    for (const s of SHOTS(docs)) {
      await p.goto(origin + s.url, { waitUntil: "networkidle0" });
      await settle(p);
      if (s.tab) { await p.evaluate((t) => document.getElementById(`tab-${t}`)?.click(), s.tab); await settle(p); }
      if (s.act) { await s.act(p); await settle(p); }
      const y = await p.evaluate((sel, find) => {
        const el = find ? [...document.querySelectorAll("h2")].find(h => h.textContent.trim() === find) : document.querySelector(sel);
        if (!el) return null;
        el.scrollIntoView({ block: "start" });
        return Math.max(0, el.getBoundingClientRect().top + window.scrollY - 16);
      }, s.top, s.find ?? null);
      if (y == null) throw new Error(`${s.file}: nothing to start at (${s.find ?? s.top})`);
      const png = await p.screenshot({ clip: { x: 0, y, width: 1280, height: 720 }, captureBeyondViewport: true });
      await sharp(png).webp({ quality: 82 }).toFile(join(OUT, s.file));
      console.log(`  ${s.file}`);
    }
  } finally {
    await browser.close();
    await app.close();
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
