/** A tiny history router: no hash routes (the fragment is reserved for one-time link secrets). */
export const route = $state({ path: location.pathname });
export function go(path, { replace = false } = {}) {
  if (path !== location.pathname) history[replace ? "replaceState" : "pushState"](null, "", path);
  route.path = path;
  window.scrollTo(0, 0);
}
addEventListener("popstate", () => { route.path = location.pathname; });
/** Same-origin link clicks stay in the app. */
addEventListener("click", (ev) => {
  const a = ev.target.closest?.("a[href]");
  if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || a.target || a.hasAttribute("download")) return;
  if (a.getAttribute("href").startsWith("#")) return;   // an in-page link (the skip link): the browser's own job
  const url = new URL(a.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  ev.preventDefault();
  go(url.pathname);
});
/**
 * A one-time link's secret (`#k=…`), read and wiped from the address bar and history the instant the app's code
 * loads — before any request, so it can't sit in the URL behind a slow or failed one. Kept in memory only.
 */
export const linkSecret = (() => {
  const m = /^#k=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (location.hash) history.replaceState(null, "", location.pathname);
  return m ? m[1] : null;
})();
