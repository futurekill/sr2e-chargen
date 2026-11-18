/** The sheet render, in its own process (docs/PLAN-sheet.md draft 3): one job, one answer, then exit. */
import { sheetModel } from "./model.mjs";
import { renderSheet, SheetError } from "./render.mjs";

export const MAX_PAGES = 30, MAX_BYTES = 10 * 1024 * 1024;
process.once("message", async ({ body, paper, font, style }) => {
  try {
    const out = await renderSheet(sheetModel(body), { paper, font, style });
    if (out.pages > MAX_PAGES) throw new SheetError(`This sheet would be ${out.pages} pages; the limit is ${MAX_PAGES}.`);
    if (out.pdf.length > MAX_BYTES) throw new SheetError("This sheet is too big to print.");
    process.send({ pdf: out.pdf, pages: out.pages }, () => process.exit(0));
  } catch (err) {
    process.send({ error: err instanceof SheetError ? err.message : "The sheet couldn't be drawn.", user: err instanceof SheetError }, () => process.exit(0));
  }
});
