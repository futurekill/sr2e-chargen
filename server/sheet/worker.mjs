/** The sheet render, in its own process (docs/PLAN-sheet.md draft 3): one job, one answer, then exit. */
import { sheetModel, cardModel } from "./model.mjs";
import { renderSheet, SheetError } from "./render.mjs";

export const MAX_PAGES = 30, MAX_BYTES = 10 * 1024 * 1024;
process.once("message", async ({ body, paper, font, style, card, fitOnly }) => {
  try {
    const model = card ? cardModel(body, card) : sheetModel(body);
    const out = await renderSheet(model, { paper, font, style });
    if (out.pages > MAX_PAGES) throw new SheetError(`This sheet would be ${out.pages} pages; the limit is ${MAX_PAGES}.`);
    if (out.pdf.length > MAX_BYTES) throw new SheetError("This sheet is too big to print.");
    process.send(fitOnly ? { fits: true, overflow: [] } : { pdf: out.pdf, pages: out.pages }, () => process.exit(0));
  } catch (err) {
    const user = err instanceof SheetError;
    if (fitOnly && user && err.overflow) process.send({ fits: false, overflow: err.overflow, message: err.message }, () => process.exit(0));
    else process.send({ error: user ? err.message : "The sheet couldn't be drawn.", user, overflow: err.overflow ?? null }, () => process.exit(0));
  }
});
