/** Jobs in their own process (docs/PLAN-sheet.md draft 3, docs/PLAN-portrait.md): one job, one answer, then exit. */
import { sheetModel, cardModel } from "./model.mjs";
import { renderSheet, SheetError } from "./render.mjs";
import { processPortrait, portraitJpeg } from "../portrait/process.mjs";
import { PortraitError } from "../portrait/check.mjs";

export const MAX_PAGES = 30, MAX_BYTES = 10 * 1024 * 1024;
const reply = (m) => process.send(m, () => process.exit(0));

process.once("message", async (msg) => {
  if (msg.job === "portrait") {
    try { const { webp, sha256 } = await processPortrait(Buffer.from(msg.input), msg.mime); reply({ webp, sha256, maxRSS: process.resourceUsage().maxRSS }); }
    catch (err) { reply(err instanceof PortraitError ? { error: err.message, status: err.status, code: err.code, user: true } : { error: "That image couldn't be read.", status: 422, code: "portrait-unreadable", user: true }); }
    return;
  }
  const { body, paper, font, style, card, fitOnly, portrait } = msg;
  try {
    const model = card ? cardModel(body, card) : sheetModel(body);
    if (portrait && !card) model.portrait = await portraitJpeg(Buffer.from(portrait));
    const out = await renderSheet(model, { paper, font, style });
    if (out.pages > MAX_PAGES) throw new SheetError(`This sheet would be ${out.pages} pages; the limit is ${MAX_PAGES}.`);
    if (out.pdf.length > MAX_BYTES) throw new SheetError("This sheet is too big to print.");
    reply(fitOnly ? { fits: true, overflow: [] } : { pdf: out.pdf, pages: out.pages });
  } catch (err) {
    const user = err instanceof SheetError;
    if (fitOnly && user && err.overflow) reply({ fits: false, overflow: err.overflow, message: err.message });
    else reply({ error: user ? err.message : "The sheet couldn't be drawn.", user, overflow: err.overflow ?? null });
  }
});
