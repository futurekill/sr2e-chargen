import { tick } from "svelte";
/**
 * Run a save and keep keyboard focus where it was (docs/PLAN-a11y.md r2 #3, WCAG 2.4.3): a control disabled while the
 * request runs drops focus to the page; once the page has re-rendered, focus goes back to it if it is still there.
 */
export async function keepFocus(fn) {
  const el = document.activeElement;
  try { return await fn(); }
  finally {
    await tick();
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost && el && el !== document.body && el.isConnected && !el.disabled) el.focus({ preventScroll: true });
  }
}

/**
 * A refused change, tied to the control that made it (3.3.1, code review r1 #4): the focused control is marked invalid
 * and described by the page's error message; the next accepted change clears it. Pass the message element's id, and
 * the control itself when it was captured before the request disabled it (code review r2 #1).
 */
export function flagFocused(errorId, el = document.activeElement) {
  clearFlags();
  if (!el || el === document.body || !el.matches("input, select, textarea")) return;
  el.setAttribute("aria-invalid", "true");
  el.setAttribute("aria-describedby", errorId);
  el.dataset.flagged = "1";
}
export function clearFlags() {
  for (const el of document.querySelectorAll("[data-flagged]")) { el.removeAttribute("aria-invalid"); el.removeAttribute("aria-describedby"); delete el.dataset.flagged; }
}
