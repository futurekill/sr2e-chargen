/**
 * A tiny history router: paths are routes; a fragment is an ordinary in-page anchor (`/help/garage#mounts`) — except
 * `#k=…`, a one-time link secret, which is wiped at load (docs/PLAN-help-footer.md 1, r1 #2).
 */
export const route = $state({ path: location.pathname, hash: /^#k=/.test(location.hash) ? "" : location.hash });
export function go(path, { replace = false, hash = "" } = {}) {
  const url = path + hash;
  if (url === location.pathname + location.hash && hash) {   // the same anchor again: just go back to it (r1 #3)
    const t = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (t) { if (!t.matches("a, button, input, select, textarea")) t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); t.scrollIntoView({ block: "start" }); }
    return;
  }
  if (url !== location.pathname + location.hash) history[replace ? "replaceState" : "pushState"](null, "", url);
  route.path = path;
  route.hash = hash;
  if (!hash) window.scrollTo(0, 0);   // with an anchor, App scrolls to it once the page has rendered
}
addEventListener("popstate", () => { route.path = location.pathname; route.hash = location.hash; });
/** Same-origin link clicks stay in the app (their anchor too). */
addEventListener("click", (ev) => {
  const a = ev.target.closest?.("a[href]");
  if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || a.target || a.hasAttribute("download")) return;
  if (a.getAttribute("href").startsWith("#")) return;   // an in-page link (the skip link): the browser's own job
  const url = new URL(a.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  ev.preventDefault();
  go(url.pathname, { hash: url.hash });
});
/**
 * A one-time link's secret (`#k=…`), read and wiped from the address bar and history the instant the app's code
 * loads — before any request, so it can't sit in the URL behind a slow or failed one. Kept in memory only.
 * Any other fragment is an ordinary anchor and stays.
 */
export const linkSecret = (() => {
  if (!/^#k=/.test(location.hash)) return null;
  const m = /^#k=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  history.replaceState(null, "", location.pathname);
  return m ? m[1] : null;
})();
